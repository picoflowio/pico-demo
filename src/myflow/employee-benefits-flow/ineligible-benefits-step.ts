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
  /**
   * Initializes the IneligibleBenefitsStep instance.
   *
   * @param flow - The parent EmployeeBenefitsFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on eligibility explanations.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Supplies initial synthetic prompt asking to explain the eligibility decision.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic user message.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the code-owned eligibility result and next step.");
  }

  /**
   * Builds prompt instructing the LLM to explain why the employee is ineligible and direct them to HR.
   *
   * @returns Formatted ineligible prompt text.
   */
  public override getPrompt(): string {
    return `${EmployeeBenefitsPrompt.Role}\n${Prompt.replace(Instructions, {
      ELIGIBILITY_DECISION: JSON.stringify(this.getState("decision") ?? null),
    })}`;
  }

  /**
   * Defines tool schema for acknowledging the ineligibility decision.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [{ name: "finish_ineligible_benefits", description: "Finish after explaining the eligibility result.", schema: z.object({ acknowledged: z.boolean() }) }];
  }

  /**
   * Concludes the session for ineligible employees, directing them to contact the benefits team.
   *
   * @returns Navigation response transitioning to TerminateSessionStep.
   */
  @Tool
  protected async finish_ineligible_benefits(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(benefitsTerminalPrompt("Confirm that no elections were submitted and recommend contacting the fictional benefits team for review."));
  }
}
