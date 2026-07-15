/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { EndStep } from '@picoflow/core';
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { ExploreStep } from './explore-step';
import { PresentStep } from './present-step';
import { CompareStep } from './compare-step';

export class HotelFlow extends Flow {
  public constructor() {
    super(HotelFlow);
    // this.useModel('claude-opus-4-6');
    this.useModel('gpt-4o');
    // this.useModel('gpt-5.1');
    // this.useModel('nvidia-deepseek-v4-flash');

    //configure memory compaction, if no configuration is provided, the default is
    // to summarize after 16 messages, keeping the most recent 8 messages in memory
    this.getMemory()
      .setSummaryModel('gpt-4o')
      .setSummaryConfig({ minMessages: 16, recentMessages: 8 })
      .enableSummary('hotel-explore');
  }

  protected defineSteps(): Step[] {
    return [
      new ExploreStep(this, true)
        .useMemory('hotel-explore')
        .useModel('gpt-5.1')
        .useModelParams<'gpt-5.1'>({
          reasoning: { effort: 'low' },
        }),
      new PresentStep(this).useModelParams<'gpt-4o'>({
        temperature: 0.5,
      }),
      new CompareStep(this).useModel('gpt-5.1').useModelParams<'gpt-5.1'>({
        reasoning: { effort: 'low' },
      }),
      new EndStep(this).useMemory('end'),
    ];
  }
}
