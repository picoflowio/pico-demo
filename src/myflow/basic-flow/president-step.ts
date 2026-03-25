/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { Step, Flow, MessageTypes } from "@picoflow/core";
import { HumanMessageEx } from "@picoflow/core/utils/message-util";

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
