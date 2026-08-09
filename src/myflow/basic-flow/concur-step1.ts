/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { StepClassType } from "@picoflow/core";
import { ConcurStep3 } from "./concur-step3.js";
import type { JsonValue, LastResponseType } from "@picoflow/core";

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
    const [_concurStep3] = await this.runSteps([
      {
        step: ConcurStep3,
        userMessage: "Run the ConcurStep3.",
      },
    ]);

    return llmResult as string;
  }
}
