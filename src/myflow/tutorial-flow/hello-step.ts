/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { TerminateSessionStep } from "@picoflow/core";
import { Flow, Tool, go, stay } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { z } from "zod";

export class HelloStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    const prompt = `.
        Ask the name of the user.
        When you get the name of the user, call tool capture_name.
        Make sure the name is valid by checking your last response
        Greet the user. Chat with them.
    `;
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "capture_name",
        description: "Capture name of user",
        schema: z.object({
          name: z.string().describe("Name of user"),
        }),
      },
    ];
  }

  @Tool
  protected async capture_name(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    this.saveState({ name: args?.name });
    if (args?.name === "John Doe") {
      // stay(...) keeps HelloStep active and asks the model to collect a replacement name.
      return stay("Cannot accept John Doe, please choose a different name.");
    } else {
      // go(...) activates the terminal step after accepting the name.
      return go(TerminateSessionStep);
    }
  }
}
