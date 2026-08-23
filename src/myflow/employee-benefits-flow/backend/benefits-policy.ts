import { createHash } from "node:crypto";
import type {
  AncillaryElection,
  AncillaryQuote,
  CarePreferences,
  DependentCareElection,
  DependentCareResult,
  EligibilityDecision,
  EmployeeProfile,
  EnrollmentApplication,
  EnrollmentRecord,
  EnrollmentRequest,
  HealthAccountElection,
  HealthAccountResult,
  Household,
  MedicalPlanOption,
  PlanEvaluation,
} from "../employee-benefits-types.js";

const RULES_VERSION = "benefits-demo-2027.1";
const OPEN_ENROLLMENT_START = "2026-11-01";
const OPEN_ENROLLMENT_END = "2026-11-20";
const HSA_LIMITS = { employee_only: 4500, employee_spouse: 9000, employee_children: 9000, family: 9000 } as const;
const DEPENDENT_CARE_LIMIT = 5000;

const employees: Record<string, EmployeeProfile> = {
  "E-1042": {
    employeeId: "E-1042",
    name: "Alex Rivera",
    state: "OR",
    employmentStatus: "active",
    weeklyHours: 40,
    hireDate: "2024-06-10",
    annualSalary: 78000,
    payPeriods: 24,
  },
  "E-2040": {
    employeeId: "E-2040",
    name: "Taylor Morgan",
    state: "CA",
    employmentStatus: "active",
    weeklyHours: 20,
    hireDate: "2025-02-01",
    annualSalary: 42000,
    payPeriods: 24,
  },
};

const perPayPeriodPremiums: Record<MedicalPlanOption["id"], Record<Household["coverageTier"], number>> = {
  EPO_VALUE: { employee_only: 45, employee_spouse: 105, employee_children: 95, family: 155 },
  HDHP_HSA: { employee_only: 35, employee_spouse: 85, employee_children: 75, family: 125 },
  PPO_STANDARD: { employee_only: 80, employee_spouse: 160, employee_children: 145, family: 220 },
};

const providerNetworks: Record<string, MedicalPlanOption["id"][]> = {
  "dr maya chen": ["HDHP_HSA", "PPO_STANDARD"],
  "dr chen": ["HDHP_HSA", "PPO_STANDARD"],
};

export class BenefitsPolicy {
  public static readonly rulesVersion = RULES_VERSION;

  public static evaluateEligibility(request: EnrollmentRequest, currentDate: Date): EligibilityDecision {
    const employee = employees[request.employeeId] ?? null;
    const reasons: string[] = [];
    if (!employee) reasons.push("EMPLOYEE_NOT_FOUND");
    if (employee && employee.employmentStatus !== "active") reasons.push("EMPLOYMENT_NOT_ACTIVE");
    if (employee && employee.weeklyHours < 30) reasons.push("MINIMUM_HOURS_NOT_MET");
    if (request.planYear !== 2027) reasons.push("UNSUPPORTED_PLAN_YEAR");

    const current = currentDate.toISOString().slice(0, 10);
    let deadline: string | null = null;
    if (request.eventType === "open_enrollment") {
      deadline = OPEN_ENROLLMENT_END;
      if (current < OPEN_ENROLLMENT_START || current > OPEN_ENROLLMENT_END) reasons.push("OPEN_ENROLLMENT_CLOSED");
    } else {
      if (!request.eventDate) reasons.push("EVENT_DATE_REQUIRED");
      if (request.eventDate) {
        const elapsedDays = Math.floor((currentDate.getTime() - new Date(`${request.eventDate}T00:00:00.000Z`).getTime()) / 86_400_000);
        if (elapsedDays < 0 || elapsedDays > 30) reasons.push("EVENT_WINDOW_CLOSED");
        const deadlineDate = new Date(`${request.eventDate}T00:00:00.000Z`);
        deadlineDate.setUTCDate(deadlineDate.getUTCDate() + 30);
        deadline = deadlineDate.toISOString().slice(0, 10);
      }
    }

    return { eligible: reasons.length === 0, reasonCodes: reasons, enrollmentDeadline: deadline, employee, rulesVersion: RULES_VERSION };
  }

