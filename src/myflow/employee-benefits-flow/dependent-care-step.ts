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
import { DependentCareElectionSchema, type EnrollmentRequest, type Household } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { EligibilityStep } from "./eligibility-step.js";
import { EnrollmentReviewStep } from "./enrollment-review-step.js";
import { HouseholdStep } from "./household-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/dependent-care.md");

export class DependentCareStep extends Step {
  /**
   * Initializes the DependentCareStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on dependent care FSA.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial synthetic user prompt requesting the dependent-care FSA explanation and question.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Render the authoritative dependent-care FSA explanation and election question exactly.");
  }

  /**
   * Builds prompt instructing the LLM on dependent-care FSA rules, IRS limits, and qualifying dependents.
   *
   * @returns Formatted dependent-care prompt text.
   */
  public override getPrompt(): string {
    const preliminary = BenefitsPolicy.evaluateDependentCare(this.household(), { annualContribution: 0 }, this.request().planYear);
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      DEPENDENT_CARE_POLICY: JSON.stringify(preliminary),
    })}`;
  }

  /**
   * Defines tool schemas for explaining dependent-care FSA, saving contributions, and exiting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "explain_benefits_dependent_care", description: "Render the exact fictional dependent-care FSA explanation, including its healthcare-FSA distinction and $5,000 annual limit.", schema: z.object({}) },
      { name: "capture_benefits_dependent_care", description: "Validate and save an annual dependent-care FSA election or zero waiver.", schema: DependentCareElectionSchema },
      { name: "end_dependent_care_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Returns authoritative explanation of dependent care FSA rules directly to the user.
   *
   * @returns Direct tool response with explanation text.
   */
  @Tool
  protected async explain_benefits_dependent_care(): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.dependentCareExplanation());
  }

  /**
   * Outputs dependent-care FSA explanation on initial entry when requested.
   *
   * @param llmResult - Model generation output.
   * @returns Direct presentation text or delegates to super.
   */
  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.dependentCareExplanation();
    }
    return super.onResponse(llmResult);
  }

  /**
   * Validates dependent-care FSA contribution amount against IRS caps and qualifying child presence,
   * advancing to EnrollmentReviewStep.
   *
   * @param args - Tool invocation arguments matching DependentCareElectionSchema.
   * @returns Navigation response to EnrollmentReviewStep or stay if limits exceeded.
   */
  @Tool
  protected async capture_benefits_dependent_care(args: unknown): Promise<ToolResponseType> {
    const parsed = DependentCareElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect a whole-dollar annual dependent-care contribution from $0 through the supported limit.");
    const result = BenefitsPolicy.evaluateDependentCare(this.household(), parsed.data, this.request().planYear);
    if (!result.accepted) return stay(result.reason);
    this.saveState({ election: durableBenefitsJson(parsed.data), result: durableBenefitsJson(result) });
    return go(EnrollmentReviewStep).withState({ needsPresentation: true });
  }

  /**
   * Handles user exit during dependent-care FSA collection.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_dependent_care_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  /**
   * Retrieves the enrollment request from EligibilityStep state.
   *
   * @returns EnrollmentRequest object.
   */
  private request(): EnrollmentRequest {
    const request = this.flow.getStepState<EnrollmentRequest>(EligibilityStep, "request");
    if (!request) throw new Error("DependentCareStep requires EligibilityStep.request.");
    return request;
  }

  /**
   * Retrieves the covered household from HouseholdStep state.
   *
   * @returns Household object.
   */
  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("DependentCareStep requires HouseholdStep.household.");
    return household;
  }
}
