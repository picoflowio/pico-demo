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
import { FlightOption, TravelPlan } from './travel-types';
import { TravelPrompts } from './prompts';
import { Step, Flow, Prompt, ToolType, ToolResponseType } from '@picoflow/core';
import { DirectMessage } from '@picoflow/core/utils/message-util';

export class FlightStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(FlightStep, flow, isActive);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepStateAs<TravelPlan>(
      PlannerStep,
      'travelPlan',
    );
    const prompt = Prompt.replace(TravelPrompts.FLIGHT_SEARCH_PROMPT, {
      PLAN: JSON.stringify(plan),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'search_flights',
        description: 'Search for flight options',
        schema: z.object({
          origin: z.string(),
          destination: z.string(),
          date: z.string(),
          isReturn: z
            .boolean()
            .describe('Whether the flight is a return flight'),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['search_flights'];
  }

  protected async search_flights(tool: ToolCall): Promise<ToolResponseType> {
    const flights = tool.args;
    // Mock Data
    let mockFlights: FlightOption[];
    if (flights.isReturn) {
      mockFlights = [
        {
          id: 'D1',
          airline: 'Air Demo',
          price: 450,
          departure_time: '10:00',
          arrival_time: '14:00',
        },
        {
          id: 'D2',
          airline: 'Pico Airways',
          price: 300,
          departure_time: '06:00',
          arrival_time: '11:00',
        },
        {
          id: 'D3',
          airline: 'Luxury Jets',
          price: 900,
          departure_time: '12:00',
          arrival_time: '16:00',
        },
      ];
      this.saveState({ returnFlights: mockFlights });
    } else {
      mockFlights = [
        {
          id: 'R1',
          airline: 'Air Demo',
          price: 550,
          departure_time: '11:00',
          arrival_time: '15:00',
        },
        {
          id: 'R2',
          airline: 'Pico Airways',
          price: 400,
          departure_time: '07:00',
          arrival_time: '16:00',
        },
        {
          id: 'R3',
          airline: 'Luxury Jets',
          price: 800,
          departure_time: '10:00',
          arrival_time: '17:00',
        },
      ];
      this.saveState({ departureFlights: mockFlights });
    }

    return {
      step: FlightStep,
      message: new DirectMessage(this, {}),
    };
  }
}
