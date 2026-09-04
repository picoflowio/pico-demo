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
import { ConcurStep1 } from "./concur-step1.js";

export class ConcurStep3 extends Step {
  /**
   * Initializes the ConcurStep3 instance.
   *
   * @param flow - The enclosing Flow instance.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Returns system instructions for parallel execution step 3.
   *
   * @returns Prompt string confirming completion.
   */
  public override getPrompt(): string {
    return `
    You are ConcurStep3.
    Reply with one short sentence confirming the ConcurStep3 follow-up task is complete.
    `;
  }

  /**
   * Retrieves state from sibling `ConcurStep1`, persists step 3 results, and returns output.
   *
   * @param llmResult - Model response output.
   * @returns Raw string result.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    const foo = this.flow.getStepState(ConcurStep1, 'concurStep1');
    console.log(`ConcurStep3 fetch ConcurStep1 {concurStep1:${foo}}`);

    this.saveState({ concurStep3: llmResult as JsonValue });
    return llmResult as string;
  }
}
