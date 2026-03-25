/*
 * Created on Mon Feb 02 2026
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { ToolCall } from '@langchain/core/messages/tool';
import { z } from 'zod';
import { PlannerStep } from './planner-step';
import { HotelOption, TravelPlan } from './travel-types';
import { Step, Flow, Prompt, ToolType, ToolResponseType } from '@picoflow/core';
import { DirectMessage } from '@picoflow/core/utils/message-util';
import { TravelPrompts } from './prompts';

export class HotelStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(HotelStep, flow, isActive);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepStateAs<TravelPlan>(
      PlannerStep,
      'travelPlan',
    );
    const prompt = Prompt.replace(TravelPrompts.HOTEL_SEARCH_PROMPT, {
      PLAN: JSON.stringify(plan),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'search_hotels',
        description: 'Search for hotel options',
        schema: z.object({
          location: z.string(),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['search_hotels'];
  }

  protected async search_hotels(_tool: ToolCall): Promise<ToolResponseType> {
    // Mock Data
    const mockHotels: HotelOption[] = [
      {
        id: 'H1',
        name: 'Grand Pico Hotel',
        price_per_night: 150,
        rating: 4.5,
        location: 'City Center',
      },
      {
        id: 'H2',
        name: 'Budget Inn',
        price_per_night: 80,
        rating: 3.0,
        location: 'Suburbs',
      },
      {
        id: 'H3',
        name: 'Luxury Palace',
        price_per_night: 400,
        rating: 5.0,
        location: 'Beachfront',
      },
    ];

    this.saveState({ hotels: mockHotels });

    return {
      step: HotelStep,
      message: new DirectMessage(this, {}),
    };
  }
}
