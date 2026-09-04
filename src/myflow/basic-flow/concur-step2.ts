/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Flow,
  JsonValue,
  LastResponseType,
  Parallel,
} from "@picoflow/core";
import { Step } from "@picoflow/core";
import { ConcurStep4 } from "./concur-step4.js";

@Parallel
export class ConcurStep2 extends Step {
  /**
   * Initializes the ConcurStep2 instance.
   *
   * @param flow - The enclosing Flow instance.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Returns system instructions for parallel execution step 2.
   *
   * @returns Prompt string confirming completion.
   */
  public override getPrompt(): string {
    return `
    You are ConcurStep2.
    Reply with one short sentence confirming ConcurStep2 follow-up task is complete.
    `;
  }

  /**
   * Runs concurrent follow-up step `ConcurStep4` during step entry lifecycle.
   */
  protected override async onEnter() {
    await super.onEnter();
    const batch = await this.runSteps([
      {
        step: ConcurStep4,
        userMessage: "Run the ConcurStep3.",
      },
    ]);
    if (batch.rejected.length > 0) {
      throw new Error(batch.rejected[0]!.error.message);
    }
  }

  /**
   * Persists step 2 response in state and returns the response string.
   *
   * @param llmResult - Model response output.
   * @returns Raw string result.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    this.saveState({ concurStep2: llmResult as JsonValue });
    return llmResult as string;
  }
}
