/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { Flow } from '@picoflow/core';
import { ToolResponseType, ToolType } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { DOBStep } from './dob-step.js';
import { EndStep } from '@picoflow/core';
import { z } from 'zod';
import { DemoPrompt } from './prompt/demo-prompt.js';
import { InContextStep } from './incontext-step.js';

export class NameStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(NameStep, flow, isActive);
  }

  public getPrompt(): string {
    return `
    ${DemoPrompt.TravelRole}
    Please collect name from customer.
    Once you capture the name, immediately call tool 'user_name'.
    Pay attention to the tool respond if the name is validated or not, if not keep asking to enter correct user name.
    If user prefer to exit, call tool 'end_chat'.
    `;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'user_name',
        description: 'Capture name of user',
        schema: z.object({
          name: z.string().describe('Name of user'),
        }),
      },
    ];
  }
  public getTool(): string[] {
    return ['user_name', 'end_chat'];
  }

  protected async user_name(tool: ToolCall): Promise<ToolResponseType> {
    this.saveState({ name: tool.args?.name });

    if (tool.args?.name === 'John Doe') {
      return {
        step: NameStep,
        tool: 'Cannot accept John Doe, please choose a different name.',
      };
    } else {
      const runData = this.flow.getContext<object>('myRunData');
      this.saveState(runData);

      this.flow.saveTransientStepState(InContextStep, {
        msg: 'transient variable passed from NameStep',
      });
      const answer = await this.runStep(InContextStep);
      this.saveState({ inContext: answer });
      return DOBStep;
    }
  }

  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return { step: EndStep, prompt: DemoPrompt.AbruptEnd };
  }
}
