import { Prompt, Step, Tool, go, stay, type Flow, type ToolResponseType, type ToolType } from '@picoflow/core';
import { z } from 'zod';

const Instructions = Prompt.file('prompt/distance.md');

export class DistanceStep extends Step {
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
        name: 'capture_distance',
        description: 'Save maximum miles from the airport and city center. Use null for no limit.',
        schema: z.object({
          airport: z.number().finite().nullable(),
          cityCenter: z.number().finite().nullable(),
        }),
      },
    ];
  }

  @Tool
  protected async capture_distance(args: {
    airport: number | null;
    cityCenter: number | null;
  }): Promise<ToolResponseType> {
    if (
      (args.airport !== null && args.airport < 0) ||
      (args.cityCenter !== null && args.cityCenter < 0)
    ) {
      return stay('Distance limits cannot be negative.');
    }

    this.saveState({
      answered: true,
      airport: args.airport,
      cityCenter: args.cityCenter,
    });
    return go('RouterStep');
  }

  @Tool
  protected async reroute_request(): Promise<ToolResponseType> {
    return go('RouterStep');
  }
}
