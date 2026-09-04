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
  constructor(flow: Flow) { super(flow); }

  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the available health account and collect an annual employee contribution.");
  }

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

  public override defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_health_account", description: "Validate and save the HSA, healthcare FSA, or waiver election.", schema: HealthAccountElectionSchema },
      { name: "end_health_account_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_benefits_health_account(args: unknown): Promise<ToolResponseType> {
    const parsed = HealthAccountElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect an account type and whole-dollar annual employee contribution, or waive with zero contribution.");
    const result = BenefitsPolicy.evaluateHealthAccount(this.selectedPlan(), this.household().coverageTier, parsed.data);
    if (!result.accepted) return stay(result.reason);
    this.saveState({ election: durableBenefitsJson(parsed.data), result: durableBenefitsJson(result) });
    return go(AncillaryBenefitsStep);
  }

  @Tool
  protected async end_health_account_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  private selectedPlan(): MedicalPlanOption {
    const plan = this.flow.getStepState<MedicalPlanOption>(MedicalPlanStep, "selectedPlan");
    if (!plan) throw new Error("HealthAccountStep requires MedicalPlanStep.selectedPlan.");
    return plan;
  }

  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("HealthAccountStep requires HouseholdStep.household.");
    return household;
  }
}
