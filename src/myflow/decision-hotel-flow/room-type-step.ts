import { Prompt, Tool, type Flow, type ToolResponseType, type ToolType } from '@picoflow/core';
import { z } from 'zod';
import { CriteriaStep } from './criteria-step.js';
import { ROOM_TYPES } from './hotel-criteria.js';

const Instructions = Prompt.file('prompt/room-type.md');

export class RoomTypeStep extends CriteriaStep {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return Instructions;
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: 'capture_room_type',
        description: 'Save one supported room type.',
        schema: z.object({ roomType: z.enum(ROOM_TYPES) }),
      },
    ];
  }

  @Tool
  protected async capture_room_type(args: {
    roomType: (typeof ROOM_TYPES)[number];
  }): Promise<ToolResponseType> {
    this.saveState({ answered: true, roomType: args.roomType });
    return this.advance();
  }
}