  public static validateHousehold(household: Household, planYear: number): string | null {
    const spouses = household.dependents.filter((dependent) => dependent.relationship !== "child");
    const children = household.dependents.filter((dependent) => dependent.relationship === "child");
    if (spouses.length > 1) return "Only one covered spouse or domestic partner is supported in this demo.";
    if (household.coverageTier === "employee_only" && household.dependents.length > 0) return "Employee-only coverage cannot include dependents.";
    if (household.coverageTier === "employee_spouse" && (spouses.length !== 1 || children.length > 0)) return "Employee-plus-spouse coverage requires exactly one spouse or domestic partner and no children.";
    if (household.coverageTier === "employee_children" && (children.length === 0 || spouses.length > 0)) return "Employee-plus-children coverage requires at least one child and no spouse or partner.";
    if (household.coverageTier === "family" && (spouses.length !== 1 || children.length === 0)) return "Family coverage requires one spouse or partner and at least one child.";
    if (spouses.length > 0 && household.spouseHasOtherMedicalCoverage == null) return "Ask whether the covered spouse or partner has access to other medical coverage.";
    if (spouses.length === 0 && household.spouseHasOtherMedicalCoverage != null) return "Spouse other-coverage status must be null when no spouse or partner is covered.";
    const planStart = new Date(`${planYear}-01-01T00:00:00.000Z`);
    for (const dependent of household.dependents) {
      const birthDate = new Date(`${dependent.birthDate}T00:00:00.000Z`);
      if (Number.isNaN(birthDate.getTime()) || birthDate >= planStart) return `${dependent.name}'s birth date must be before the plan year.`;
      if (dependent.relationship === "child" && this.ageOn(birthDate, planStart) >= 26) return `${dependent.name} is outside this demo's standard dependent-child age rule.`;
    }
    return null;
  }

  public static evaluateMedicalPlans(household: Household, preferences: CarePreferences, employee: EmployeeProfile, planYear: number): PlanEvaluation {
    const options: MedicalPlanOption[] = [
      {
        id: "EPO_VALUE", name: "Value EPO", type: "EPO",
        employeePremiumPerPayPeriod: perPayPeriodPremiums.EPO_VALUE[household.coverageTier],
        annualEmployeePremium: perPayPeriodPremiums.EPO_VALUE[household.coverageTier] * employee.payPeriods,
        familyDeductible: 2500, familyOutOfPocketMaximum: 9000, hsaEligible: false,
        employerHsaContribution: 0, outOfNetworkCoverage: false,
        prescriptionCoverage: "$15 / $45 / $90 after applicable rules",
      },
      {
        id: "HDHP_HSA", name: "HSA Advantage HDHP", type: "HDHP",
        employeePremiumPerPayPeriod: perPayPeriodPremiums.HDHP_HSA[household.coverageTier],
        annualEmployeePremium: perPayPeriodPremiums.HDHP_HSA[household.coverageTier] * employee.payPeriods,
        familyDeductible: 5000, familyOutOfPocketMaximum: 10000, hsaEligible: true,
        employerHsaContribution: household.coverageTier === "employee_only" ? 750 : 1500,
        outOfNetworkCoverage: true,
        prescriptionCoverage: "20% after deductible",
      },
      {
        id: "PPO_STANDARD", name: "Standard PPO", type: "PPO",
        employeePremiumPerPayPeriod: perPayPeriodPremiums.PPO_STANDARD[household.coverageTier],
        annualEmployeePremium: perPayPeriodPremiums.PPO_STANDARD[household.coverageTier] * employee.payPeriods,
        familyDeductible: 3000, familyOutOfPocketMaximum: 8000, hsaEligible: false,
        employerHsaContribution: 0, outOfNetworkCoverage: true,
        prescriptionCoverage: "$10 / $40 / $80",
      },
    ];

    let recommendedPlanId: MedicalPlanOption["id"] = "EPO_VALUE";
    const recommendationReasons: string[] = [];
    if (preferences.priorities.includes("hsa_savings")) {
      recommendedPlanId = "HDHP_HSA";
      recommendationReasons.push("You prioritized HSA savings and the HDHP includes an employer HSA contribution.");
    }
    if (preferences.priorities.includes("lower_deductible") || preferences.anticipatedUse === "high") {
      recommendedPlanId = "PPO_STANDARD";
      recommendationReasons.push("You prioritized a lower deductible or expect high use.");
    } else if (preferences.networkPreference === "out_of_network_flexibility" && recommendedPlanId === "EPO_VALUE") {
      recommendedPlanId = "PPO_STANDARD";
      recommendationReasons.push("You requested out-of-network flexibility, which the EPO does not provide.");
    }
    if (preferences.prescriptionUse === "regular") recommendationReasons.push("Compare prescription terms carefully because you reported regular medication use.");
    if (recommendationReasons.length === 0) recommendationReasons.push("The EPO has the lowest simple in-network payroll cost for the stated preferences.");

    return { planYear, rulesVersion: RULES_VERSION, coverageTier: household.coverageTier, recommendedPlanId, recommendationReasons, options };
  }

  public static providerNetwork(planId: MedicalPlanOption["id"], providerName: string): { inNetwork: boolean | null; message: string } {
    const normalized = providerName.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const knownPlans = providerNetworks[normalized];
    if (!knownPlans) return { inNetwork: null, message: `${providerName} is not in the fictional demo directory. Verify network status with the carrier before enrolling.` };
    const inNetwork = knownPlans.includes(planId);
    return { inNetwork, message: `${providerName} is ${inNetwork ? "in network" : "out of network"} for ${planId} in the fictional demo directory. Recheck before receiving care.` };
  }

