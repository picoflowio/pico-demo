import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  go,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { benefitsTerminalPrompt } from "./employee-benefits-utils.js";
import { EmployeeBenefitsPrompt } from "./prompt/employee-benefits-prompt.js";

const Instructions = Prompt.file("prompt/ineligible.md");

export class IneligibleBenefitsStep extends Step {
  constructor(flow: Flow) { super(flow); }

  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the code-owned eligibility result and next step.");
  }

  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      ELIGIBILITY_DECISION: JSON.stringify(this.getState("decision") ?? null),
    })}`;
  }

  public override defineTool(): ToolType[] {
    return [{ name: "finish_ineligible_benefits", description: "Finish after explaining the eligibility result.", schema: z.object({ acknowledged: z.boolean() }) }];
  }

  @Tool
  protected async finish_ineligible_benefits(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no elections were submitted and recommend contacting the fictional benefits team for review."));
  }
}
