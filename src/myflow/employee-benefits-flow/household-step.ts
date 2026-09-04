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
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import { HouseholdSchema } from "./employee-benefits-types.js";
import type { EnrollmentRequest } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { EligibilityStep } from "./eligibility-step.js";
import { PreferencesStep } from "./preferences-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/household.md");

export class HouseholdStep extends Step {
  constructor(flow: Flow) { super(flow); }

  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Collect the people who should be covered.");
  }

  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Instructions}`;
  }

  public override defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_household", description: "Validate and save the complete covered household.", schema: HouseholdSchema },
      { name: "end_household_enrollment", description: "End enrollment during household collection.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_benefits_household(args: unknown): Promise<ToolResponseType> {
    const parsed = HouseholdSchema.safeParse(args);
    if (!parsed.success) return stay("Collect a supported coverage tier, each covered dependent's name, relationship and birth date, plus spouse other-coverage status when applicable.");
    const request = this.flow.getStepState<EnrollmentRequest>(EligibilityStep, "request");
    if (!request) throw new Error("HouseholdStep requires EligibilityStep.request.");
    const validationError = BenefitsPolicy.validateHousehold(parsed.data, request.planYear);
    if (validationError) return stay(validationError);
    this.saveState({ household: durableBenefitsJson(parsed.data) });
    return go(PreferencesStep);
  }

  @Tool
  protected async end_household_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no household elections were submitted."));
  }
}
