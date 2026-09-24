import {
  FlowPrompt,
  HumanMessageEx,
  Prompt,
  Step,
  Tool,
  finish,
  go,
  stay,
  type Flow,
  type LastResponseType,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from '@picoflow/core';
import { z } from 'zod';
import type { SearchHotelEntry } from '../hotel-flow/backend/pricing-engine.js';
import { PresentationJudgeStep } from './presentation-judge-step.js';

const Instructions = Prompt.file('prompt/present.md');

export class PresentStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public override onCrossing(
    _message: MessageTypes | null | undefined,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, 'Present the current matching hotels.');
  }

  public override getPrompt(): string {
    return Prompt.replace(`${Instructions}\n${FlowPrompt.EndChat}`, {
      HOTEL_FOUND_INFO: JSON.stringify(
        this.getState<SearchHotelEntry[]>('hotelFound') ?? [],
      ),
    });
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'chosen_hotel',
        description: 'Book one hotel from the presented result list.',
        schema: z.object({
          hotelName: z.string().min(1),
        }),
      },
      {
        name: 'revise_search',
        description: 'Return any requested criteria revision to the decision router.',
        schema: z.object({}),
      },
    ];
  }

  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    const draft =
      typeof llmResult === 'string' ? llmResult : JSON.stringify(llmResult);
    this.saveState({ draft });
    return go(PresentationJudgeStep);
  }

  @Tool
  protected async chosen_hotel(args: {
    hotelName: string;
  }): Promise<ToolResponseType> {
    const hotels = this.getState<SearchHotelEntry[]>('hotelFound') ?? [];
    const selected = resolveHotel(args.hotelName, hotels);
    if (!selected) {
      return stay('Choose a hotel name or number from the current result list.');
    }

    const confirmationNumber = Math.floor(100000 + Math.random() * 900000);
    this.saveState({
      selectedHotel: selected.hotelName,
      confirmationNumber,
    });
    return finish(
      `${selected.hotelName} is booked with confirmation #${confirmationNumber}. Thank you for choosing Hilton.`,
    );
  }

  @Tool
  protected async revise_search(): Promise<ToolResponseType> {
    const message = this.getLastMessage();
    return message
      ? go('RouterStep').withMessage(message)
      : go('RouterStep');
  }

  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    return finish('Thanks for considering Hilton hotels in Portland.');
  }
}

function resolveHotel(
  requested: string,
  hotels: readonly SearchHotelEntry[],
): SearchHotelEntry | undefined {
  const normalized = requested.trim().toLowerCase();
  const index = Number.parseInt(normalized, 10);
  if (/^\d+$/.test(normalized) && index >= 1 && index <= hotels.length) {
    return hotels[index - 1];
  }
  return hotels.find(
    (hotel) => hotel.hotelName.toLowerCase() === normalized,
  );
}
