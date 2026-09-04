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
  constructor(flow: Flow) {
    super(flow);
  }
  public override onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, "Hi");
  }

  public override getPrompt(): string {
    const prompt = Prompt.replace(PROMPT, {
      QUESTION_SCHEMA: SCHEMA,
    });

    return prompt;
  }

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
