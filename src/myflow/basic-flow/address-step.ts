/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ToolCall } from '@langchain/core/messages/tool';
import { z } from 'zod';

import { ValidateAddress } from 'src/myflow/basic-flow/validators/address-validator';
import { DemoPrompt } from './prompt/demo-prompt';
import {
  Step,
  Flow,
  ToolType,
  ToolResponseType,
  EndStep,
} from '@picoflow/core';

export class AddressStep extends Step {
  constructor(flow: Flow, isActive?: boolean) {
    super(AddressStep, flow, isActive);
  }

  public getPrompt(): string {
    return `
    ${DemoPrompt.TravelRole}
    Please ask user for address.
    Once you capture the address, call tool 'address'.
    If user prefer to exit, call tool 'end_chat'.
    `;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: 'address',
        description: 'Capture address of user',
        schema: z.object({
          address: z.string().describe('address of user'),
        }),
      },
    ];
  }

  public getTool(): string[] {
    return ['address', 'end_chat'];
  }

  protected async address(tool: ToolCall): Promise<ToolResponseType> {
    const response = ValidateAddress(tool.args?.address);
    if (!response) {
      return {
        step: AddressStep,
        tool: 'Invalid address',
      };
    } else {
      this.saveState({ address: response });
      return {
        step: EndStep,
        prompt: DemoPrompt.AbruptEnd,
        state: { fromAddress: 5 },
      };
    }
  }

  // protected async end_chat(_tool: ToolCall): Promise<ToolResponseType> {
  //   return { step: EndStep, prompt: DemoPrompt.AbruptEnd };
  // }

  protected async end_chat(tool: ToolCall): Promise<ToolResponseType> {
    return this.callStepTool(EndStep, tool);
    // return EndStep;
  }
}
