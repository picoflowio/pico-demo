/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { NameStep } from './name-step';
import { z } from 'zod';
import { DemoPrompt } from './prompt/demo-prompt';
import { AddressStep } from './address-step';
import { Step, Flow, Prompt, ToolType, ToolResponseType, EndStep } from '@picoflow/core';

export class DOBStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(DOBStep, flow, isActive);
  }

  public getPrompt(): string {
    const template = `
    ${DemoPrompt.TravelRole}
    Please ask the DOB for {{UserName}}.
    Once you capture the DOB, call tool 'dob'.
    If you have doubt interpreting the DOB, ask user to re-enter the DOB.
    If user prefer to exit, call tool 'end_chat'.
    `;

    const name = this.flow.getStepStateAs<string>(NameStep, 'name');
    const prompt = Prompt.replace(template, { UserName: name });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'dob',
        description: 'capture date of birth of user',
        schema: z.object({
          year: z.number().describe('year of dob'),
          month: z.number().describe('month of dob'),
          day: z.number().describe('day of dob'),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['dob', 'end_chat'];
  }

  protected async dob(tool: ToolCall): Promise<ToolResponseType> {
    this.saveState({
      year: tool.args?.year,
      month: tool.args?.month,
      day: tool.args?.day,
    });
    return AddressStep;
  }
  protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
    return { step: EndStep, prompt: DemoPrompt.AbruptEnd };
  }
}
