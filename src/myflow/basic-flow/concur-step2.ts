/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, JsonValue, StepClassType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { ConcurStep4 } from "./concur-step4.js";

export class ConcurStep2 extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return `
    You are ConcurStep2.
    Reply with one short sentence confirming ConcurStep2 follow-up task is complete.
    `;
  }

  protected async onEnter() {
    await super.onEnter();
    const [_concurStep3] = await this.runSteps([
      {
        step: ConcurStep4,
        userMessage: "Run the ConcurStep3.",
      },
    ]);
  }

  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    this.saveState({ concurStep2: llmResult as JsonValue });
    return llmResult as string;
  }
}
