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
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the automated quote referral using only the recorded reason codes.");
  }

  public getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      DECISION: JSON.stringify(this.getState("decision") ?? "referral"),
      REASON_CODES: JSON.stringify(this.getState<string[]>("reasonCodes") ?? []),
    })}`;
  }

  public defineTool(): ToolType[] {
    return [{ name: "finish_home_quote_referral", description: "Finish the automated referral after explaining its reason codes.", schema: z.object({ acknowledged: z.boolean() }) }];
  }

  @Tool
  protected async finish_home_quote_referral(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and explain that an agent would need to review the application before any quote could be offered."));
  }
}
