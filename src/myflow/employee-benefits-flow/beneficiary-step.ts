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
import { BeneficiaryElectionSchema } from "./employee-benefits-types.js";
import { benefitsTerminalPrompt, durableBenefitsJson } from "./employee-benefits-utils.js";
import { DependentCareStep } from "./dependent-care-step.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/beneficiary.md");

export class BeneficiaryStep extends Step {
  /**
   * Initializes the BeneficiaryStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Clears transient memory upon step entry to focus on beneficiary designations.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial synthetic prompt asking for beneficiary designations.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Collect life-insurance beneficiary names, relationships, and percentages.");
  }

  /**
   * Displays evidence of insurability (EOI) notes and beneficiary percentage rules on initial step entry.
   *
   * @param llmResult - Model generation output.
   * @returns Guidance text string or delegates to super.
   */
  public override async onResponse(llmResult: string | object) {
    if (this.getState<boolean>("needsPresentation")) {
      const pendingRequirements = this.getState<string[]>("pendingRequirements") ?? [];
      this.removeState("needsPresentation");
      this.removeState("pendingRequirements");
      const pendingNote = pendingRequirements.includes("EVIDENCE_OF_INSURABILITY")
        ? " Your 3× supplemental-life election requires evidence of insurability and remains pending until approved."
        : "";
      return `Your ancillary elections have been recorded.${pendingNote} Next, provide the name, relationship, and percentage allocation for each supplemental-life beneficiary. The total allocation must equal exactly 100%.`;
    }
    return super.onResponse(llmResult);
  }

  /**
   * Builds prompt instructing the LLM to collect beneficiary allocations totaling exactly 100%.
   *
   * @returns Formatted beneficiary prompt text.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Instructions}`;
  }

  /**
   * Defines tool schemas for capturing beneficiary allocations and ending enrollment.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_beneficiaries", description: "Validate beneficiary names, relationships, and allocations totaling 100 percent.", schema: BeneficiaryElectionSchema },
      { name: "end_beneficiary_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

  /**
   * Validates that beneficiary percentage allocations sum to exactly 100%, advancing to DependentCareStep.
   *
   * @param args - Tool invocation arguments matching BeneficiaryElectionSchema.
   * @returns Navigation response to DependentCareStep or stay if total is not 100%.
   */
  @Tool
  protected async capture_benefits_beneficiaries(args: unknown): Promise<ToolResponseType> {
    const parsed = BeneficiaryElectionSchema.safeParse(args);
    if (!parsed.success) return stay("Collect at least one beneficiary with name, relationship, and a whole-number percentage.");
    const total = parsed.data.beneficiaries.reduce((sum, beneficiary) => sum + beneficiary.percentage, 0);
    if (total !== 100) {
      return stay(`Beneficiary allocations total ${total}%; ask the employee either to adjust the current percentages or add beneficiaries so the complete allocation totals exactly 100%.`);
    }
    this.saveState({ election: durableBenefitsJson(parsed.data) });
    return go(DependentCareStep).withState({ needsPresentation: true });
  }

  /**
   * Handles user exit during beneficiary designation.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async end_beneficiary_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }
}
