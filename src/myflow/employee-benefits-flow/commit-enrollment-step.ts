import { Flow, LogicStep, TerminateSessionStep, go, type LogicResponseType } from "@picoflow/core";
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import { readEnrollmentApplication } from "./enrollment-application.js";
import { benefitsTerminalPrompt, durableBenefitsJson, employeeBenefitsCurrentDate } from "./employee-benefits-utils.js";

export class CommitEnrollmentStep extends LogicStep {
  /**
   * Initializes the CommitEnrollmentStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Generates a permanent enrollment record from application elections, records state,
   * and navigates to TerminateSessionStep with enrollment confirmation and payroll deductions.
   *
   * @returns Navigation response to TerminateSessionStep.
   */
  public override async runLogic(): Promise<LogicResponseType> {
    const record = BenefitsPolicy.createEnrollment(readEnrollmentApplication(this.flow), employeeBenefitsCurrentDate());
    this.saveState({ enrollmentRecord: durableBenefitsJson(record) });
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt([
      `Confirm enrollment ${record.enrollmentId} for plan year ${record.planYear}.`,
      `State status ${record.status}, effective date ${record.effectiveDate}, medical plan ${record.medicalPlanId}, and total estimated payroll deduction $${record.totalPayrollDeductionPerPayPeriod.toFixed(2)} per paycheck.`,
      `List pending requirements: ${record.pendingRequirements.join(", ") || "none"}.`,
      "Confirm that no payment was taken in chat.",
    ].join(" ")));
  }
}
