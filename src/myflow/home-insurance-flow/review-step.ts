import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import type { CoveragePreferences, PropertyProfile, Qualification, RiskProfile } from "./home-insurance-types.js";
import { terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { QualificationStep } from "./qualification-step.js";
import { PropertyStep } from "./property-step.js";
import { RiskStep } from "./risk-step.js";
import { CoverageStep } from "./coverage-step.js";
import { RateQuoteStep } from "./rate-quote-step.js";

const Instructions = Prompt.file("prompt/review.md");
const CorrectionSectionSchema = z.enum(["qualification", "property", "risk", "coverage"]);

export class ReviewStep extends Step {
  /**
   * Initializes the ReviewStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on application review.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Generates a synthetic user prompt triggering the authoritative review recap.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking for application summary.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Present the authoritative application summary and ask for confirmation or one correction.");
  }

  /**
   * Builds the application review prompt including all aggregated applicant data from previous steps.
   *
   * @returns Formatted review prompt text.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      APPLICATION: JSON.stringify(this.application()),
    })}`;
  }

  /**
   * Defines tool schemas for confirming the application, routing corrections to prior steps, or ending the session.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "confirm_home_application", description: "Confirm the reviewed application and run deterministic rating.", schema: z.object({ confirmed: z.literal(true) }) },
      { name: "correct_home_application", description: "Route one requested correction to the step that owns that information.", schema: z.object({ section: CorrectionSectionSchema, change: z.string().trim().min(1).max(500) }) },
      { name: "end_review_quote", description: "End the quote during application review.", schema: z.object({}) },
    ];
  }

  /**
   * Validates full completeness of the application and proceeds to deterministic rating (`RateQuoteStep`).
   *
   * @param args - Object confirming approval (`confirmed: true`).
   * @returns Navigation response to RateQuoteStep or stay if incomplete.
   */
  @Tool
  protected async confirm_home_application(args: { confirmed: true }): Promise<ToolResponseType> {
    if (!args.confirmed) return stay("Ask the customer to confirm or request a correction.");
    const application = this.application();
    if (Object.values(application).some((value) => value == null)) return stay("The application is incomplete. Ask which section the customer wants to finish.");
    this.saveState({ confirmedAt: new Date().toISOString() });
    return go(RateQuoteStep);
  }

  /**
   * Routes the user back to the appropriate step (Qualification, Property, Risk, or Coverage) to make requested edits.
   *
   * @param args - Section name and description of requested modification.
   * @returns Navigation response to the selected step with correction mode enabled.
   */
  @Tool
  protected async correct_home_application(args: { section: z.infer<typeof CorrectionSectionSchema>; change: string }): Promise<ToolResponseType> {
    const target = {
      qualification: QualificationStep,
      property: PropertyStep,
      risk: RiskStep,
      coverage: CoverageStep,
    }[args.section];
    return go(target)
      .withState({ correctionMode: true, correctionRequest: args.change })
      .withMessage(this.getLastMessage());
  }

  /**
   * Handles user exit during application review.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_review_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and close the reviewed preliminary quote without rating it."));
  }

  /**
   * Gathers and aggregates state slices from prior intake steps to assemble the complete quote application.
   *
   * @returns Aggregated application data object.
   */
  private application(): {
    qualification: Qualification | undefined;
    property: PropertyProfile | undefined;
    risk: RiskProfile | undefined;
    coverage: CoveragePreferences | undefined;
  } {
    return {
      qualification: this.flow.getStepState<Qualification>(QualificationStep, "qualification"),
      property: this.flow.getStepState<PropertyProfile>(PropertyStep, "property"),
      risk: this.flow.getStepState<RiskProfile>(RiskStep, "risk"),
      coverage: this.flow.getStepState<CoveragePreferences>(CoverageStep, "coverage"),
    };
  }
}
