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
  /**
   * Initializes the PresentQuoteStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry and resets selections if the quote ID changed.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
    const quoteId = this.quoteResult().quoteId;
    if (this.getState<string>("presentedQuoteId") !== quoteId) {
      this.removeState("selectedOption");
      this.saveState({ presentedQuoteId: quoteId });
    }
  }

  /**
   * Supplies initial synthetic user prompt triggering quote presentation.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking to view quote options.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the current quote options exactly.");
  }

  /**
   * Builds the prompt instructing the LLM to present authoritative quote packages and comparison tables.
   *
   * @returns Formatted presentation prompt text.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      QUOTE_RESULT: JSON.stringify(this.quoteResult()),
      SELECTED_OPTION: JSON.stringify(this.getState<QuoteOption>("selectedOption") ?? null),
    })}`;
  }

  /**
   * Declares tool schemas for showing options, comparing packages, adjusting deductibles, and selecting an option.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "show_home_quote_options", description: "Render the exact current quote options without model-authored prices.", schema: z.object({}) },
      { name: "compare_home_quote_options", description: "Render an exact comparison of current option IDs.", schema: z.object({ optionIds: z.array(z.string().min(1)).min(1).max(3) }) },
      { name: "change_home_quote_deductible", description: "Change the deductible and deterministically re-rate the application.", schema: z.object({ deductible: DeductibleSchema }) },
      { name: "select_home_quote_option", description: "Select one exact current quote option for optional agent follow-up.", schema: z.object({ optionId: z.string().min(1) }) },
      { name: "end_present_quote", description: "End the home quote while preserving its reference number.", schema: z.object({}) },
    ];
  }

  /**
   * Intercepts response to present the exact rendered quote options on initial step entry.
   *
   * @param llmResult - Model response output.
   * @returns Direct quote options text or delegates to super.
   */
  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return QuotePresenter.options(this.quoteResult());
    }
    return super.onResponse(llmResult);
  }

  /**
   * Returns formatted package options directly to the user without additional model generation.
   *
   * @returns Direct tool response displaying quote packages.
   */
  @Tool
  protected async show_home_quote_options(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(QuotePresenter.options(this.quoteResult()));
  }

  /**
   * Renders a side-by-side comparison table for selected package option IDs.
   *
   * @param args - Object containing array of `optionIds` to compare.
   * @returns Direct tool response containing Markdown comparison table.
   */
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

  /**
   * Updates the chosen deductible in coverage state and triggers re-rating via `RateQuoteStep`.
   *
   * @param args - Object containing new deductible amount.
   * @returns Navigation response to RateQuoteStep.
   */
  @Tool
  protected async change_home_quote_deductible(args: { deductible: z.infer<typeof DeductibleSchema> }): Promise<ToolResponseType> {
    const coverage = this.flow.getStepState<CoveragePreferences>(CoverageStep, "coverage");
    if (!coverage) throw new Error("PresentQuoteStep requires CoverageStep.coverage.");
    this.flow.saveStepState(CoverageStep, { coverage: durableJson({ ...coverage, deductible: args.deductible }) });
    this.removeState("selectedOption");
    return go(RateQuoteStep);
  }

  /**
   * Records customer's selected quote package and navigates to `ContactStep` for follow-up details.
   *
   * @param args - Object containing `optionId`.
   * @returns Navigation response to ContactStep.
   */
  @Tool
  protected async select_home_quote_option(args: { optionId: string }): Promise<ToolResponseType> {
    const result = this.quoteResult();
    const option = result.options.find((candidate) => candidate.id === args.optionId.trim().toUpperCase());
    if (!option) return stay(`Choose one current option ID: ${result.options.map((candidate) => candidate.id).join(", ")}.`);
    this.saveState({ selectedOption: durableJson(option) });
    return go(ContactStep);
  }

  /**
   * Handles user exit, providing the durable quote ID and validity expiration date.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_present_quote(): Promise<ToolResponseType> {
    const result = this.quoteResult();
    return go(TerminateSessionStep).withPrompt(terminalPrompt(`Thank the customer and provide quote reference ${result.quoteId}, valid through ${result.validThrough}.`));
  }

  /**
   * Loads the eligible rating result from RateQuoteStep state or throws an error.
   *
   * @returns Active QuoteResult object.
   */
  private quoteResult(): QuoteResult {
    const result = this.flow.getStepState<QuoteResult>(RateQuoteStep, "quoteResult");
    if (!result || result.decision !== "eligible") throw new Error("PresentQuoteStep requires an eligible quote result.");
    return result;
  }
}
