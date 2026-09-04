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
  /**
   * Initializes the CoverageStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Supplies initial starter message or forwards user message if in correction mode.
   *
   * @param userMessage - Inbound user message.
   * @returns Message initiating or updating coverage selection.
   */
  public override onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Begin collecting coverage preferences. Do not calculate a premium.");
  }

  /**
   * Builds the prompt instructing the LLM to collect coverage limits (dwelling, deductible, liability, endorsements).
   *
   * @returns Formatted coverage prompt text.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      COVERAGE: JSON.stringify(this.getState<CoveragePreferences>("coverage") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  /**
   * Defines tool schemas for capturing coverage preferences and ending the quote.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "capture_home_coverage", description: "Validate and save the complete coverage preferences.", schema: CoveragePreferencesSchema },
      { name: "end_coverage_quote", description: "End the home quote during coverage selection.", schema: z.object({}) },
    ];
  }

  /**
   * Validates dwelling coverage amount, deductible, and endorsements, advancing to ReviewStep.
   *
   * @param args - Tool invocation arguments conforming to CoveragePreferencesSchema.
   * @returns Navigation response to ReviewStep or stay if validation fails.
   */
  @Tool
  protected async capture_home_coverage(args: unknown): Promise<ToolResponseType> {
    const parsed = CoveragePreferencesSchema.safeParse(args);
    if (!parsed.success) return stay("Use a supported dwelling amount, deductible, liability limit, and endorsement list.");
    this.saveState({ coverage: durableJson(parsed.data) });
    this.removeState("correctionMode");
    this.removeState("correctionRequest");
    return go(ReviewStep);
  }

  /**
   * Handles user exit during coverage selection.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_coverage_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and close the unfinished preliminary quote."));
  }
}
