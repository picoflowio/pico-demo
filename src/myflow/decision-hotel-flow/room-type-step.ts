import { Prompt, Step, Tool, go, type Flow, type ToolResponseType, type ToolType } from '@picoflow/core';
import { z } from 'zod';
import { CriteriaHelper } from './criteria-helper.js';

const Instructions = Prompt.file('prompt/room-type.md');

export class RoomTypeStep extends Step {
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
        name: 'capture_room_type',
        description: 'Save one supported room type.',
        schema: z.object({ roomType: z.enum(CriteriaHelper.ROOM_TYPES) }),
      },
    ];
  }

  @Tool
  protected async capture_room_type(args: {
    roomType: (typeof CriteriaHelper.ROOM_TYPES)[number];
  }): Promise<ToolResponseType> {
    this.saveState({ answered: true, roomType: args.roomType });
    return go('RouterStep');
  }

  @Tool
  protected async reroute_request(): Promise<ToolResponseType> {
    return go('RouterStep');
  }
}
