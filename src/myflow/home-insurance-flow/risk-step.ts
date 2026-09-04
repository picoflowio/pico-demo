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
import { RiskProfileSchema, type RiskProfile } from "./home-insurance-types.js";
import { durableJson, homeInsuranceCurrentDate, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { CoverageStep } from "./coverage-step.js";
import { ReviewStep } from "./review-step.js";

const Instructions = Prompt.file("prompt/risk.md");

export class RiskStep extends Step {
  constructor(flow: Flow) { super(flow); }

  public override onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Begin the claims, hazards, and protection questions.");
  }

  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      RISK: JSON.stringify(this.getState<RiskProfile>("risk") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  public override defineTool(): ToolType[] {
    return [
      { name: "capture_home_risk", description: "Validate and save the complete claims, hazards, and protection profile.", schema: RiskProfileSchema },
      { name: "end_risk_quote", description: "End the home quote during risk collection.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_home_risk(args: unknown): Promise<ToolResponseType> {
    const parsed = RiskProfileSchema.safeParse(args);
    if (!parsed.success) return stay("Collect claims with year, type, and amount, plus every hazard and protection boolean.");
    const currentYear = homeInsuranceCurrentDate().getUTCFullYear();
    if (parsed.data.claims.some((claim) => claim.year > currentYear)) return stay("A claim year cannot be in the future.");
    this.saveState({ risk: durableJson(parsed.data) });
    const correctionMode = this.getState<boolean>("correctionMode") === true;
    this.removeState("correctionMode");
    this.removeState("correctionRequest");
    return correctionMode ? go(ReviewStep) : go(CoverageStep);
  }

  @Tool
  protected async end_risk_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and close the unfinished preliminary quote."));
  }
}
