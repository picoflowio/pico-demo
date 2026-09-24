import {
  Prompt,
  Step,
  Tool,
  directTo,
  go,
  type Flow,
  type LastResponseType,
  type ToolResponseType,
  type ToolType,
} from '@picoflow/core';
import { z } from 'zod';
import { CriteriaHelper } from './criteria-helper.js';

const Instructions = Prompt.file('prompt/amenities.md');

export class AmenityStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return Instructions;
  }

  public override useTool(): string[] {
    return ['reroute_request'];
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'capture_amenities',
        description: 'Save required hotel amenities. Use an empty array for no preference.',
        schema: z.object({ amenities: z.array(z.enum(CriteriaHelper.AMENITIES)) }),
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
    amenities: (typeof CriteriaHelper.AMENITIES)[number][];
  }): Promise<ToolResponseType> {
    this.saveState({
      answered: true,
      amenities: [...new Set(args.amenities)],
    });
    return go('RouterStep').withState({ mode: 'advance' });
  }

  @Tool
  protected async reroute_request(): Promise<ToolResponseType> {
    return go('RouterStep').withState({ mode: 'request' });
  }
}
