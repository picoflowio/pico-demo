/*
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
import { HotelPrompt } from './prompt/hotel-prompt';
import moment from 'moment';
import { set } from 'lodash';
import { PresentStep } from './present-step';
import { PricingEngine } from './backend/pricing-engine';
import { FlowPrompt } from '@picoflow/core/prompt/flow-prompt';
import { Prompt } from '@picoflow/core/prompt/prompt-util';
//........................................................
const ExplorePartial = Prompt.file('prompt/explore.md');
const ExplorePrompt = `
  ${HotelPrompt.Role}
  ${ExplorePartial}
  ${FlowPrompt.EndChat}
  `;

const HotelJSON = Prompt.file('prompt/explore.json');
//........................................................
export class ExploreStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(ExploreStep, flow, isActive);
  }

  public getPrompt(): string {
    const hotelJson = JSON.parse(HotelJSON);
    set(hotelJson, 'currentDate', moment().utc().format());

    const hotelFound = this.getState('hotelFound');
    if (hotelFound) {
      set(hotelJson, 'hotelFound', hotelFound);
    }

    const prompt = Prompt.replace(ExplorePrompt, {
      HOTEL_JSON: JSON.stringify(hotelJson),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'capture_choices',
        description: 'Capture user choice for hotel search criteria',
        schema: z.object({
          json: z.string().describe('JSON object'),
        }),
      },
    ];
  }
  public getTool(): string[] {
    return ['capture_choices', 'end_chat'];
  }

  public getStopTool(): string[] {
    return ['capture_dates', 'capture_budget'];
  }

  protected async capture_choices(tool: ToolCall): Promise<ToolResponseType> {
    //do a hotel search here.
    let choices;
    try {
      choices = JSON.parse(tool.args?.json);
    } catch (_ex) {
      /* empty */
    }
    this.saveState({
      json: choices,
    });

    const startDate = choices['cDate']['start'];
    const endDate = choices['cDate']['end'];
    const roomType = choices['cRoomType'];
    const amenities = choices['cAmenities'];
    const maxBudget = choices['cPriceRange']['max'] ?? null;
    const minBudget = choices['cPriceRange']['min'] ?? null;
    const cityCenter = choices['cDistance']['cityCenter'];
    const airport = choices['cDistance']['airport'];

    const hotelEntries = await PricingEngine.searchHotel(
      startDate,
      endDate,
      amenities,
      roomType,
      maxBudget,
      minBudget,
      airport,
      cityCenter,
    );
    if (hotelEntries && hotelEntries.length > 0) {
      const hotelFoundInfo = hotelEntries.map((entry) => {
        return {
          hotelName: entry.hotelName,
          total: entry.total,
          prices: entry.prices,
        };
      });
      return {
        step: PresentStep,
        // tool: 'Hotels found.',
        state: {
          hotelFound: hotelFoundInfo,
        },
      };
    } else {
      return {
        step: ExploreStep,
        tool: 'No hotel found, please adjust your criteria and try again.',
      };
    }
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return EndStep;
  }
}
