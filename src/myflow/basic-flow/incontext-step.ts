/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Step, Flow, MessageTypes, StepClassType } from '@picoflow/core';
import { HumanMessageEx } from '@picoflow/core/utils/message-util';
import z from 'zod';

export class InContextStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(InContextStep, flow, isActive);
  }

  public onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, 'Follow system prompt');
  }

  public getPrompt(): string {
    return `
      "Generate a sci-fi movie idea suitable for teens.";
    `;
  }

  public onResponse(llmText: string): string | StepClassType {
    this.saveState({ who: llmText });
    return llmText;
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
