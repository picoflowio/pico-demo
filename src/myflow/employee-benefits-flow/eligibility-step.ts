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
import { EnrollmentRequestSchema } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson, employeeBenefitsCurrentDate } from "./employee-benefits-utils.js";
import { HouseholdStep } from "./household-step.js";
import { IneligibleBenefitsStep } from "./ineligible-benefits-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/eligibility.md");

export class EligibilityStep extends Step {
  /**
   * Initializes the EligibilityStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Supplies initial synthetic user prompt triggering benefits enrollment.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message to start enrollment.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Start the fictional employee benefits enrollment.");
  }

  /**
   * Builds the prompt instructing the LLM to collect employee ID, enrollment event, and plan year.
   *
   * @returns Formatted eligibility prompt string.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      CURRENT_DATE: employeeBenefitsCurrentDate().toISOString().slice(0, 10),
    })}`;
  }

  /**
   * Defines tool schemas for evaluating employee eligibility and exiting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "check_benefits_eligibility", description: "Validate the enrollment request and check the fictional employee directory and enrollment rules.", schema: EnrollmentRequestSchema },
      { name: "end_benefits_enrollment", description: "End benefits enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Evaluates employee eligibility against the corporate directory and enrollment window rules,
   * advancing to HouseholdStep if eligible, or IneligibleBenefitsStep if not.
   *
   * @param args - Tool invocation arguments matching EnrollmentRequestSchema.
   * @returns Navigation response to HouseholdStep or IneligibleBenefitsStep.
   */
  @Tool
  protected async check_benefits_eligibility(args: unknown): Promise<ToolResponseType> {
    const parsed = EnrollmentRequestSchema.safeParse(args);
    if (!parsed.success) return stay("Collect employee ID in E-0000 format, plan year, event type, and a YYYY-MM-DD event date when applicable.");
    if (parsed.data.eventType === "open_enrollment" && parsed.data.eventDate !== null) return stay("For open enrollment, eventDate must be null.");
    const decision = BenefitsPolicy.evaluateEligibility(parsed.data, employeeBenefitsCurrentDate());
    this.saveState({ request: durableBenefitsJson(parsed.data), decision: durableBenefitsJson(decision) });
    if (!decision.eligible) return go(IneligibleBenefitsStep).withState({ decision: durableBenefitsJson(decision) });
    return go(HouseholdStep);
  }

  /**
   * Handles user exit during eligibility determination.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_benefits_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }
}
