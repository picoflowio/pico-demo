/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { z } from 'zod';
import { DemoPrompt } from './prompt/demo-prompt';
import { FooLogicStep } from './foo-logic';
import { Step, Flow, ToolType, ToolResponseType, EndStep } from '@picoflow/core';

export class WeatherStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(WeatherStep, flow, isActive);
  }

  public getPrompt(): string {
    return `
    ${DemoPrompt.TravelRole}
    Ask user to enter 2 city names to compare their current day temperature.
    Capture the names of the two cities and call tool 'get_weather' for each city
    If user prefer to exit, call tool 'end_chat'.
    `;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'get_weather',
        description: 'capture the weather of one city',
        schema: z.object({
          cityName: z.string().describe('Name of city'),
        }),
      },
    ];
  }
  public getTool(): string[] {
    return ['get_weather', 'end_chat'];
  }

  protected async get_weather(tool: ToolCall): Promise<ToolResponseType> {
    if (tool.args?.cityName === 'NYC' || tool.args?.cityName === 'LA') {
      this.saveState({
        [`cityName_${tool.args?.cityName}`]: true,
      });

      const LA = this.getState('cityName_LA');
      const NYC = this.getState('cityName_NYC');
      if (LA && NYC) {
        // return NameStep;
        return FooLogicStep;
      } else {
        return WeatherStep;
      }
    } else {
      return {
        step: WeatherStep,
        tool: 'Only LA and NYC cities are allowed',
      };
    }
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return { step: EndStep, prompt: DemoPrompt.AbruptEnd };
  }
}
