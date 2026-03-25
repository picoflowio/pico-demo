/*
 * Created on Mon Feb 02 2026
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { ToolCall } from '@langchain/core/messages/tool';
import { TravelPrompts } from './prompts';
import { TravelPlan, TravelPlanSchema } from './travel-types';
import { FlightStep } from './flight-step';
import { HotelStep } from './hotel-step';
import { ActivityStep } from './activity-step';
import { SynthesizerStep } from './synthesizer-step';
import { Step, Flow, ToolType, ToolResponseType } from '@picoflow/core';

export class PlannerStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(PlannerStep, flow, isActive);
  }

  public getPrompt(): string {
    return TravelPrompts.ANALYSIS_PROMPT;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'submit_plan',
        description:
          'Submit the structured travel plan extracted from user request',
        schema: TravelPlanSchema,
      },
    ];
  }

  public getTool(): string[] {
    return ['submit_plan'];
  }

  protected async submit_plan(tool: ToolCall): Promise<ToolResponseType> {
    const plan = tool.args as TravelPlan;
    // Save the plan to the flow context so other steps can access it
    this.saveState({ travelPlan: plan });
    if (plan?.user_intent === 'full_plan') {
      await this.runStep(FlightStep);
      await this.runStep(HotelStep);
      await this.runStep(ActivityStep);
    } else if (plan?.user_intent === 'flights_only') {
      await this.runStep(FlightStep);
    } else if (plan?.user_intent === 'hotels_only') {
      await this.runStep(HotelStep);
    } else if (plan?.user_intent === 'activities_only') {
      await this.runStep(ActivityStep);
    }

    return SynthesizerStep;
  }
}
