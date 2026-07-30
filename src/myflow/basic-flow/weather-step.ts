/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { Flow } from '@picoflow/core';
import { ToolResponseType, ToolType } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { EndStep } from '@picoflow/core';
import { z } from 'zod';
import { DemoPrompt } from './prompt/demo-prompt.js';
import { FooLogicStep } from './foo-logic.js';
import { callCityTemperatureMcpTool } from '../../tools/city-temperature-mcp-client.js';

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
    const cityName = tool.args?.cityName;
    if (typeof cityName !== 'string') {
      return {
        step: WeatherStep,
        tool: 'Only LA and NYC cities are allowed',
      };
    }

    const [weather] = await callCityTemperatureMcpTool([cityName]);
    if (weather?.temperature !== null && weather?.temperature !== undefined) {
      const stateCityName = this.normalizeCityName(cityName);
      this.saveState({
        [`city_${stateCityName}`]: weather.temperature,
      });

      const LA = this.getState('city_LA');
      const NYC = this.getState('city_NYC');
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

  private normalizeCityName(cityName: string): string {
    const normalized = cityName.trim().toLowerCase();
    if (normalized === 'nyc') {
      return 'NYC';
    }
    if (normalized === 'la') {
      return 'LA';
    }
    return cityName;
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return { step: EndStep, prompt: DemoPrompt.AbruptEnd };
  }
}
