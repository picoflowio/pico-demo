import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  direct,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import { BenefitsPresenter } from "./backend/benefits-presenter.js";
import { CommitEnrollmentStep } from "./commit-enrollment-step.js";
import { readEnrollmentApplication } from "./enrollment-application.js";
import type { HealthAccountElection } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { HealthAccountStep } from "./health-account-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/review.md");

export class EnrollmentReviewStep extends Step {
  /**
   * Initializes the EnrollmentReviewStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on enrollment review.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Generates a synthetic user prompt triggering comprehensive enrollment recap.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking for authoritative enrollment review.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the authoritative benefits enrollment review.");
  }

  /**
   * Builds the prompt instructing the LLM to present all elected benefits, payroll deductions, and pending requirements.
   *
   * @returns Formatted review prompt text.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      APPLICATION: JSON.stringify(readEnrollmentApplication(this.flow)),
    })}`;
  }

  /**
   * Declares tool schemas for showing review, adjusting health contributions, explaining pending requirements, and submitting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "show_benefits_enrollment_review", description: "Render the exact current enrollment review.", schema: z.object({}) },
      { name: "change_benefits_health_contribution", description: "Validate and update only the current HSA or healthcare-FSA employee contribution.", schema: z.object({ employeeAnnualContribution: z.number().int().min(0).max(20000) }) },
      { name: "explain_benefits_pending_requirement", description: "Explain a pending requirement already present in the application.", schema: z.object({ code: z.string().trim().min(1).max(100) }) },
      { name: "submit_benefits_enrollment", description: "Submit the reviewed elections after explicit confirmation.", schema: z.object({ confirmed: z.literal(true) }) },
      { name: "end_reviewed_benefits_enrollment", description: "End without submitting the reviewed elections.", schema: z.object({}) },
    ];
  }

  /**
   * Directly outputs the formatted enrollment review summary on initial step entry.
   *
   * @param llmResult - Model generation output.
   * @returns Formatted review summary or delegates to super.
   */
  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.review(readEnrollmentApplication(this.flow));
    }
    return super.onResponse(llmResult);
  }

  /**
   * Returns formatted enrollment review Markdown table directly to the user.
   *
   * @returns Direct tool response containing the review table.
   */
  @Tool
  protected async show_benefits_enrollment_review(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(BenefitsPresenter.review(readEnrollmentApplication(this.flow)));
  }

  /**
   * Adjusts the HSA or healthcare FSA annual contribution directly from the review step,
   * re-evaluating limits and re-rendering the updated review table.
   *
   * @param args - Object containing new annual contribution amount.
   * @returns Direct tool response with updated review table or stay if limits exceeded.
   */
  @Tool
  protected async change_benefits_health_contribution(args: { employeeAnnualContribution: number }): Promise<ToolResponseType> {
    const application = readEnrollmentApplication(this.flow);
    const election: HealthAccountElection = { ...application.healthAccount, employeeAnnualContribution: args.employeeAnnualContribution };
    const result = BenefitsPolicy.evaluateHealthAccount(application.selectedMedicalPlan, application.household.coverageTier, election);
    if (!result.accepted) return stay(result.reason);
    this.flow.saveStepState(HealthAccountStep, { election: durableBenefitsJson(election), result: durableBenefitsJson(result) });
    return direct(BenefitsPresenter.review(readEnrollmentApplication(this.flow)));
  }

  /**
   * Provides detailed explanation for a pending requirement code such as Evidence of Insurability (EOI).
   *
   * @param args - Requirement code string.
   * @returns Direct tool response explaining the requirement.
   */
  @Tool
  protected async explain_benefits_pending_requirement(args: { code: string }): Promise<ToolResponseType> {
    const application = readEnrollmentApplication(this.flow);
    const code = args.code.trim().toUpperCase();
    if (!application.ancillary.pendingRequirements.includes(code)) return stay(`Current pending requirements: ${application.ancillary.pendingRequirements.join(", ") || "none"}.`);
    if (code === "EVIDENCE_OF_INSURABILITY") {
      return direct("Evidence of insurability is a separate carrier review for the 3× supplemental-life election. The enrollment can be submitted now, but coverage above the guaranteed amount remains pending. No health details are collected in this chat.");
    }
    return direct(`${code} is pending and must be completed outside this fictional demo before the affected coverage becomes active.`);
  }

  /**
   * Confirms final submission of benefits elections and advances to CommitEnrollmentStep.
   *
   * @param args - Object with `confirmed: true`.
   * @returns Navigation response to CommitEnrollmentStep.
   */
  @Tool
  protected async submit_benefits_enrollment(args: { confirmed: true }): Promise<ToolResponseType> {
    if (!args.confirmed) return stay("Ask the employee to confirm submission or end without submitting.");
    this.saveState({ confirmedAt: new Date().toISOString() });
    return go(CommitEnrollmentStep);
  }

  /**
   * Handles user exit without submitting reviewed benefits elections.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_reviewed_benefits_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that the reviewed elections were not submitted."));
  }
}
