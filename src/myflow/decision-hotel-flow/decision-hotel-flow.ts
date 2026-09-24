import {
  Flow,
  TerminateSessionStep,
  type Step,
} from '@picoflow/core';
import { AmenityStep } from './amenity-step.js';
import { BudgetStep } from './budget-step.js';
import { CriteriaReadinessJudgeStep } from './criteria-readiness-judge-step.js';
import { DateRangeStep } from './date-range-step.js';
import { DistanceStep } from './distance-step.js';
import { PresentStep } from './present-step.js';
import { PresentationJudgeStep } from './presentation-judge-step.js';
import { RoomTypeStep } from './room-type-step.js';
import { RouterStep } from './router-step.js';
import { SearchHotelsStep } from './search-hotels-step.js';


export class DecisionHotelFlow extends Flow {
  protected override configModel() {
    return {
      provider: 'openai',
      name: 'gpt-4o',
      retryAttempts: 2,
    } as const;
  }

  protected override configLlmCallPolicy() {
    return { timeoutMs: 60_000 };
  }

  protected override configDecision() {
    return {
      provider: 'typesafe',
      model: 'jev-latest',
      timeoutMs: 15_000,
      maxRetries: 2,
    };
  }

  protected override defineSteps(): Step[] {
    return [
      new RouterStep(this).useMemory('intake'),
      new DateRangeStep(this).useMemory('intake'),
      new BudgetStep(this).useMemory('intake'),
      new RoomTypeStep(this).useMemory('intake'),
      new AmenityStep(this).useMemory('intake'),
      new DistanceStep(this).useMemory('intake'),
      new CriteriaReadinessJudgeStep(this).useMemory(
        'intake',
      ),
      new SearchHotelsStep(this),
      new PresentStep(this).useMemory('present'),
      new PresentationJudgeStep(this).useMemory(
        'present',
      ),
      new TerminateSessionStep(this).useMemory('end'),
    ];
  }
}
