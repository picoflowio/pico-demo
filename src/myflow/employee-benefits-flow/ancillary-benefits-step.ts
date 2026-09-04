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
import { AncillaryElectionSchema, type EligibilityDecision, type Household } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { BeneficiaryStep } from "./beneficiary-step.js";
import { DependentCareStep } from "./dependent-care-step.js";
import { EligibilityStep } from "./eligibility-step.js";
import { HouseholdStep } from "./household-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/ancillary.md");

export class AncillaryBenefitsStep extends Step {
  /**
   * Initializes the AncillaryBenefitsStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Clears transient memory upon step entry to focus on ancillary benefit packages.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial synthetic prompt asking for dental, vision, life, and disability choices.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Begin with dental and vision choices, then collect life and disability elections.");
  }

  /**
   * Builds prompt instructing the LLM on dental tiers, vision coverage, life insurance multiples, and disability options.
   *
   * @returns Formatted ancillary benefits prompt text.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      EMPLOYEE: JSON.stringify(this.eligibility().employee),
      COVERAGE_TIER: this.household().coverageTier,
    })}`;
  }

  /**
   * Defines tool schemas for comparing dental options, explaining life insurance multiples, capturing elections, and exiting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "compare_benefits_dental_options", description: "Render exact Basic and Premium dental terms.", schema: z.object({}) },
      { name: "explain_benefits_life_option", description: "Calculate and explain one supplemental-life multiple.", schema: z.object({ multiple: z.union([z.literal(1), z.literal(2), z.literal(3)]) }) },
      { name: "capture_benefits_ancillary", description: "Validate and save complete dental, vision, supplemental-life, and disability elections.", schema: AncillaryElectionSchema },
      { name: "end_ancillary_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Directly returns a Markdown comparison table between Basic and Premium dental coverage tiers.
   *
   * @returns Direct tool response with dental comparison.
   */
  @Tool
  protected async compare_benefits_dental_options(): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.dentalComparison(this.household().coverageTier));
  }

  /**
   * Explains coverage amount and payroll deductions for a supplemental life salary multiple.
   *
   * @param args - Salary multiple (1x, 2x, or 3x).
   * @returns Direct tool response explaining life insurance coverage and cost.
   */
  @Tool
  protected async explain_benefits_life_option(args: { multiple: 1 | 2 | 3 }): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.lifeExplanation(args.multiple, this.eligibility().employee!.annualSalary));
  }

  /**
   * Validates ancillary elections, quotes premiums, and branches to BeneficiaryStep if supplemental life is elected,
   * otherwise skips directly to DependentCareStep.
   *
   * @param args - Raw tool arguments matching AncillaryElectionSchema.
   * @returns Navigation response to BeneficiaryStep or DependentCareStep.
   */
  @Tool
  protected async capture_benefits_ancillary(args: unknown): Promise<ToolResponseType> {
    const parsed = AncillaryElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect supported dental, vision, supplemental-life, short-term disability, and long-term disability elections.");
    const quote = BenefitsPolicy.quoteAncillary(parsed.data, this.eligibility().employee!, this.household().coverageTier);
    this.saveState({ election: durableBenefitsJson(parsed.data), quote: durableBenefitsJson(quote) });
    return parsed.data.supplementalLifeMultiple > 0
      ? go(BeneficiaryStep).withState({ needsPresentation: true, pendingRequirements: quote.pendingRequirements })
      : go(DependentCareStep);
  }

  /**
   * Handles user exit during ancillary election.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_ancillary_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  /**
   * Retrieves the eligibility decision and employee profile from EligibilityStep state.
   *
   * @returns EligibilityDecision object.
   */
  private eligibility(): EligibilityDecision {
    const decision = this.flow.getStepState<EligibilityDecision>(EligibilityStep, "decision");
    if (!decision?.employee) throw new Error("AncillaryBenefitsStep requires an eligible employee.");
    return decision;
  }

  /**
   * Retrieves the covered household from HouseholdStep state.
   *
   * @returns Household object.
   */
  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("AncillaryBenefitsStep requires HouseholdStep.household.");
    return household;
  }
}
