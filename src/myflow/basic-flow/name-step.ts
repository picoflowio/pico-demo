/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Tool, go, stay } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { DOBStep } from "./dob-step.js";
import { TerminateSessionStep } from "@picoflow/core";
import { z } from "zod";
import { DemoPrompt } from "./prompt/demo-prompt.js";
import { InContextStep } from "./incontext-step.js";
import type { JsonObject, JsonValue } from "@picoflow/core";

export class NameStep extends Step {
  /**
   * Initializes the NameStep with the enclosing flow.
   *
   * @param flow - The Flow instance controlling execution.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Generates the prompt instructing the LLM to collect the user's full name
   * and delegate validation immediately to the `user_name` tool.
   *
   * @returns Prompt text for the name collection step.
   */
  public override getPrompt(): string {
    return `
    ${DemoPrompt.DemoPrompt}
    Ask the customer for their full name.
    Treat any plausible first-and-last-name response as collected input and immediately call 'user_name' with the complete name. Do not validate or reject a name in prose before calling the tool; the tool owns validation.
    If 'user_name' rejects the name, clearly repeat the tool's reason and ask for a different full name. Remain in this step.
    If the user explicitly asks to exit, call 'terminate_session'.
    `;
  }

  /**
   * Declares tool definitions available in this step, defining the schema for name capture.
   *
   * @returns Array of tool definitions including `user_name`.
   */
  public override defineTool(): ToolType[] {
    return [
      {
        name: "user_name",
        description: "Capture name of user",
        schema: z.object({
          name: z.string().min(3).describe("Complete first and last name"),
        }),
      },
    ];
  }

  /**
   * Validates and records the user's name, runs an embedded InContextStep sub-step,
   * and transitions to the date of birth step (`DOBStep`).
   *
   * @param args - Tool invocation arguments containing `name`.
   * @returns `stay` response if name is invalid (e.g. John Doe), or `go(DOBStep)` on success.
   */
  @Tool
  protected async user_name(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const name = typeof args?.name === "string" ? args.name.trim() : "";

    if (name.toLowerCase() === "john doe") {
      // stay(...) keeps NameStep active and returns corrective feedback to the model.
      return stay("Cannot accept John Doe, please choose a different name.");
    } else {
      this.saveState({ name });
      const runData = this.flow.getContext<JsonObject>("config.myRunData");
      this.saveState(runData);

      this.flow.saveTransientStepState(InContextStep, {
        msg: "transient variable passed from NameStep",
      });
      const answer = await this.runStep(InContextStep);
      this.saveState({
        inContext: JSON.parse(JSON.stringify(answer)) as JsonValue,
      });
      // go(...) advances to the date-of-birth step after saving the valid name.
      return go(DOBStep);
    }
  }

  /**
   * Handles user exit requests by transitioning to the session termination step.
   *
   * @returns Tool response navigating to `TerminateSessionStep` with termination prompt.
   */
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step with the abrupt-end prompt.
    return go(TerminateSessionStep).withPrompt(DemoPrompt.AbruptEnd);
  }
}
