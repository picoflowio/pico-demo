/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { StepClassType } from '@picoflow/core';
import { ConcurStep3 } from './concur-step3';

export class ConcurStep1 extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(ConcurStep1, flow, isActive);
  }

  public getPrompt(): string {
    return `
    You are ConcurStep1.
    Reply with one short sentence confirming the first concurrent follow-up task is complete.
    `;
  }

  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    this.saveState({ concurStep1: llmResult });
    return ConcurStep3;
  }
}
