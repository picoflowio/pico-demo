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
  constructor(flow: Flow) { super(flow); }

  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Render the authoritative dependent-care FSA explanation and election question exactly.");
  }

  public override getPrompt(): string {
    const preliminary = BenefitsPolicy.evaluateDependentCare(this.household(), { annualContribution: 0 }, this.request().planYear);
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      DEPENDENT_CARE_POLICY: JSON.stringify(preliminary),
    })}`;
  }

  public override defineTool(): ToolType[] {
    return [
      { name: "explain_benefits_dependent_care", description: "Render the exact fictional dependent-care FSA explanation, including its healthcare-FSA distinction and $5,000 annual limit.", schema: z.object({}) },
      { name: "capture_benefits_dependent_care", description: "Validate and save an annual dependent-care FSA election or zero waiver.", schema: DependentCareElectionSchema },
      { name: "end_dependent_care_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async explain_benefits_dependent_care(): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.dependentCareExplanation());
  }

  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.dependentCareExplanation();
    }
    return super.onResponse(llmResult);
  }

  @Tool
  protected async capture_benefits_dependent_care(args: unknown): Promise<ToolResponseType> {
    const parsed = DependentCareElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect a whole-dollar annual dependent-care contribution from $0 through the supported limit.");
    const result = BenefitsPolicy.evaluateDependentCare(this.household(), parsed.data, this.request().planYear);
    if (!result.accepted) return stay(result.reason);
    this.saveState({ election: durableBenefitsJson(parsed.data), result: durableBenefitsJson(result) });
    return go(EnrollmentReviewStep).withState({ needsPresentation: true });
  }

  @Tool
  protected async end_dependent_care_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  private request(): EnrollmentRequest {
    const request = this.flow.getStepState<EnrollmentRequest>(EligibilityStep, "request");
    if (!request) throw new Error("DependentCareStep requires EligibilityStep.request.");
    return request;
  }

  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("DependentCareStep requires HouseholdStep.household.");
    return household;
  }
}
