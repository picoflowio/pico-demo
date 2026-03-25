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
import { ActivityOption, TravelPlan } from './travel-types';
import { Step, Flow, Prompt, ToolType, ToolResponseType } from '@picoflow/core';
import { DirectMessage } from '@picoflow/core/utils/message-util';
import { TravelPrompts } from './prompts';

export class ActivityStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(ActivityStep, flow, isActive);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepStateAs<TravelPlan>(
      PlannerStep,
      'travelPlan',
    );

    const prompt = Prompt.replace(TravelPrompts.ACTIVITY_SEARCH_PROMPT, {
      PLAN: JSON.stringify(plan),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'search_activities',
        description: 'Search for activity options',
        schema: z.object({
          location: z.string(),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['search_activities'];
  }

  protected async search_activities(
    _tool: ToolCall,
  ): Promise<ToolResponseType> {
    // Mock Data
    const mockActivities: ActivityOption[] = [
      {
        id: 'A1',
        name: 'City Tour',
        price: 50,
        duration: '4 hours',
        description: 'Guided tour of the city.',
      },
      {
        id: 'A2',
        name: 'Museum Visit',
        price: 25,
        duration: '2 hours',
        description: 'Visit the national museum.',
      },
      {
        id: 'A3',
        name: 'Adventure Park',
        price: 100,
        duration: 'Full Day',
        description: 'Theme park access.',
      },
    ];

    this.saveState({ activities: mockActivities });

    return {
      step: ActivityStep,
      message: new DirectMessage(this, {}),
    };
  }
}
