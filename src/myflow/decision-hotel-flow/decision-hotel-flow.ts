import {
  Flow,
  TerminateSessionStep,
  ToolType,
  type Step,
} from '@picoflow/core';
import { z } from 'zod';
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

export const DECISION_HOTEL_INTAKE_MEMORY = 'decision-hotel-intake';
export const DECISION_HOTEL_PRESENT_MEMORY = 'decision-hotel-present';

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

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'reroute_request',
        description:
          'Return a request that belongs to another hotel criterion to RouterStep.',
        schema: z.object({}),
      },
    ];
  }

  protected override defineSteps(): Step[] {
    return [
      new RouterStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new DateRangeStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new BudgetStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new RoomTypeStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new AmenityStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new DistanceStep(this).useMemory(DECISION_HOTEL_INTAKE_MEMORY),
      new CriteriaReadinessJudgeStep(this).useMemory(
        DECISION_HOTEL_INTAKE_MEMORY,
      ),
      new SearchHotelsStep(this),
      new PresentStep(this).useMemory(DECISION_HOTEL_PRESENT_MEMORY),
      new PresentationJudgeStep(this).useMemory(
        DECISION_HOTEL_PRESENT_MEMORY,
      ),
      new TerminateSessionStep(this).useMemory('decision-hotel-end'),
    ];
  }
}
