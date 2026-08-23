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
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the authoritative benefits enrollment review.");
  }

  public getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      APPLICATION: JSON.stringify(readEnrollmentApplication(this.flow)),
    })}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "show_benefits_enrollment_review", description: "Render the exact current enrollment review.", schema: z.object({}) },
      { name: "change_benefits_health_contribution", description: "Validate and update only the current HSA or healthcare-FSA employee contribution.", schema: z.object({ employeeAnnualContribution: z.number().int().min(0).max(20000) }) },
      { name: "explain_benefits_pending_requirement", description: "Explain a pending requirement already present in the application.", schema: z.object({ code: z.string().trim().min(1).max(100) }) },
      { name: "submit_benefits_enrollment", description: "Submit the reviewed elections after explicit confirmation.", schema: z.object({ confirmed: z.literal(true) }) },
      { name: "end_reviewed_benefits_enrollment", description: "End without submitting the reviewed elections.", schema: z.object({}) },
    ];
  }

  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.review(readEnrollmentApplication(this.flow));
    }
    return super.onResponse(llmResult);
  }

  @Tool
  protected async show_benefits_enrollment_review(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(BenefitsPresenter.review(readEnrollmentApplication(this.flow)));
  }

  @Tool
  protected async change_benefits_health_contribution(args: { employeeAnnualContribution: number }): Promise<ToolResponseType> {
    const application = readEnrollmentApplication(this.flow);
    const election: HealthAccountElection = { ...application.healthAccount, employeeAnnualContribution: args.employeeAnnualContribution };
    const result = BenefitsPolicy.evaluateHealthAccount(application.selectedMedicalPlan, application.household.coverageTier, election);
    if (!result.accepted) return stay(result.reason);
    this.flow.saveStepState(HealthAccountStep, { election: durableBenefitsJson(election), result: durableBenefitsJson(result) });
    return direct(BenefitsPresenter.review(readEnrollmentApplication(this.flow)));
  }

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

  @Tool
  protected async submit_benefits_enrollment(args: { confirmed: true }): Promise<ToolResponseType> {
    if (!args.confirmed) return stay("Ask the employee to confirm submission or end without submitting.");
    this.saveState({ confirmedAt: new Date().toISOString() });
    return go(CommitEnrollmentStep);
  }

  @Tool
  protected async end_reviewed_benefits_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that the reviewed elections were not submitted."));
  }
}
