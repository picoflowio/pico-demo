/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Flow,
  JsonValue,
  LastResponseType,
} from "@picoflow/core";
import { Step } from "@picoflow/core";
import { HumanMessageEx, MessageTypes } from "@picoflow/core";

export class PresidentStep extends Step {
  /**
   * Initializes the PresidentStep with the enclosing flow.
   *
   * @param flow - The Flow instance controlling execution.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Constructs the synthetic user query asking for a specific US president by ordinal number,
   * then flags the session as completed.
   *
   * @param _langMessage - Message crossing into the step.
   * @param _priorStep - Optional previous step name.
   * @returns Synthetic human message posing the presidential history query.
   */
  public override onCrossing(
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

  /**
   * Returns system instructions establishing the persona for presidential history responses.
   *
   * @returns Persona prompt string.
   */
  public override getPrompt(): string {
    return `
      You are a U.S. Presidential historian";
    `;
  }

  /**
   * Stores the LLM response identifying the president in step state and returns the response text.
   *
   * @param llmResult - Model result string or structured output.
   * @returns The raw string response.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    this.saveState({ who: llmResult as JsonValue });
    return llmResult as string;
  }
}
