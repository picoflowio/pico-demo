/*
 * Created on Mon Feb 02 2026
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { PlannerStep } from './planner-step';
import { FlightStep } from './flight-step';
import { HotelStep } from './hotel-step';
import { ActivityStep } from './activity-step';
import { SynthesizerStep } from './synthesizer-step';
import { EndStep, Flow, Step } from '@picoflow/core';

export class TravelFlow extends Flow {
  public constructor() {
    super(TravelFlow);
    this.useModel('gpt-4o');
  }

  protected defineSteps(): Step[] {
    const model = 'gpt-5';

    return [
      new PlannerStep(this, true).useModel(model).useMemory('travelPlan'),
      new FlightStep(this).useModel(model).useMemory('travelPlan'),
      new HotelStep(this).useMemory('travelPlan'),
      new ActivityStep(this).useMemory('travelPlan'),
      new SynthesizerStep(this).useModel(model).useMemory('travelPlan'),
      new EndStep(this),
    ];
  }
}
