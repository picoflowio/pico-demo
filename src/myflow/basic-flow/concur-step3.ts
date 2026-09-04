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
  StepClassType,
} from "@picoflow/core";
import { Step } from "@picoflow/core";
import { ConcurStep1 } from "./concur-step1.js";

@Parallel
export class ConcurStep3 extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return `
    You are ConcurStep3.
    Reply with one short sentence confirming the ConcurStep 3  follow-up task is complete.
    `;
  }

  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    const foo = this.flow.getStepState(ConcurStep1, 'concurStep1');
    console.log(`ConcurStep3 fetch ConcurStep1 {concurStep1:${foo}}`);

    this.saveState({ concurStep3: llmResult as JsonValue });
    return llmResult as string;
  }
}
