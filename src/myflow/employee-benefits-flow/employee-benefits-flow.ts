import { Flow, Step, TerminateSessionStep, type SessionType } from "@picoflow/core";
import { EligibilityStep } from "./eligibility-step.js";
import { HouseholdStep } from "./household-step.js";
import { PreferencesStep } from "./preferences-step.js";
import { PlanEvaluationStep } from "./plan-evaluation-step.js";
import { MedicalPlanStep } from "./medical-plan-step.js";
import { HealthAccountStep } from "./health-account-step.js";
import { AncillaryBenefitsStep } from "./ancillary-benefits-step.js";
import { BeneficiaryStep } from "./beneficiary-step.js";
import { DependentCareStep } from "./dependent-care-step.js";
import { EnrollmentReviewStep } from "./enrollment-review-step.js";
import { CommitEnrollmentStep } from "./commit-enrollment-step.js";
import { IneligibleBenefitsStep } from "./ineligible-benefits-step.js";

const SESSION_IDLE_MS = 45 * 60_000;

export class EmployeeBenefitsFlow extends Flow {
  /**
   * Initializes the EmployeeBenefitsFlow and enables conversation summarization for intake steps.
   */
  constructor() {
    super();
    this.getMemory()
      .setSummaryModel({ provider: "openai", name: "gpt-4o", retryAttempts: 3 })
      .setSummaryConfig({ minMessages: 14, recentMessages: 8 })
      .enableSummary("benefits-intake");
  }

  /**
   * Configures default language model (GPT-4o) and retry policy.
   */
  protected override configModel() {
    return { provider: "openai", name: "gpt-4o", retryAttempts: 3 } as const;
  }

  /**
   * Sets the per-step LLM call timeout policy to 120 seconds.
   */
  protected override configLlmCallPolicy() {
    return { timeoutMs: 120_000 };
  }

  /**
   * Registers all sequential steps in the annual employee benefits enrollment process.
   *
   * @returns Array of Step instances.
   */
  protected override defineSteps(): Step[] {
    return [
      new EligibilityStep(this).useMemory("benefits-intake"),
      new HouseholdStep(this).useMemory("benefits-intake"),
      new PreferencesStep(this).useMemory("benefits-intake"),
      new PlanEvaluationStep(this),
      new MedicalPlanStep(this).useMemory("benefits-medical").useModel(complexBenefitsModel),
      new HealthAccountStep(this).useMemory("benefits-accounts").useModel(complexBenefitsModel),
      new AncillaryBenefitsStep(this).useMemory("benefits-ancillary").useModel(complexBenefitsModel),
      new BeneficiaryStep(this).useMemory("benefits-beneficiaries").useModel(complexBenefitsModel),
      new DependentCareStep(this).useMemory("benefits-dependent-care").useModel(complexBenefitsModel),
      new EnrollmentReviewStep(this).useMemory("benefits-review").useModel(complexBenefitsModel),
      new CommitEnrollmentStep(this),
      new IneligibleBenefitsStep(this).useMemory("benefits-ineligible"),
      new TerminateSessionStep(this).useMemory("benefits-terminal"),
    ];
  }

  /**
   * Prunes restored sessions that have been idle for 45 minutes or longer.
   *
   * @param session - Restored session document.
   * @returns Active session document or null if expired.
   */
  protected async onRestoreSessionDoc(session: SessionType): Promise<SessionType | null> {
    const restored = await super.onRestoreSessionDoc(session);
    if (!restored) return null;
    return this.sessionIdleMs(restored) >= SESSION_IDLE_MS ? null : restored;
  }
}

const complexBenefitsModel = {
  provider: "openai",
  name: "gpt-5.1",
  params: { reasoning: { effort: "low" } },
} as const;
