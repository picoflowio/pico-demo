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
import { CoveragePreferencesSchema, type CoveragePreferences } from "./home-insurance-types.js";
import { durableJson, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { ReviewStep } from "./review-step.js";

const Instructions = Prompt.file("prompt/coverage.md");

export class CoverageStep extends Step {
  constructor(flow: Flow) { super(flow); }

  public onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Begin collecting coverage preferences. Do not calculate a premium.");
  }

  public getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      COVERAGE: JSON.stringify(this.getState<CoveragePreferences>("coverage") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "capture_home_coverage", description: "Validate and save the complete coverage preferences.", schema: CoveragePreferencesSchema },
      { name: "end_coverage_quote", description: "End the home quote during coverage selection.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_home_coverage(args: unknown): Promise<ToolResponseType> {
    const parsed = CoveragePreferencesSchema.safeParse(args);
    if (!parsed.success) return stay("Use a supported dwelling amount, deductible, liability limit, and endorsement list.");
    this.saveState({ coverage: durableJson(parsed.data) });
    this.removeState("correctionMode");
    this.removeState("correctionRequest");
    return go(ReviewStep);
  }

  @Tool
  protected async end_coverage_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and close the unfinished preliminary quote."));
  }
}
