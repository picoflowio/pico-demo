/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { PlannerStep } from './planner-step.js';
import { FlightStep } from './flight-step.js';
import { HotelStep } from './hotel-step.js';
import { ActivityStep } from './activity-step.js';
import { SynthesizerStep } from './synthesizer-step.js';
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { EndStep } from '@picoflow/core';

export class TravelFlow extends Flow {
  public constructor() {
    super(TravelFlow);
    this.useModel('gemini-2.5-pro');
  }

  protected defineSteps(): Step[] {
    return [
      new PlannerStep(this, true).useMemory('travelPlan'),
      new FlightStep(this).useMemory('travelPlan'),
      new HotelStep(this).useMemory('travelPlan'),
      new ActivityStep(this).useMemory('travelPlan'),
      new SynthesizerStep(this).useMemory('travelPlan'),
      new EndStep(this),
    ];
  }
}
