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
  constructor(flow: Flow) { super(flow); }

  public onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Start the preliminary home insurance quote.");
  }

  public getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      CURRENT_DATE: homeInsuranceCurrentDate().toISOString().slice(0, 10),
      SUPPORTED_STATES: JSON.stringify(quoteConfig.supportedStates),
      QUALIFICATION: JSON.stringify(this.getState<Qualification>("qualification") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  public defineTool(): ToolType[] {
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

  @Tool
  protected async end_qualification_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer for considering Evergreen Home Insurance."));
  }
}
