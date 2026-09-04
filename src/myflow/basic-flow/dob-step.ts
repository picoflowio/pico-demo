/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { TerminateSessionStep, go, stay } from "@picoflow/core";
import { Flow, Tool } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { NameStep } from "./name-step.js";
import { z } from "zod";
import { DemoPrompt } from "./prompt/demo-prompt.js";
import { Prompt } from "@picoflow/core";
import { AddressStep } from "./address-step.js";

export class DOBStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    const template = `
    ${DemoPrompt.DemoPrompt}
    Ask the user to provide the date of birth for {{UserName}}.
    Accept common date formats, including M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, and written month formats. Interpret slash-separated numeric dates as U.S. month/day/year.
    A valid date must immediately trigger the 'dob' tool with numeric year, month, and day. Do not ask the user to confirm or reformat a valid date.
    In particular, input 1/1/2000 is valid and MUST call 'dob' with year 2000, month 1, and day 1.
    Ask the user to re-enter the date only when it is missing, impossible, or cannot be interpreted under these rules.
    If the user explicitly asks to exit, call 'terminate_session'.
    `;

    const name = this.flow.getStepState<string>(NameStep, "name");
    const prompt = Prompt.replace(template, { UserName: name });
    return prompt;
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: "dob",
        description:
          "Capture a valid date of birth after interpreting numeric slash dates as month/day/year.",
        schema: z.object({
          year: z
            .number()
            .int()
            .min(1900)
            .max(2100)
            .describe("Four-digit year"),
          month: z
            .number()
            .int()
            .min(1)
            .max(12)
            .describe("Calendar month, 1 through 12"),
          day: z
            .number()
            .int()
            .min(1)
            .max(31)
            .describe("Calendar day, 1 through 31"),
        }),
      },
    ];
  }

  @Tool
  protected async dob(args: Record<string, any>): Promise<ToolResponseType> {
    const date = new Date(Date.UTC(args.year, args.month - 1, args.day));
    const isValidDate =
      date.getUTCFullYear() === args.year &&
      date.getUTCMonth() === args.month - 1 &&
      date.getUTCDate() === args.day;
    if (!isValidDate) {
      // stay(...) keeps DOBStep active and asks the model to correct the date.
      return stay(
        "That date is not valid. Ask for a valid date of birth in M/D/YYYY format.",
      );
    }

    this.saveState({
      year: args?.year,
      month: args?.month,
      day: args?.day,
    });
    // go(...) advances to address collection after saving the valid date.
    return go(AddressStep);
  }
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step with the abrupt-end prompt.
    return go(TerminateSessionStep).withPrompt(DemoPrompt.AbruptEnd);
  }
}
