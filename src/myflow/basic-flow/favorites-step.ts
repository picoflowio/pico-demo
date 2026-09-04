/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */

import { Flow } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { NameStep } from "./name-step.js";
import { Prompt } from "@picoflow/core";
import { StringUtil } from "@picoflow/core";
import { HumanMessageEx, MessageTypes } from "@picoflow/core";
import { go } from "@picoflow/core";
import type { JsonValue, LastResponseType } from "@picoflow/core";

const PROMPT = Prompt.file("prompt/favorites.md");
const SCHEMA = Prompt.file("prompt/favorites.json");

export class FavoritesStep extends Step {
  /**
   * Initializes the FavoritesStep with the parent Flow instance.
   *
   * @param flow - The Flow instance orchestrating this step.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Generates a conversational entry greeting message when crossing into this step.
   *
   * @param _langMessage - The raw message entering the step.
   * @param _priorStep - Optional identifier of the previous step.
   * @returns Synthetic human message initiating favorite collection dialog.
   */
  public override onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, "Hi");
  }

  /**
   * Loads and renders the favorites questionnaire prompt with embedded JSON schema.
   *
   * @returns Formatted prompt text for the LLM.
   */
  public override getPrompt(): string {
    const prompt = Prompt.replace(PROMPT, {
      QUESTION_SCHEMA: SCHEMA,
    });

    return prompt;
  }

  /**
   * Processes the model's response, parsing JSON favorites payload, persisting it to state,
   * and advancing to `NameStep` once valid favorites are captured.
   *
   * @param llmResult - Model response output either as raw text or structured object.
   * @returns Navigation response to `NameStep` or raw string if parsing is pending.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    const json =
      typeof llmResult === "string"
        ? StringUtil.parseJson<JsonValue>(llmResult)
        : (llmResult as JsonValue);

    if (json && typeof json === "object" && !Array.isArray(json)) {
      this.saveState({ favorites: json });
      return go(NameStep);
    }

    return typeof llmResult === "string"
      ? llmResult
      : JSON.stringify(llmResult);
  }
}
