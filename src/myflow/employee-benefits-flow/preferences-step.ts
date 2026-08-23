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
  constructor(flow: Flow) { super(flow); }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Ask about broad care-use and plan priorities without requesting diagnoses or medication names.");
  }

  public getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Instructions}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_preferences", description: "Save broad plan-selection preferences for deterministic comparison.", schema: CarePreferencesSchema },
      { name: "end_preferences_enrollment", description: "End enrollment during preference collection.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_benefits_preferences(args: unknown): Promise<ToolResponseType> {
    const parsed = CarePreferencesSchema.safeParse(args);
    if (!parsed.success) return stay("Collect anticipated use, prescription-use frequency, network preference, and at least one supported priority.");
    this.saveState({ preferences: durableBenefitsJson(parsed.data) });
    return go(PlanEvaluationStep);
  }

  @Tool
  protected async end_preferences_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }
}
