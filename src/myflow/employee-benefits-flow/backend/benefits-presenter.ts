import type { EnrollmentApplication, MedicalPlanOption, PlanEvaluation } from "../employee-benefits-types.js";

/**
 * Formats a numeric amount as USD currency text ($0.00).
 *
 * @param value - Dollar amount.
 * @returns Formatted currency string.
 */
const money = (value: number): string => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class BenefitsPresenter {
  /**
   * Formats medical plan options into a comprehensive Markdown presentation table with recommendations.
   *
   * @param evaluation - Evaluated medical plans and fit rationale.
   * @returns Formatted Markdown string.
   */
  public static medicalPlans(evaluation: PlanEvaluation): string {
    const lines = [
      `### ${evaluation.planYear} medical plans — ${evaluation.coverageTier.replaceAll("_", " ")}`,
      "",
      "| ID | Plan | Per paycheck | Annual payroll | Family deductible | Family out-of-pocket max | HSA / employer funding | Out-of-network |",
      "|---|---|---:|---:|---:|---:|---|---|",
      ...evaluation.options.map((option) => `| ${option.id} | ${option.name} | ${money(option.employeePremiumPerPayPeriod)} | ${money(option.annualEmployeePremium)} | ${money(option.familyDeductible)} | ${money(option.familyOutOfPocketMaximum)} | ${option.hsaEligible ? `Yes / ${money(option.employerHsaContribution)}` : "No"} | ${option.outOfNetworkCoverage ? "Yes" : "No"} |`),
      "",
      `**Rule-based fit:** ${evaluation.recommendedPlanId}`,
      ...evaluation.recommendationReasons.map((reason) => `- ${reason}`),
      "",
      `Fictional demo terms under rules ${evaluation.rulesVersion}; this is decision support, not financial, tax, or medical advice. Verify the official plan documents and provider directory.`,
    ];
    return lines.join("\n");
  }

  /**
   * Renders a side-by-side comparison table for selected medical plan options.
   *
   * @param options - Array of MedicalPlanOption items to compare.
   * @returns Markdown comparison table.
   */
  public static compareMedicalPlans(options: MedicalPlanOption[]): string {
    return [
      "### Medical plan comparison",
      "",
      "| Plan | Per paycheck | Annual payroll | Family deductible | Family OOP max | Prescription terms | HSA / employer funding | Out-of-network |",
      "|---|---:|---:|---:|---:|---|---|---|",
      ...options.map((option) => `| ${option.name} (${option.id}) | ${money(option.employeePremiumPerPayPeriod)} | ${money(option.annualEmployeePremium)} | ${money(option.familyDeductible)} | ${money(option.familyOutOfPocketMaximum)} | ${option.prescriptionCoverage} | ${option.hsaEligible ? `Yes / ${money(option.employerHsaContribution)}` : "No"} | ${option.outOfNetworkCoverage ? "Yes" : "No"} |`),
      "",
      "These are fictional demo terms. Verify official plan documents before enrolling.",
    ].join("\n");
  }

  /**
   * Compares Basic vs Premium dental coverage terms for the household's coverage tier.
   *
   * @param tier - Household coverage tier string.
   * @returns Markdown dental comparison table.
   */
  public static dentalComparison(tier: string): string {
    const familyCoverage = tier !== "employee_only";
    return [
      "### Dental options",
      "",
      "| Option | Per paycheck | Annual maximum | Orthodontia |",
      "|---|---:|---:|---|",
      `| Basic | ${money(familyCoverage ? 28 : 12)} | ${money(1500)} | Not included |`,
      `| Premium | ${money(familyCoverage ? 48 : 21)} | ${money(2500)} | 50% up to a ${money(2000)} lifetime maximum |`,
      "| Waive | $0.00 | — | — |",
      "",
      "Fictional demo terms; the official certificate controls.",
    ].join("\n");
  }

  /**
   * Generates a descriptive explanation of supplemental life insurance coverage and deductions.
   *
   * @param multiple - Salary multiple (1, 2, or 3).
   * @param annualSalary - Base salary of employee.
   * @returns Explanation text string.
   */
  public static lifeExplanation(multiple: number, annualSalary: number): string {
    const coverage = annualSalary * multiple;
    const perPaycheck = Math.round((coverage / 1000) * 0.04 * 100) / 100;
    return [
      `Supplemental life at ${multiple}× salary provides ${money(coverage)} of fictional demo coverage for ${money(perPaycheck)} per paycheck.`,
      multiple === 3 ? "This amount requires evidence of insurability. The election can be submitted, but coverage above the guaranteed amount remains pending until approved." : "This amount does not require evidence of insurability under the fictional demo rules.",
      "No health details are collected in this chat.",
    ].join(" ");
  }

  /**
   * Explains dependent-care FSA purpose, difference from healthcare FSA, and statutory limits.
   *
   * @returns Explanatory text string.
   */
  public static dependentCareExplanation(): string {
    return "The dependent-care FSA can reimburse eligible work-related childcare expenses under the fictional demo plan. It is separate from a healthcare FSA, has a $5,000 annual demo limit, and tax eligibility should be verified with the official plan materials or a tax adviser. Would you like to elect an annual contribution amount or waive this benefit with $0?";
  }

  /**
   * Formats the comprehensive benefits election review recap before final submission.
   *
   * @param application - Aggregated benefits application.
   * @returns Formatted Markdown summary.
   */
  public static review(application: EnrollmentApplication): string {
    const employee = application.eligibility.employee!;
    return [
      `### Benefits enrollment review for ${employee.name}`,
      "",
      `- Plan year / event: ${application.request.planYear} / ${application.request.eventType.replaceAll("_", " ")}`,
      `- Household: ${application.household.coverageTier.replaceAll("_", " ")} with ${application.household.dependents.map((dependent) => dependent.name).join(", ")}`,
      `- Medical: ${application.selectedMedicalPlan.name} (${application.selectedMedicalPlan.id}), ${money(application.selectedMedicalPlan.employeePremiumPerPayPeriod)} per paycheck`,
      `- Health account: ${application.healthAccount.accountType.toUpperCase()}, employee ${money(application.healthAccount.employeeAnnualContribution)} + employer ${money(application.healthAccountResult.employerContribution)} annually`,
      `- Dental / vision: ${application.ancillary.dentalPlan} / ${application.ancillary.visionPlan}`,
      `- Supplemental life: ${application.ancillary.supplementalLifeMultiple}× salary (${money(application.ancillary.supplementalLifeCoverage)})`,
      `- Disability: short-term ${application.ancillary.shortTermDisability ? "elected" : "waived"}; long-term ${application.ancillary.longTermDisability ? "elected" : "waived"}`,
      `- Beneficiaries: ${application.beneficiaries.beneficiaries.map((beneficiary) => `${beneficiary.name} ${beneficiary.percentage}%`).join(", ")}`,
      `- Dependent-care FSA: ${money(application.dependentCare.annualContribution)} annually`,
      `- Ancillary payroll cost: ${money(application.ancillary.employeePremiumPerPayPeriod)} per paycheck`,
      `- Pending requirements: ${application.ancillary.pendingRequirements.length ? application.ancillary.pendingRequirements.join(", ") : "none"}`,
      "",
      "Confirm submission or request a contribution correction. Official plan documents control, and pending evidence-of-insurability coverage is not active until approved.",
    ].join("\n");
  }
}
