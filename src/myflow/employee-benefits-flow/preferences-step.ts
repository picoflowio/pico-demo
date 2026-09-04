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
import { CarePreferencesSchema } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { PlanEvaluationStep } from "./plan-evaluation-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/preferences.md");

export class PreferencesStep extends Step {
  /**
   * Initializes the PreferencesStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Supplies initial synthetic prompt asking about care utilization and priorities without HIPAA violations.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Ask about broad care-use and plan priorities without requesting diagnoses or medication names.");
  }

  /**
   * Returns system prompt instructions for gathering healthcare use priorities and network preferences.
   *
   * @returns Formatted prompt string.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Instructions}`;
  }

  /**
   * Defines tool schemas for recording care preferences and ending the quote.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_preferences", description: "Save broad plan-selection preferences for deterministic comparison.", schema: CarePreferencesSchema },
      { name: "end_preferences_enrollment", description: "End enrollment during preference collection.", schema: z.object({}) },
    ];
  }

  /**
   * Validates care utilization expectations and priorities, advancing to deterministic plan comparison (`PlanEvaluationStep`).
   *
   * @param args - Tool invocation arguments matching CarePreferencesSchema.
   * @returns Navigation response to PlanEvaluationStep or stay if validation fails.
   */
  @Tool
  protected async capture_benefits_preferences(args: unknown): Promise<ToolResponseType> {
    const parsed = CarePreferencesSchema.safeParse(args);
    if (!parsed.success) return stay("Collect anticipated use, prescription-use frequency, network preference, and at least one supported priority.");
    this.saveState({ preferences: durableBenefitsJson(parsed.data) });
    return go(PlanEvaluationStep);
  }

  /**
   * Handles user exit during preference collection.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_preferences_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }
}
