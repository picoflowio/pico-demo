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
import { quoteConfig } from "./backend/quote-config.js";
import { QualificationSchema, type Qualification } from "./home-insurance-types.js";
import { durableJson, homeInsuranceCurrentDate, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { PropertyStep } from "./property-step.js";
import { ReferralStep } from "./referral-step.js";
import { ReviewStep } from "./review-step.js";

const Instructions = Prompt.file("prompt/qualification.md");

export class QualificationStep extends Step {
  /**
   * Initializes the QualificationStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Supplies initial starter message or forwards user message if in correction mode.
   *
   * @param userMessage - Inbound user message.
   * @returns Message to start or resume qualification.
   */
  public override onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Start the preliminary home insurance quote.");
  }

  /**
   * Builds the prompt instructing the LLM to collect qualification parameters (state, ZIP, occupancy, effective date).
   *
   * @returns Formatted prompt string.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      CURRENT_DATE: homeInsuranceCurrentDate().toISOString().slice(0, 10),
      SUPPORTED_STATES: JSON.stringify(quoteConfig.supportedStates),
      QUALIFICATION: JSON.stringify(this.getState<Qualification>("qualification") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  /**
   * Defines tool schemas for capturing qualification criteria and ending the session.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      {
        name: "capture_home_qualification",
        description: "Validate and save the complete home quote qualification.",
        schema: QualificationSchema,
      },
      {
        name: "end_qualification_quote",
        description: "End the home quote at the qualification stage.",
        schema: z.object({}),
      },
    ];
  }

  /**
   * Validates state, ZIP, occupancy, and effective date; routes unsupported states to ReferralStep
   * and qualified applicants to PropertyStep (or ReviewStep if correcting).
   *
   * @param args - Tool invocation payload matching QualificationSchema.
   * @returns Navigation response to ReferralStep, ReviewStep, PropertyStep, or stay if validation fails.
   */
  @Tool
  protected async capture_home_qualification(args: unknown): Promise<ToolResponseType> {
    const parsed = QualificationSchema.safeParse(args);
    if (!parsed.success) return stay("Collect a valid two-letter state, five-digit ZIP, purchase status, occupancy, and YYYY-MM-DD effective date.");
    const current = homeInsuranceCurrentDate();
    const effective = new Date(`${parsed.data.effectiveDate}T00:00:00.000Z`);
    const latest = new Date(current);
    latest.setUTCFullYear(latest.getUTCFullYear() + 1);
    if (Number.isNaN(effective.getTime()) || effective <= current || effective > latest) {
      return stay(`The effective date must be after ${current.toISOString().slice(0, 10)} and no more than one year later.`);
    }
    const qualification = durableJson(parsed.data);
    this.saveState({ qualification });
    const correctionMode = this.getState<boolean>("correctionMode") === true;
    this.removeState("correctionMode");
    this.removeState("correctionRequest");
    if (!quoteConfig.supportedStates.includes(qualification.state)) {
      return go(ReferralStep).withState({ decision: "unsupported", reasonCodes: ["UNSUPPORTED_STATE"] });
    }
    return correctionMode ? go(ReviewStep) : go(PropertyStep);
  }

  /**
   * Handles user exit during qualification.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_qualification_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer for considering Evergreen Home Insurance."));
  }
}
