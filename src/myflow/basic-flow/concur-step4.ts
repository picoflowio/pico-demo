/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';

export class ConcurStep4 extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(ConcurStep4, flow, isActive);
  }

  public getPrompt(): string {
    return `
    You are ConcurStep3.
    Reply with one short sentence confirming the second concurrent follow-up task is complete.
    `;
  }
}
