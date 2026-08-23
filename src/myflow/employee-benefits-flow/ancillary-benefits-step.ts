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
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Begin with dental and vision choices, then collect life and disability elections.");
  }

  public getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      EMPLOYEE: JSON.stringify(this.eligibility().employee),
      COVERAGE_TIER: this.household().coverageTier,
    })}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "compare_benefits_dental_options", description: "Render exact Basic and Premium dental terms.", schema: z.object({}) },
      { name: "explain_benefits_life_option", description: "Calculate and explain one supplemental-life multiple.", schema: z.object({ multiple: z.union([z.literal(1), z.literal(2), z.literal(3)]) }) },
      { name: "capture_benefits_ancillary", description: "Validate and save complete dental, vision, supplemental-life, and disability elections.", schema: AncillaryElectionSchema },
      { name: "end_ancillary_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async compare_benefits_dental_options(): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.dentalComparison(this.household().coverageTier));
  }

  @Tool
  protected async explain_benefits_life_option(args: { multiple: 1 | 2 | 3 }): Promise<ToolResponseType> {
    return direct(BenefitsPresenter.lifeExplanation(args.multiple, this.eligibility().employee!.annualSalary));
  }

  @Tool
  protected async capture_benefits_ancillary(args: unknown): Promise<ToolResponseType> {
    const parsed = AncillaryElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect supported dental, vision, supplemental-life, short-term disability, and long-term disability elections.");
    const quote = BenefitsPolicy.quoteAncillary(parsed.data, this.eligibility().employee!, this.household().coverageTier);
    this.saveState({ election: durableBenefitsJson(parsed.data), quote: durableBenefitsJson(quote) });
    return parsed.data.supplementalLifeMultiple > 0 ? go(BeneficiaryStep) : go(DependentCareStep);
  }

  @Tool
  protected async end_ancillary_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  private eligibility(): EligibilityDecision {
    const decision = this.flow.getStepState<EligibilityDecision>(EligibilityStep, "decision");
    if (!decision?.employee) throw new Error("AncillaryBenefitsStep requires an eligible employee.");
    return decision;
  }

  private household(): Household {
    const household = this.flow.getStepState<Household>(HouseholdStep, "household");
    if (!household) throw new Error("AncillaryBenefitsStep requires HouseholdStep.household.");
    return household;
  }
}
