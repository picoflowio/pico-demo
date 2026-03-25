/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { Prompt, Step, Flow, MessageTypes, StepClassType, StringUtil } from "@picoflow/core";
import { HumanMessageEx } from "@picoflow/core/utils/message-util";
import { NameStep } from "./name-step";



const PROMPT = Prompt.file('prompt/favorites.md');
const SCHEMA = Prompt.file('prompt/favorites.json');

export class FavoritesStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(FavoritesStep, flow, isActive);
  }
  public onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, 'Hi');
  }

  public getPrompt(): string {
    const prompt = Prompt.replace(PROMPT, {
      QUESTION_SCHEMA: SCHEMA,
    });

    return prompt;
  }

  public onResponse(llmText: string): string | StepClassType {
    const json = StringUtil.parseJson(llmText);
    if (json) {
      this.saveState({ favorites: json });
      return NameStep;
    } else {
      return llmText;
    }
  }
}
