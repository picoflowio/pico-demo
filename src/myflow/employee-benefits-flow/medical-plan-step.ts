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
  /**
   * Initializes the MedicalPlanStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Clears transient memory upon step entry to focus on medical plan presentation.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial prompt requesting exact medical plan presentation.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Show the current medical plan options exactly.");
  }

  /**
   * Builds the prompt instructing the LLM to present medical plan options and fit rankings.
   *
   * @returns Formatted medical plan prompt string.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      PLAN_EVALUATION: JSON.stringify(this.evaluation()),
    })}`;
  }

  /**
   * Defines tool schemas for displaying plans, comparing plans, checking provider networks, selecting a plan, and exiting.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "show_benefits_medical_plans", description: "Render exact current medical plan options and the rule-based fit.", schema: z.object({}) },
      { name: "compare_benefits_medical_plans", description: "Compare exact current plan IDs.", schema: z.object({ planIds: z.array(z.string().min(1)).min(2).max(3) }) },
      { name: "check_benefits_provider_network", description: "Check a provider against the fictional plan directory.", schema: z.object({ planId: z.string().min(1), providerName: z.string().trim().min(2).max(120) }) },
      { name: "select_benefits_medical_plan", description: "Select one exact current medical plan ID.", schema: z.object({ planId: z.string().min(1) }) },
      { name: "end_medical_plan_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Returns exact plan presentation table on initial entry without additional LLM generation.
   *
   * @param llmResult - Model response output.
   * @returns Formatted plan text or delegates to super.
   */
  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      this.removeState("needsPresentation");
      return BenefitsPresenter.medicalPlans(this.evaluation());
    }
    return super.onResponse(llmResult);
  }

  /**
   * Renders the medical plans table directly to the user.
   *
   * @returns Direct tool response containing the plan options table.
   */
  @Tool
  protected async show_benefits_medical_plans(): Promise<ToolResponseType> {
    this.removeState("needsPresentation");
    return direct(BenefitsPresenter.medicalPlans(this.evaluation()));
  }

  /**
   * Compares 2-3 medical plan options side-by-side in a formatted Markdown table.
   *
   * @param args - Object containing `planIds` array.
   * @returns Direct tool response with comparison table.
   */
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

  /**
   * Checks whether a named doctor or facility is in-network for a specific plan option.
   *
   * @param args - Plan ID and provider name string.
   * @returns Direct tool response with network participation details.
   */
  @Tool
  protected async check_benefits_provider_network(args: { planId: string; providerName: string }): Promise<ToolResponseType> {
    const option = this.findPlan(args.planId);
    if (!option) return stay(`Choose a current plan ID: ${this.evaluation().options.map((candidate) => candidate.id).join(", ")}.`);
    return direct(BenefitsPolicy.providerNetwork(option, args.providerName).message);
  }

  /**
   * Records the selected medical plan and advances to HealthAccountStep (HSA / FSA).
   *
   * @param args - Object with chosen `planId`.
   * @returns Navigation response to HealthAccountStep.
   */
  @Tool
  protected async select_benefits_medical_plan(args: { planId: string }): Promise<ToolResponseType> {
    const option = this.findPlan(args.planId);
    if (!option) return stay(`Choose one current plan ID: ${this.evaluation().options.map((candidate) => candidate.id).join(", ")}.`);
    this.saveState({ selectedPlan: durableBenefitsJson(option) });
    return go(HealthAccountStep);
  }

  /**
   * Handles user exit during medical plan selection.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_medical_plan_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }

  /**
   * Retrieves the plan evaluation result from PlanEvaluationStep state.
   *
   * @returns Active PlanEvaluation object.
   */
  private evaluation(): PlanEvaluation {
    const evaluation = this.flow.getStepState<PlanEvaluation>(PlanEvaluationStep, "evaluation");
    if (!evaluation) throw new Error("MedicalPlanStep requires PlanEvaluationStep.evaluation.");
    return evaluation;
  }

  /**
   * Finds a specific medical plan option by ID from the current evaluation results.
   *
   * @param id - Plan ID code.
   * @returns MedicalPlanOption or undefined if not found.
   */
  private findPlan(id: string): MedicalPlanOption | undefined {
    return this.evaluation().options.find((option) => option.id === id.trim().toUpperCase());
  }
}
