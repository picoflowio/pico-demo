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
    this.useModel('gpt-4o');
  }

  protected defineSteps(): Step[] {
    const model = 'gpt-5';
    return [
      new ExploreStep(this, true).useModel<'gpt-5'>(model, {
        reasoning: { effort: 'medium' },
      }),
      new PresentStep(this, false).useModel(model),
      new CompareStep(this, false).useModel(model),
      new EndStep(this).useMemory('end').useModel(model),
    ];
  }
}
