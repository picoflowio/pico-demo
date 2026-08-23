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
import type { MedicalPlanOption, PlanEvaluation } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { HealthAccountStep } from "./health-account-step.js";
import { PlanEvaluationStep } from "./plan-evaluation-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/medical-plan.md");

export class MedicalPlanStep extends Step {
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the current medical plan options exactly.");
  }

  public getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      PLAN_EVALUATION: JSON.stringify(this.evaluation()),
    })}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "show_benefits_medical_plans", description: "Render exact current medical plan options and the rule-based fit.", schema: z.object({}) },
      { name: "compare_benefits_medical_plans", description: "Compare exact current plan IDs.", schema: z.object({ planIds: z.array(z.string().min(1)).min(2).max(3) }) },
      { name: "check_benefits_provider_network", description: "Check a provider against the fictional plan directory.", schema: z.object({ planId: z.string().min(1), providerName: z.string().trim().min(2).max(120) }) },
      { name: "select_benefits_medical_plan", description: "Select one exact current medical plan ID.", schema: z.object({ planId: z.string().min(1) }) },
      { name: "end_medical_plan_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.medicalPlans(this.evaluation());
    }
    return super.onResponse(llmResult);
  }

  @Tool
  protected async show_benefits_medical_plans(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(BenefitsPresenter.medicalPlans(this.evaluation()));
  }

  @Tool
  protected async compare_benefits_medical_plans(args: { planIds: string[] }): Promise<ToolResponseType> {
    const evaluation = this.evaluation();
    const ids = [...new Set(args.planIds.map((id) => id.trim().toUpperCase()))];
    const options = ids.flatMap((id) => {
      const option = evaluation.options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    });
    if (options.length !== ids.length) return stay(`Choose current plan IDs: ${evaluation.options.map((option) => option.id).join(", ")}.`);
    return direct(BenefitsPresenter.compareMedicalPlans(options));
  }

  @Tool
  protected async check_benefits_provider_network(args: { planId: string; providerName: string }): Promise<ToolResponseType> {
    const option = this.findPlan(args.planId);
    if (!option) return stay(`Choose a current plan ID: ${this.evaluation().options.map((candidate) => candidate.id).join(", ")}.`);
    return direct(BenefitsPolicy.providerNetwork(option.id, args.providerName).message);
  }

  @Tool
  protected async select_benefits_medical_plan(args: { planId: string }): Promise<ToolResponseType> {
    const option = this.findPlan(args.planId);
    if (!option) return stay(`Choose one current plan ID: ${this.evaluation().options.map((candidate) => candidate.id).join(", ")}.`);
    this.saveState({ selectedPlan: durableBenefitsJson(option) });
    return go(HealthAccountStep);
  }

  @Tool
  protected async end_medical_plan_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  private evaluation(): PlanEvaluation {
    const evaluation = this.flow.getStepState<PlanEvaluation>(PlanEvaluationStep, "evaluation");
    if (!evaluation) throw new Error("MedicalPlanStep requires PlanEvaluationStep.evaluation.");
    return evaluation;
  }

  private findPlan(id: string): MedicalPlanOption | undefined {
    return this.evaluation().options.find((option) => option.id === id.trim().toUpperCase());
  }
}
