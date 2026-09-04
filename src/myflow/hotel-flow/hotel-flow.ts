/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { TerminateSessionStep } from '@picoflow/core';
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { ExploreStep } from './explore-step.js';
import { PresentStep } from './present-step.js';
import { CompareStep } from './compare-step.js';

export class HotelFlow extends Flow {
  public constructor() {
    super();

    //configure memory compaction, if no configuration is provided, the default is
    // to summarize after 16 messages, keeping the most recent 8 messages in memory
    this.getMemory()
      .setSummaryModel({ provider: 'openai', name: 'gpt-4o', retryAttempts: 3 })
      .setSummaryConfig({ minMessages: 8, recentMessages: 4 })
      .enableSummary('hotel-explore');
  }

  protected override configModel() {
    return { provider: 'openai', name: 'gpt-4o', retryAttempts: 3 } as const;
  }

  protected override defineSteps(): Step[] {
    return [
      new ExploreStep(this)
        .useMemory('hotel-explore')
        .useModel({
          provider: 'openai',
          name: 'gpt-5.1',
          params: { reasoning: { effort: 'low' } },
        }),
      new PresentStep(this).useModel({
        provider: 'openai',
        name: 'gpt-4o',
        params: { temperature: 0.5 },
      }),
      new CompareStep(this).useModel({
        provider: 'openai',
        name: 'gpt-5.1',
        params: { reasoning: { effort: 'low' } },
      }),
      new TerminateSessionStep(this).useMemory('end'),
    ];
  }
}
