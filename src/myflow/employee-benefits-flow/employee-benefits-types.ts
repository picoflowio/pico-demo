import { z } from "zod";

export const EnrollmentRequestSchema = z.object({
  employeeId: z.string().trim().regex(/^E-\d{4}$/),
  planYear: z.number().int().min(2026).max(2030),
  eventType: z.enum(["open_enrollment", "new_hire", "qualifying_life_event"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const DependentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.enum(["spouse", "domestic_partner", "child"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const HouseholdSchema = z.object({
  coverageTier: z.enum(["employee_only", "employee_spouse", "employee_children", "family"]),
  dependents: z.array(DependentSchema).max(8),
  spouseHasOtherMedicalCoverage: z.boolean().nullable(),
});

export const CarePreferencesSchema = z.object({
  anticipatedUse: z.enum(["preventive_only", "moderate", "high"]),
  prescriptionUse: z.enum(["none", "occasional", "regular"]),
  networkPreference: z.enum(["in_network_only", "out_of_network_flexibility"]),
  priorities: z.array(z.enum([
    "lowest_payroll_cost",
    "lower_deductible",
    "out_of_network_access",
    "hsa_savings",
    "prescription_coverage",
  ])).min(1).max(5),
});

export const HealthAccountElectionSchema = z.object({
  accountType: z.enum(["hsa", "healthcare_fsa", "waive"]),
  employeeAnnualContribution: z.number().int().min(0).max(20000),
});

export const AncillaryElectionSchema = z.object({
  dentalPlan: z.enum(["waive", "basic", "premium"]),
  visionPlan: z.enum(["waive", "standard"]),
  supplementalLifeMultiple: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  shortTermDisability: z.boolean(),
  longTermDisability: z.boolean(),
});

export const BeneficiarySchema = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(80),
  percentage: z.number().int().min(1).max(100),
});

export const BeneficiaryElectionSchema = z.object({
  beneficiaries: z.array(BeneficiarySchema).min(1).max(6),
});

export const DependentCareElectionSchema = z.object({
  annualContribution: z.number().int().min(0).max(10000),
});

export type EnrollmentRequest = z.infer<typeof EnrollmentRequestSchema>;
export type Household = z.infer<typeof HouseholdSchema>;
export type CarePreferences = z.infer<typeof CarePreferencesSchema>;
export type HealthAccountElection = z.infer<typeof HealthAccountElectionSchema>;
export type AncillaryElection = z.infer<typeof AncillaryElectionSchema>;
export type BeneficiaryElection = z.infer<typeof BeneficiaryElectionSchema>;
export type DependentCareElection = z.infer<typeof DependentCareElectionSchema>;

export type EmployeeProfile = {
  employeeId: string;
  name: string;
  state: string;
  employmentStatus: "active" | "leave" | "terminated";
  weeklyHours: number;
  hireDate: string;
  annualSalary: number;
  payPeriods: number;
};

export type EligibilityDecision = {
  eligible: boolean;
  reasonCodes: string[];
  enrollmentDeadline: string | null;
  employee: EmployeeProfile | null;
  rulesVersion: string;
};

export type MedicalPlanOption = {
  id: "EPO_VALUE" | "HDHP_HSA" | "PPO_STANDARD";
  name: string;
  type: "EPO" | "HDHP" | "PPO";
  employeePremiumPerPayPeriod: number;
  annualEmployeePremium: number;
  familyDeductible: number;
  familyOutOfPocketMaximum: number;
  hsaEligible: boolean;
  employerHsaContribution: number;
  outOfNetworkCoverage: boolean;
  prescriptionCoverage: string;
};

export type PlanEvaluation = {
  planYear: number;
  rulesVersion: string;
  coverageTier: Household["coverageTier"];
  recommendedPlanId: MedicalPlanOption["id"];
  recommendationReasons: string[];
  options: MedicalPlanOption[];
};

export type HealthAccountResult = {
  accepted: boolean;
  reason: string;
  annualLimit: number;
  employerContribution: number;
  employeeContribution: number;
  combinedContribution: number;
};

export type AncillaryQuote = AncillaryElection & {
  employeePremiumPerPayPeriod: number;
  supplementalLifeCoverage: number;
  pendingRequirements: string[];
};

export type DependentCareResult = {
  accepted: boolean;
  reason: string;
  annualLimit: number;
  eligibleDependentNames: string[];
};

export type EnrollmentApplication = {
  request: EnrollmentRequest;
  eligibility: EligibilityDecision;
  household: Household;
  preferences: CarePreferences;
  planEvaluation: PlanEvaluation;
  selectedMedicalPlan: MedicalPlanOption;
  healthAccount: HealthAccountElection;
  healthAccountResult: HealthAccountResult;
  ancillary: AncillaryQuote;
  beneficiaries: BeneficiaryElection;
  dependentCare: DependentCareElection;
  dependentCareResult: DependentCareResult;
};

export type EnrollmentRecord = {
  enrollmentId: string;
  employeeId: string;
  planYear: number;
  submittedAt: string;
  effectiveDate: string;
  status: "submitted" | "submitted_with_pending_requirements";
  medicalPlanId: MedicalPlanOption["id"];
  coverageTier: Household["coverageTier"];
  totalPayrollDeductionPerPayPeriod: number;
  pendingRequirements: string[];
  rulesVersion: string;
};
