import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { BenefitsPolicy } from "./backend/benefits-policy.js";
import { HealthAccountElectionSchema, type Household, type MedicalPlanOption } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { AncillaryBenefitsStep } from "./ancillary-benefits-step.js";
import { HouseholdStep } from "./household-step.js";
import { MedicalPlanStep } from "./medical-plan-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/health-account.md");

export class HealthAccountStep extends Step {
  /**
   * Initializes the HealthAccountStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on health account options.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial synthetic user prompt triggering health account guidance.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking to explain available accounts and collect contributions.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the available health account and collect an annual employee contribution.");
  }

  /**
   * Builds prompt instructing the LLM on HSA vs FSA eligibility based on chosen medical plan.
   *
   * @returns Formatted health account prompt text.
   */
  public override getPrompt(): string {
    const plan = this.selectedPlan();
    const household = this.household();
    const zeroElection = { accountType: plan.hsaEligible ? "hsa" : "healthcare_fsa", employeeAnnualContribution: 0 } as const;
    const limits = BenefitsPolicy.evaluateHealthAccount(plan, household.coverageTier, zeroElection);
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      SELECTED_PLAN: JSON.stringify(plan),
      ACCOUNT_LIMITS: JSON.stringify(limits),
    })}`;
  }

  /**
   * Defines tool schemas for capturing HSA/FSA elections and exiting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_health_account", description: "Validate and save the HSA, healthcare FSA, or waiver election.", schema: HealthAccountElectionSchema },
      { name: "end_health_account_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Validates account type compatibility (HSA vs FSA) and annual statutory contribution limits,
   * saving state and advancing to AncillaryBenefitsStep.
   *
   * @param args - Tool invocation arguments matching HealthAccountElectionSchema.
   * @returns Navigation response to AncillaryBenefitsStep or stay if limits exceeded.
   */
  @Tool
  protected async capture_benefits_health_account(args: unknown): Promise<ToolResponseType> {
    const parsed = HealthAccountElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect an account type and whole-dollar annual employee contribution, or waive with zero contribution.");
    const result = BenefitsPolicy.evaluateHealthAccount(this.selectedPlan(), this.household().coverageTier, parsed.data);
    if (!result.accepted) return stay(result.reason);
    this.saveState({ election: durableBenefitsJson(parsed.data), result: durableBenefitsJson(result) });
    return go(AncillaryBenefitsStep);
  }

  /**
   * Handles user exit during health account election.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_health_account_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  /**
   * Retrieves the selected medical plan from MedicalPlanStep state.
   *
   * @returns Selected MedicalPlanOption.
   */
  private selectedPlan(): MedicalPlanOption {
    const plan = this.flow.getStepState<MedicalPlanOption>(MedicalPlanStep, "selectedPlan");
    if (!plan) throw new Error("HealthAccountStep requires MedicalPlanStep.selectedPlan.");
    return plan;
  }

  /**
   * Retrieves the covered household from HouseholdStep state.
   *
   * @returns Household data object.
   */
  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("HealthAccountStep requires HouseholdStep.household.");
    return household;
  }
}
