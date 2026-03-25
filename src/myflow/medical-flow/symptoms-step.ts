import { ToolCall } from '@langchain/core/messages/tool';
import {
  Flow,
  Step,
  EndStep,
  ToolResponseType,
  ToolType,
} from '@picoflow/core';
import { z } from 'zod';
import { BookingStep } from './booking-step';

export class SymptomsStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(SymptomsStep, flow, isActive);
  }

  public getPrompt(): string {
    return 'You are a helpful medical receptionist. Ask the user for their symptoms and reason for visit. Once you have a clear reason, use the `capture_symptoms` tool.';
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'capture_symptoms',
        description: 'Capture user symptoms to find an appropriate doctor',
        schema: z.object({
          symptoms: z
            .string()
            .describe('The reported symptoms or reason for visit'),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['capture_symptoms', 'end_chat'];
  }

  protected capture_symptoms(tool: ToolCall): ToolResponseType {
    const { symptoms } = tool.args;
    this.saveState({ symptoms });

    // Mock finding doctors based on symptoms
    const doctors = [
      {
        name: 'Dr. Smith',
        specialty: 'General Practice',
        availableTimes: ['10:00 AM', '2:00 PM'],
      },
      {
        name: 'Dr. Jones',
        specialty: 'Specialist',
        availableTimes: ['11:00 AM', '3:00 PM'],
      },
    ];

    return {
      step: BookingStep,
      state: { doctors },
    };
  }

  protected end_chat(_tool: ToolCall): ToolResponseType {
    return EndStep;
  }
}
