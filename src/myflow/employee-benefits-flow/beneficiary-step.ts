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
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Collect life-insurance beneficiary names, relationships, and percentages.");
  }

  public getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Instructions}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "capture_benefits_beneficiaries", description: "Validate beneficiary names, relationships, and allocations totaling 100 percent.", schema: BeneficiaryElectionSchema },
      { name: "end_beneficiary_enrollment", description: "End enrollment without submitting elections.", schema: z.object({}) },
    ];
  }

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

  @Tool
  protected async end_beneficiary_enrollment(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no benefits elections were submitted."));
  }
}
