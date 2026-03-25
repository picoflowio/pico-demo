import { ToolCall } from '@langchain/core/messages/tool';
import {
  Flow,
  Step,
  EndStep,
  ToolResponseType,
  ToolType,
} from '@picoflow/core';
import { z } from 'zod';

export class BookingStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(BookingStep, flow, isActive);
  }

  public getPrompt(): string {
    const doctors = this.getState('doctors');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const symptoms = String(this.getState('symptoms') ?? '');
    return `You have the user's symptoms: ${symptoms}. Here are the available doctors: ${JSON.stringify(doctors)}. Help the user pick a doctor and an available time slot. Once they decide, use the 'book_appointment' tool.`;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'book_appointment',
        description:
          'Book an appointment with the selected doctor at the chosen time.',
        schema: z.object({
          doctorName: z.string().describe('Name of the selected doctor'),
          timeSlot: z.string().describe('The chosen time slot'),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['book_appointment', 'end_chat'];
  }

  protected book_appointment(tool: ToolCall): ToolResponseType {
    const { doctorName, timeSlot } = tool.args;

    // In a real scenario, we'd save this to a DB.
    this.saveState({ doctorName, timeSlot, booked: true });

    return {
      step: EndStep,
      tool: `Successfully booked with ${doctorName} at ${timeSlot}. Thank you!`,
    };
  }

  protected end_chat(_tool: ToolCall): ToolResponseType {
    return EndStep;
  }
}
