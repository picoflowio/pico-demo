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
import { terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";

const Instructions = Prompt.file("prompt/referral.md");

export class ReferralStep extends Step {
  /**
   * Initializes the ReferralStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on referral explanations.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Generates a synthetic user prompt requesting an explanation of the underwriting referral or declination.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking to explain referral reason codes.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the automated quote referral using only the recorded reason codes.");
  }

  /**
   * Builds the prompt instructing the LLM to explain why the home quote could not be bound online,
   * referencing recorded underwriting reason codes.
   *
   * @returns Formatted referral prompt text.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      DECISION: JSON.stringify(this.getState("decision") ?? "referral"),
      REASON_CODES: JSON.stringify(this.getState<string[]>("reasonCodes") ?? []),
    })}`;
  }

  /**
   * Defines tool schema for acknowledging and finishing the referral explanation.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [{ name: "finish_home_quote_referral", description: "Finish the automated referral after explaining its reason codes.", schema: z.object({ acknowledged: z.boolean() }) }];
  }

  /**
   * Finishes the referral workflow and transitions to TerminateSessionStep.
   *
   * @returns Navigation response to TerminateSessionStep.
   */
  @Tool
  protected async finish_home_quote_referral(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and explain that an agent would need to review the application before any quote could be offered."));
  }
}
