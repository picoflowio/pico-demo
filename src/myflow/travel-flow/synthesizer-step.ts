/*
 * Created on Mon Feb 02 2026
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { TravelPrompts } from './prompts';
import {
  TravelPlan,
  FlightOption,
  HotelOption,
  ActivityOption,
  TravelPackageSchema,
} from './travel-types';
import { z } from 'zod';
import { PlannerStep } from './planner-step';
import { FlightStep } from './flight-step';
import { HotelStep } from './hotel-step';
import { ActivityStep } from './activity-step';
import {
  Step,
  Flow,
  ToolType,
  ToolResponseType,
  EndStep,
} from '@picoflow/core';

export class SynthesizerStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(SynthesizerStep, flow, isActive);
  }

  public async run(message: string): Promise<any> {
    const plan = this.flow.getContext<TravelPlan>('travelPlan');
    const flights = this.flow.getContext<FlightOption[]>('flightOptions') || [];
    const hotels = this.flow.getContext<HotelOption[]>('hotelOptions') || [];
    const activities =
      this.flow.getContext<ActivityOption[]>('activityOptions') || [];

    // Store these in state so the LLM prompt can access them
    this.saveState({
      plan,
      flights,
      hotels,
      activities,
    });

    return super.run(message);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepStateAs<TravelPlan>(
      PlannerStep,
      'travelPlan',
    );
    const departureFlights = this.flow.getStepStateAs<FlightOption>(
      FlightStep,
      'departureFlights',
    );
    const returnFlights = this.flow.getStepStateAs<FlightOption>(
      FlightStep,
      'returnFlights',
    );
    const hotels = this.flow.getStepStateAs<HotelOption>(HotelStep, 'hotels');
    const activities = this.flow.getStepStateAs<ActivityOption>(
      ActivityStep,
      'activities',
    );

    return `
    ${TravelPrompts.SYNTHESIS_PROMPT}

    **CLIENT'S PLAN:**
    ${JSON.stringify(plan)}

    **AVAILABLE OPTIONS:**
    - Departure Flights: ${JSON.stringify(departureFlights)}
    - Return Flights: ${JSON.stringify(returnFlights)}
    - Hotels: ${JSON.stringify(hotels)}
    - Activities: ${JSON.stringify(activities)}
    `;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'generate_packages',
        description: 'Submit the generated travel packages',
        schema: z.object({
          packages: z.array(TravelPackageSchema),
        }),
      },
      {
        name: 'choose_package',
        description: 'Choose a package',
        schema: z.object({
          chosenPackage: TravelPackageSchema,
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['generate_packages', 'choose_package'];
  }

  protected async generate_packages(tool: ToolCall): Promise<ToolResponseType> {
    const packages = tool.args?.packages;
    this.saveState({ packages });

    return SynthesizerStep;
  }

  protected async choose_package(tool: ToolCall): Promise<ToolResponseType> {
    const chosenPackage = tool.args?.chosenPackage;
    this.saveState({ chosenPackage });

    const prompt =
      'Thank user for using travel planning service. Tell them it is booked';

    return { step: EndStep, prompt };
  }
}
