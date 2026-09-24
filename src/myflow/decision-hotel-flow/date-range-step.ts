import { Prompt, Tool, stay, type Flow, type ToolResponseType, type ToolType } from '@picoflow/core';
import { z } from 'zod';
import { CriteriaStep } from './criteria-step.js';

const Instructions = Prompt.file('prompt/date-range.md');

export class DateRangeStep extends CriteriaStep {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return Prompt.replace(Instructions, {
      CURRENT_DATE:
        process.env.HOTEL_FLOW_CURRENT_DATE ?? new Date().toISOString(),
    });
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'capture_date_range',
        description: 'Save a complete hotel check-in and checkout date range.',
        schema: z.object({
          start: z.string().describe('Check-in date in YYYY-MM-DD format.'),
          end: z.string().describe('Checkout date in YYYY-MM-DD format.'),
        }),
      },
    ];
  }

  @Tool
  protected async capture_date_range(args: {
    start: string;
    end: string;
  }): Promise<ToolResponseType> {
    const start = parseDate(args.start);
    const end = parseDate(args.end);
    const today = new Date(
      process.env.HOTEL_FLOW_CURRENT_DATE ?? new Date().toISOString(),
    );
    today.setUTCHours(0, 0, 0, 0);

    if (!start || !end) {
      return stay('Use valid calendar dates for both check-in and checkout.');
    }
    if (start <= today) {
      return stay('Check-in must be after the current date.');
    }
    if (end <= start) {
      return stay('Checkout must be after check-in.');
    }

    this.saveState({
      answered: true,
      start: toIsoDate(start),
      end: toIsoDate(end),
    });
    return this.advance();
  }
}

function parseDate(value: string): Date | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === normalized
    ? date
    : null;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
