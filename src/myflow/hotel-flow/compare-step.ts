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
import { ExploreStep } from './explore-step';
import { FlowPrompt } from '@picoflow/core/prompt/flow-prompt';
import { PresentStep } from './present-step';
import { PricingEngine } from './backend/pricing-engine';
import { merge } from 'lodash';
import { GenChart } from './gen-chart';
import { Prompt } from '@picoflow/core/prompt/prompt-util';
import { AiMessageEx } from '@picoflow/core/utils/message-util';
//........................................................
const ComparePrompt = Prompt.file('prompt/compare.md');
//........................................................
export class CompareStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(CompareStep, flow, isActive);
  }

  protected onEnter() {
    this.eraseMemory();
  }

  public getPrompt(): string {
    const chosen_hotels = (this.getState('chosen_hotels') as []) ?? [];
    const available_hotel = this.getState(`available_hotel`) ?? [];

    let prompt = `
    ${ComparePrompt}
    ${FlowPrompt.EndChat}
    `;

    const hotels = chosen_hotels.map((entry) => {
      return { hotelName: entry['hotelName'] };
    });

    prompt = Prompt.replace(prompt, {
      ChosenHotels: JSON.stringify(hotels),
      AvailableHotels: JSON.stringify(available_hotel),
    });

    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'generate_comparison',
        description: 'Call to generate comparison',
        schema: z.object({
          hotels: z.array(z.string()).describe('Hotels name chosen'),
          feature: z.string().describe('chosen feature'),
        }),
      },
      {
        name: 'resume_booking',
        description: 'Resume to booking',
        schema: z.object({
          isResumed: z.boolean().describe('is resume booking'),
        }),
      },
    ];
  }
  public getTool(): string[] {
    return ['generate_comparison', 'resume_booking', 'end_chat'];
  }

  protected async generate_comparison(
    tool: ToolCall,
  ): Promise<ToolResponseType> {
    //perform a hotel search
    let chosenHotels;
    try {
      chosenHotels = JSON.parse(tool.args?.hotels);
    } catch (_e) {
      chosenHotels = tool.args?.hotels;
    }

    this.saveState({ compare_hotel: chosenHotels });

    const feature = tool.args?.feature;
    // console.log(`feature: ${feature}`);

    //find the full hotel doc from DB
    const fetchHotels = (await PricingEngine.fetchHotels(
      chosenHotels,
    )) as object[];

    //merge the price into the chosenHotels JSON
    const hotelAvailable = this.flow.getStepState(
      PresentStep,
      'hotelFound',
    ) as object[];

    let finalHotels = fetchHotels.map((doc) => {
      for (const aHotel of hotelAvailable) {
        if (aHotel['hotelName'] === doc['hotelName']) {
          const myFeatures = {};
          merge(myFeatures, { hotelName: doc['hotelName'] });
          if (feature === 'amenities') {
            merge(myFeatures, GenChart.flattenObject(doc['amenities']));
          } else if (feature === 'roomType') {
            merge(myFeatures, GenChart.transRoomType(doc['roomType']));
          } else if (feature === 'distance') {
            merge(myFeatures, { cityCenter: `${doc['cityCenter']} mi` });
            merge(myFeatures, { airport: `${doc['airport']} mi` });
          } else if (feature === 'price') {
            const tree = this.flow.getStepState(ExploreStep, 'json');
            const dates = tree['cDateArray'];
            const prices = aHotel['prices'];
            const jObject = GenChart.createJsonObject(dates, prices);
            merge(myFeatures, jObject);
            merge(myFeatures, {
              total: GenChart.formatCurrency(aHotel['total']),
            });
          }

          return {
            ...myFeatures,
          };
        }
      }
    });

    if (feature === 'amenities' || feature === 'roomType') {
      finalHotels = GenChart.transAmenities(finalHotels);
    }

    this.saveState({ chosen_hotels: finalHotels });

    //produce a comparison chart
    const table = GenChart.getChart(finalHotels);

    const msg = new AiMessageEx(
      this,
      `${table}\nAnother comparison or ready to book?`,
      { direct: true },
    );
    return { step: CompareStep, message: msg };
  }

  protected async resume_booking(_tool: ToolCall): Promise<ToolResponseType> {
    return PresentStep;
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return EndStep;
  }
}
