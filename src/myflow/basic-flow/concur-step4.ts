/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, JsonValue, StepClassType } from "@picoflow/core";
import { Step } from "@picoflow/core";

export class ConcurStep4 extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return `
    You are ConcurStep4.
    Reply with one short sentence confirming the ConcurStep 4  follow-up task is complete.
    `;
  }
  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    this.saveState({ concurStep4: llmResult as JsonValue });
    return llmResult as string;
  }
}
