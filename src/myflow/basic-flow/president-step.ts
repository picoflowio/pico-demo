/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, JsonValue, StepClassType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { HumanMessageEx, MessageTypes } from "@picoflow/core";

export class PresidentStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    const nth = this.getContext<string>("config.nth");
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

  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    this.saveState({ who: llmResult as JsonValue });
    return llmResult as string;
  }
}