  public static evaluateHealthAccount(plan: MedicalPlanOption, tier: Household["coverageTier"], election: HealthAccountElection): HealthAccountResult {
    const annualLimit = election.accountType === "hsa" ? HSA_LIMITS[tier] : election.accountType === "healthcare_fsa" ? 3300 : 0;
    const employerContribution = election.accountType === "hsa" ? plan.employerHsaContribution : 0;
    const combinedContribution = employerContribution + election.employeeAnnualContribution;
    let reason = "Election is within the fictional demo plan limits.";
    let accepted = true;
    if (election.accountType === "hsa" && !plan.hsaEligible) {
      accepted = false;
      reason = "An HSA election requires the HSA-eligible HDHP.";
    } else if (election.accountType === "healthcare_fsa" && plan.hsaEligible) {
      accepted = false;
      reason = "This demo does not allow a general-purpose healthcare FSA with the HSA-eligible plan.";
    } else if (election.accountType === "waive" && election.employeeAnnualContribution !== 0) {
      accepted = false;
      reason = "A waived account must have a zero employee contribution.";
    } else if (combinedContribution > annualLimit) {
      accepted = false;
      reason = `Employee plus employer contributions total $${combinedContribution}, above the $${annualLimit} demo limit.`;
    }
    return { accepted, reason, annualLimit, employerContribution, employeeContribution: election.employeeAnnualContribution, combinedContribution };
  }

  public static quoteAncillary(election: AncillaryElection, employee: EmployeeProfile, tier: Household["coverageTier"]): AncillaryQuote {
    const familyCoverage = tier !== "employee_only";
    const dental = election.dentalPlan === "basic" ? (familyCoverage ? 28 : 12) : election.dentalPlan === "premium" ? (familyCoverage ? 48 : 21) : 0;
    const vision = election.visionPlan === "standard" ? (familyCoverage ? 12 : 5) : 0;
    const supplementalLifeCoverage = employee.annualSalary * election.supplementalLifeMultiple;
    const life = Math.round((supplementalLifeCoverage / 1000) * 0.04 * 100) / 100;
    const disability = (election.shortTermDisability ? 7.5 : 0) + (election.longTermDisability ? 10 : 0);
    const pendingRequirements = election.supplementalLifeMultiple === 3 ? ["EVIDENCE_OF_INSURABILITY"] : [];
    return {
      ...election,
      employeePremiumPerPayPeriod: Math.round((dental + vision + life + disability) * 100) / 100,
      supplementalLifeCoverage,
      pendingRequirements,
    };
  }

  public static evaluateDependentCare(household: Household, election: DependentCareElection, planYear: number): DependentCareResult {
    const planStart = new Date(`${planYear}-01-01T00:00:00.000Z`);
    const eligibleDependentNames = household.dependents
      .filter((dependent) => dependent.relationship === "child" && this.ageOn(new Date(`${dependent.birthDate}T00:00:00.000Z`), planStart) < 13)
      .map((dependent) => dependent.name);
    let accepted = true;
    let reason = "Election is within the fictional demo plan limit.";
    if (election.annualContribution > 0 && eligibleDependentNames.length === 0) {
      accepted = false;
      reason = "No covered dependent is under age 13 at the start of the plan year in this demo.";
    } else if (election.annualContribution > DEPENDENT_CARE_LIMIT) {
      accepted = false;
      reason = `The election exceeds the $${DEPENDENT_CARE_LIMIT} fictional demo limit.`;
    }
    return { accepted, reason, annualLimit: DEPENDENT_CARE_LIMIT, eligibleDependentNames };
  }

  public static createEnrollment(application: EnrollmentApplication, currentDate: Date): EnrollmentRecord {
    const payload = JSON.stringify(application);
    const suffix = createHash("sha256").update(payload).digest("hex").slice(0, 10).toUpperCase();
    const pendingRequirements = [...application.ancillary.pendingRequirements];
    const medical = application.selectedMedicalPlan.employeePremiumPerPayPeriod;
    const healthAccount = application.healthAccount.employeeAnnualContribution / application.eligibility.employee!.payPeriods;
    const dependentCare = application.dependentCare.annualContribution / application.eligibility.employee!.payPeriods;
    return {
      enrollmentId: `BEN-${application.request.planYear}-${suffix}`,
      employeeId: application.request.employeeId,
      planYear: application.request.planYear,
      submittedAt: currentDate.toISOString(),
      effectiveDate: `${application.request.planYear}-01-01`,
      status: pendingRequirements.length > 0 ? "submitted_with_pending_requirements" : "submitted",
      medicalPlanId: application.selectedMedicalPlan.id,
      coverageTier: application.household.coverageTier,
      totalPayrollDeductionPerPayPeriod: Math.round((medical + application.ancillary.employeePremiumPerPayPeriod + healthAccount + dependentCare) * 100) / 100,
      pendingRequirements,
      rulesVersion: RULES_VERSION,
    };
  }

  private static ageOn(birthDate: Date, onDate: Date): number {
    let age = onDate.getUTCFullYear() - birthDate.getUTCFullYear();
    const beforeBirthday = onDate.getUTCMonth() < birthDate.getUTCMonth()
      || (onDate.getUTCMonth() === birthDate.getUTCMonth() && onDate.getUTCDate() < birthDate.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }
}
