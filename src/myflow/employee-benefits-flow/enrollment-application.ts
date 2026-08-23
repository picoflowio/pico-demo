import type { Flow } from "@picoflow/core";
import { AncillaryBenefitsStep } from "./ancillary-benefits-step.js";
import { BeneficiaryStep } from "./beneficiary-step.js";
import { DependentCareStep } from "./dependent-care-step.js";
import type {
  AncillaryQuote,
  BeneficiaryElection,
  CarePreferences,
  DependentCareElection,
  DependentCareResult,
  EligibilityDecision,
  EnrollmentApplication,
  EnrollmentRequest,
  HealthAccountElection,
  HealthAccountResult,
  Household,
  MedicalPlanOption,
  PlanEvaluation,
} from "./employee-benefits-types.js";
import { EligibilityStep } from "./eligibility-step.js";
import { HealthAccountStep } from "./health-account-step.js";
import { HouseholdStep } from "./household-step.js";
import { MedicalPlanStep } from "./medical-plan-step.js";
import { PlanEvaluationStep } from "./plan-evaluation-step.js";
import { PreferencesStep } from "./preferences-step.js";

export function readEnrollmentApplication(flow: Flow): EnrollmentApplication {
  const request = required<EnrollmentRequest>(flow, EligibilityStep, "request");
  const eligibility = required<EligibilityDecision>(flow, EligibilityStep, "decision");
  const household = required<Household>(flow, HouseholdStep, "household");
  const preferences = required<CarePreferences>(flow, PreferencesStep, "preferences");
  const planEvaluation = required<PlanEvaluation>(flow, PlanEvaluationStep, "evaluation");
  const selectedMedicalPlan = required<MedicalPlanOption>(flow, MedicalPlanStep, "selectedPlan");
  const healthAccount = required<HealthAccountElection>(flow, HealthAccountStep, "election");
  const healthAccountResult = required<HealthAccountResult>(flow, HealthAccountStep, "result");
  const ancillary = required<AncillaryQuote>(flow, AncillaryBenefitsStep, "quote");
  const beneficiaries = ancillary.supplementalLifeMultiple > 0
    ? required<BeneficiaryElection>(flow, BeneficiaryStep, "election")
    : { beneficiaries: [] };
  const dependentCare = required<DependentCareElection>(flow, DependentCareStep, "election");
  const dependentCareResult = required<DependentCareResult>(flow, DependentCareStep, "result");
  return {
    request,
    eligibility,
    household,
    preferences,
    planEvaluation,
    selectedMedicalPlan,
    healthAccount,
    healthAccountResult,
    ancillary,
    beneficiaries,
    dependentCare,
    dependentCareResult,
  };
}

function required<T>(flow: Flow, step: new (flow: Flow) => { getPrompt(): string }, key: string): T {
  const value = flow.getStepState<T>(step as never, key);
  if (value == null) throw new Error(`Enrollment application requires ${step.name}.${key}.`);
  return value;
}
