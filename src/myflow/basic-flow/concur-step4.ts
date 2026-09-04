/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Flow,
  JsonValue,
  LastResponseType,
} from "@picoflow/core";
import { Step } from "@picoflow/core";

export class ConcurStep4 extends Step {
  /**
   * Initializes the ConcurStep4 instance.
   *
   * @param flow - The enclosing Flow instance.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Returns system instructions for parallel execution step 4.
   *
   * @returns Prompt string confirming completion.
   */
  public override getPrompt(): string {
    return `
    You are ConcurStep4.
    Reply with one short sentence confirming the ConcurStep 4  follow-up task is complete.
    `;
  }

  /**
   * Records step 4 execution result into state and returns the response string.
   *
   * @param llmResult - Model response output.
   * @returns Raw string result.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    this.saveState({ concurStep4: llmResult as JsonValue });
    return llmResult as string;
  }
}
