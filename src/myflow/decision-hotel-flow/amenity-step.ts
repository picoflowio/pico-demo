import {
  Prompt,
  Tool,
  directTo,
  type Flow,
  type LastResponseType,
  type ToolResponseType,
  type ToolType,
} from '@picoflow/core';
import { z } from 'zod';
import { CriteriaStep } from './criteria-step.js';
import { AMENITIES } from './hotel-criteria.js';

const Instructions = Prompt.file('prompt/amenities.md');

export class AmenityStep extends CriteriaStep {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return Instructions;
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'capture_amenities',
        description: 'Save required hotel amenities. Use an empty array for no preference.',
        schema: z.object({ amenities: z.array(z.enum(AMENITIES)) }),
      },
    ];
  }

  public override async onResponse(
    _llmResult: string | object,
  ): Promise<LastResponseType> {
    return directTo(
      AmenityStep,
      'Which hotel amenities do you require? For example, free WiFi, free parking, breakfast, a pool, or a fitness center.',
    );
  }

  @Tool
  protected async capture_amenities(args: {
    amenities: (typeof AMENITIES)[number][];
  }): Promise<ToolResponseType> {
    this.saveState({
      answered: true,
      amenities: [...new Set(args.amenities)],
    });
    return this.advance();
  }
}
