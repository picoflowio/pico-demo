import { Flow, LogicStep, TerminateSessionStep, go, type LogicResponseType } from "@picoflow/core";
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import { readEnrollmentApplication } from "./enrollment-application.js";
import { benefitsTerminalPrompt, durableBenefitsJson, employeeBenefitsCurrentDate } from "./employee-benefits-utils.js";

export class CommitEnrollmentStep extends LogicStep {
  constructor(flow: Flow) { super(flow); }

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
