/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Parallel } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { StepClassType } from "@picoflow/core";
import { ConcurStep3 } from "./concur-step3.js";
import type { JsonValue, LastResponseType } from "@picoflow/core";

@Parallel
export class ConcurStep1 extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return `
    You are ConcurStep1.
    Reply with one short sentence confirming ConcurStep1 follow-up task is complete.
    `;
  }

  public async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    this.saveState({ concurStep1: llmResult as JsonValue });
    const batch = await this.runSteps([
      {
        step: ConcurStep3,
        userMessage: "Run the ConcurStep3.",
      },
    ]);
    if (batch.rejected.length > 0) {
      throw new Error(batch.rejected[0]!.error.message);
    }

    return llmResult as string;
  }
}
