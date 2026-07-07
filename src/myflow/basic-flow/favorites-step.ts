/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { NameStep } from './name-step';
import { Prompt } from '@picoflow/core';
import { StringUtil } from '@picoflow/core';
import { StepClassType } from '@picoflow/core';
import { HumanMessageEx, MessageTypes } from '@picoflow/core/utils/message-util';

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

  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    if (typeof llmResult === 'string') {
      const json = StringUtil.parseJson(llmResult);
      if (json) {
        this.saveState({ favorites: json });
        return NameStep;
      } else {
        return llmResult as string;
      }
    } else {
      JSON.stringify(llmResult);
    }
  }
}
