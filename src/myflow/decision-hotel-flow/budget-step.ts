import { Prompt, Step, Tool, go, stay, type Flow, type ToolResponseType, type ToolType } from '@picoflow/core';
import { z } from 'zod';

const Instructions = Prompt.file('prompt/budget.md');

export class BudgetStep extends Step {
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
        name: 'capture_budget',
        description: 'Save minimum and maximum nightly hotel budget. Use null for no limit.',
        schema: z.object({
          min: z.number().finite().nullable(),
          max: z.number().finite().nullable(),
        }),
      },
    ];
  }

  @Tool
  protected async capture_budget(args: {
    min: number | null;
    max: number | null;
  }): Promise<ToolResponseType> {
    if (
      (args.min !== null && args.min < 0) ||
      (args.max !== null && args.max < 0)
    ) {
      return stay('Budget values cannot be negative.');
    }
    if (args.min !== null && args.max !== null && args.min > args.max) {
      return stay('The minimum nightly budget cannot exceed the maximum.');
    }

    this.saveState({ answered: true, min: args.min, max: args.max });
    return go('RouterStep');
  }

  @Tool
  protected async reroute_request(): Promise<ToolResponseType> {
    return go('RouterStep');
  }
}
