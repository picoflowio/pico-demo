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
import { SearchHotelEntry } from './backend/pricing-engine';
import { ExploreStep } from './explore-step';
import { MessageTypes } from '@picoflow/core/utils/message-util';
import { FlowPrompt } from '@picoflow/core/prompt/flow-prompt';
import { CompareStep } from './compare-step';
import { Prompt } from '@picoflow/core';
import { HumanMessageEx } from '@picoflow/core/utils/message-util';

const PresentPrompt = Prompt.file('prompt/present.md');
//........................................................
export class PresentStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(PresentStep, flow, isActive);
  }

  protected onEnter() {
    //switch from active to inactive, erase memory
    this.eraseMemory();
  }

  public onCrossing(
    _userMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, 'What hotels choice I have');
  }

  public getPrompt(): string {
    const hotelFoundInfo = this.getState('hotelFound') as SearchHotelEntry;
    let prompt = `
    ${PresentPrompt}
    ${FlowPrompt.EndChat}
    `;

    prompt = Prompt.replace(prompt, {
      HOTEL_FOUND_INFO: JSON.stringify(hotelFoundInfo),
    });

    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'chosen_hotel',
        description: 'Capture user choice of hotel',
        schema: z.object({
          hotelName: z.string().describe('Hotel name chosen'),
        }),
      },
      {
        name: 'search_again',
        description: 'User request to re-run the search hotel again',
        schema: z.object({
          isSearch: z.boolean().describe('run the search'),
        }),
      },
      {
        name: 'go_compare',
        description: 'User request compare hotel',
        schema: z.object({
          hotelsToCompare: z
            .array(z.string())
            .describe('Hotel names chosen to be compared'),
        }),
      },
    ];
  }
  public getTool(): string[] {
    return ['chosen_hotel', 'search_again', 'go_compare', 'end_chat'];
  }

  protected async chosen_hotel(tool: ToolCall): Promise<ToolResponseType> {
    this.saveState({ hotel: tool.args?.hotelName });
    const msg = `Tell user hotel is booked with confirmation #:${this.generateConfirmationNumber()}. Thank the user for choosing Hilton, you MUST NOT talk other things!`;
    return { step: EndStep, prompt: msg };
  }

  protected async search_again(_tool: ToolCall): Promise<ToolResponseType> {
    //forward last message to ExploreStep
    return { step: ExploreStep, message: this.getLastMessage() };
  }

  protected async go_compare(tool: ToolCall): Promise<ToolResponseType> {
    this.flow.saveStepState(CompareStep, {
      compare_hotel: tool.args?.hotelsToCompare,
    });

    const availableHotel = this.flow.getStepState(
      PresentStep,
      'hotelFound',
    ) as [];

    const strAvailableHotel = availableHotel.map((entry) => {
      return entry['hotelName'];
    }) as string[];

    return {
      step: CompareStep,
      state: {
        available_hotel: strAvailableHotel,
      },
      message: this.getLastMessage(),
    };
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return EndStep;
  }

  private generateConfirmationNumber(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }
}
