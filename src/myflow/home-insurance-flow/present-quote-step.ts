import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  direct,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { QuotePresenter } from "./backend/quote-presenter.js";
import type { CoveragePreferences, QuoteOption, QuoteResult } from "./home-insurance-types.js";
import { durableJson, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { CoverageStep } from "./coverage-step.js";
import { ContactStep } from "./contact-step.js";
import { RateQuoteStep } from "./rate-quote-step.js";

const Instructions = Prompt.file("prompt/present.md");
const DeductibleSchema = z.union([z.literal(1000), z.literal(2500), z.literal(5000)]);

export class PresentQuoteStep extends Step {
  constructor(flow: Flow) { super(flow); }

  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
    const quoteId = this.quoteResult().quoteId;
    if (this.getState<string>("presentedQuoteId") !== quoteId) {
      this.removeState("selectedOption");
      this.saveState({ presentedQuoteId: quoteId });
    }
  }

  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the current quote options exactly.");
  }

  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      QUOTE_RESULT: JSON.stringify(this.quoteResult()),
      SELECTED_OPTION: JSON.stringify(this.getState<QuoteOption>("selectedOption") ?? null),
    })}`;
  }

  public override defineTool(): ToolType[] {
    return [
      { name: "show_home_quote_options", description: "Render the exact current quote options without model-authored prices.", schema: z.object({}) },
      { name: "compare_home_quote_options", description: "Render an exact comparison of current option IDs.", schema: z.object({ optionIds: z.array(z.string().min(1)).min(1).max(3) }) },
      { name: "change_home_quote_deductible", description: "Change the deductible and deterministically re-rate the application.", schema: z.object({ deductible: DeductibleSchema }) },
      { name: "select_home_quote_option", description: "Select one exact current quote option for optional agent follow-up.", schema: z.object({ optionId: z.string().min(1) }) },
      { name: "end_present_quote", description: "End the home quote while preserving its reference number.", schema: z.object({}) },
    ];
  }

  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return QuotePresenter.options(this.quoteResult());
    }
    return super.onResponse(llmResult);
  }

  @Tool
  protected async show_home_quote_options(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(QuotePresenter.options(this.quoteResult()));
  }

  @Tool
  protected async compare_home_quote_options(args: { optionIds: string[] }): Promise<ToolResponseType> {
    const result = this.quoteResult();
    const requested = [...new Set(args.optionIds.map((id) => id.trim().toUpperCase()))];
    const options = requested.flatMap((id) => {
      const option = result.options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    });
    if (options.length !== requested.length) return stay(`Choose only current option IDs: ${result.options.map((option) => option.id).join(", ")}.`);
    return direct(QuotePresenter.comparison(options));
  }

  @Tool
  protected async change_home_quote_deductible(args: { deductible: z.infer<typeof DeductibleSchema> }): Promise<ToolResponseType> {
    const coverage = this.flow.getStepState<CoveragePreferences>(CoverageStep, "coverage");
    if (!coverage) throw new Error("PresentQuoteStep requires CoverageStep.coverage.");
    this.flow.saveStepState(CoverageStep, { coverage: durableJson({ ...coverage, deductible: args.deductible }) });
    this.removeState("selectedOption");
    return go(RateQuoteStep);
  }

  @Tool
  protected async select_home_quote_option(args: { optionId: string }): Promise<ToolResponseType> {
    const result = this.quoteResult();
    const option = result.options.find((candidate) => candidate.id === args.optionId.trim().toUpperCase());
    if (!option) return stay(`Choose one current option ID: ${result.options.map((candidate) => candidate.id).join(", ")}.`);
    this.saveState({ selectedOption: durableJson(option) });
    return go(ContactStep);
  }

  @Tool
  protected async end_present_quote(): Promise<ToolResponseType> {
    const result = this.quoteResult();
    return go(TerminateSessionStep).withPrompt(terminalPrompt(`Thank the customer and provide quote reference ${result.quoteId}, valid through ${result.validThrough}.`));
  }

  private quoteResult(): QuoteResult {
    const result = this.flow.getStepState<QuoteResult>(RateQuoteStep, "quoteResult");
    if (!result || result.decision !== "eligible") throw new Error("PresentQuoteStep requires an eligible quote result.");
    return result;
  }
}
