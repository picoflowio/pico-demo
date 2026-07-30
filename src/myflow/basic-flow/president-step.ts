/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import messageUtil from '@picoflow/core/utils/message-util';
import type { MessageTypes } from '@picoflow/core/utils/message-util';
const { HumanMessageEx } = messageUtil;

export class PresidentStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(PresidentStep, flow, isActive);
  }

  public onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    const nth = this.getContext<string>('config.nth');
    this.sessionCompleted();
    return new HumanMessageEx(
      this,
      `Who is the ${nth} President of United State`,
    );
  }

  public getPrompt(): string {
    return `
      You are a U.S. Presidential historian";
    `;
  }
}
