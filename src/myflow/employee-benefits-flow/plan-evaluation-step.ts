import { Flow, LogicStep, go, type LogicResponseType } from "@picoflow/core";
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import type { CarePreferences, EligibilityDecision, EnrollmentRequest, Household } from "./employee-benefits-types.js";
import { durableBenefitsJson } from "./employee-benefits-utils.js";
import { EligibilityStep } from "./eligibility-step.js";
import { HouseholdStep } from "./household-step.js";
import { MedicalPlanStep } from "./medical-plan-step.js";
import { PreferencesStep } from "./preferences-step.js";

export class PlanEvaluationStep extends LogicStep {
  /**
   * Initializes the PlanEvaluationStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Deterministically evaluates medical plan options against employee preferences, payroll deduction models,
   * and household composition, advancing to MedicalPlanStep.
   *
   * @returns Navigation response to MedicalPlanStep.
   */
  public override async runLogic(): Promise<LogicResponseType> {
    const request = this.requireState<EnrollmentRequest>(EligibilityStep, "request");
    const eligibility = this.requireState<EligibilityDecision>(EligibilityStep, "decision");
    const household = this.requireState<Household>(HouseholdStep, "household");
    const preferences = this.requireState<CarePreferences>(PreferencesStep, "preferences");
    if (!eligibility.employee || !eligibility.eligible) throw new Error("PlanEvaluationStep requires an eligible employee.");
    const evaluation = BenefitsPolicy.evaluateMedicalPlans(household, preferences, eligibility.employee, request.planYear);
    this.saveState({ evaluation: durableBenefitsJson(evaluation) });
    return go(MedicalPlanStep).withState({ needsPresentation: true });
  }

  /**
   * Helper retrieving mandatory step state from preceding steps, throwing if absent.
   *
   * @param step - Target step constructor.
   * @param key - State key string.
   * @returns Retrieved state value.
   */
  private requireState<T>(step: new (flow: Flow) => { getPrompt(): string }, key: string): T {
    const value = this.flow.getStepState<T>(step as never, key);
    if (!value) throw new Error(`PlanEvaluationStep requires ${step.name}.${key}.`);
    return value;
  }
}
