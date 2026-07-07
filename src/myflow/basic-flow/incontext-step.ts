/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { StepClassType } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { HumanMessageEx, MessageTypes } from '@picoflow/core/utils/message-util';
import z from 'zod';
import { ConcurStep1 } from './concur-step1';
import { ConcurStep2 } from './concur-step2';

export class InContextStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(InContextStep, flow, isActive);
  }

  public onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    super.onCrossing(_langMessage, _priorStep);
    return new HumanMessageEx(this, 'Follow system prompt');
  }

  public getPrompt(): string {
    return `
      "Generate a sci-fi movie idea suitable for teens.";
    `;
  }

  protected async onEnter() {
    await super.onEnter();
    const msg = this.getTransientState<string>('msg');
    console.log('InContextStep.transient msg=', msg);
    const [concurStep1, concurStep2] = await this.runSteps([
      {
        step: ConcurStep1,
        userMessage: 'Run the first concurrent follow-up task.',
      },
      {
        step: ConcurStep2,
        userMessage: 'Run the second concurrent follow-up task.',
      },
    ]);
    this.saveState({ concurStep1, concurStep2 });
  }

  public async onResponse(
    llmResult: string | object,
  ): Promise<string | StepClassType> {
    this.saveState({ who: llmResult });
    return JSON.stringify(llmResult);
  }

  public structOutputSchema(): object {
    return z.object({
      title: z.string().describe('Movie title'),
      genre: z.string().describe('Main genre'),
      releaseYear: z.number().describe('Release year'),
      rating: z.number().min(0).max(10).describe('Rating from 0 to 10'),
      summary: z.string().describe('Short plot summary'),
    });
  }
}
