/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { TerminateSessionStep, go, stay } from "@picoflow/core";
import { Flow, Tool } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { z } from "zod";

import { ValidateAddress } from "./validators/address-validator.js";
import { DemoPrompt } from "./prompt/demo-prompt.js";

export class AddressStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    return `
    ${DemoPrompt.DemoPrompt}
    Ask the user for one complete US mailing address containing street, city, two-letter state, and ZIP code.
    As soon as all four parts are present, immediately call 'address' with the user's full text. Do not ask for confirmation or reformatting before calling the tool.
    Accept common punctuation and an omitted comma between street and city. For example, "123 K St. Portland, OR 97006" is complete and MUST be sent directly to 'address'.
    If the tool rejects the address, explain that all four parts are required and ask for a corrected complete US mailing address.
    If the user explicitly asks to exit, call 'terminate_session'.
    `;
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: "address",
        description:
          "Validate and capture a complete US street, city, two-letter state, and ZIP address.",
        schema: z.object({
          address: z
            .string()
            .describe("The user's complete address text, unchanged"),
        }),
      },
    ];
  }

  @Tool
  protected async address(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const response = ValidateAddress(args?.address);
    if (!response) {
      // stay(...) keeps AddressStep active and tells the model what input to correct.
      return stay(
        "Invalid address. Ask for street, city, two-letter state, and ZIP code.",
      );
    } else {
      this.saveState({ address: response });
      // go(...) activates the terminal step with the final prompt and destination state.
      return go(TerminateSessionStep)
        .withPrompt(DemoPrompt.FromAddressEnd)
        .withState({ fromAddress: 5 });
    }
  }

  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step and completes the session.
    return go(TerminateSessionStep);
  }
}
