/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Tool, directResult } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { ConcurStep3 } from "./concur-step3.js";
import type { ToolResponseType, ToolType } from "@picoflow/core";
import { z } from "zod";

export class ConcurStep1 extends Step {
  /**
   * Initializes the ConcurStep1 instance.
   *
   * @param flow - The enclosing Flow instance.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Returns system instructions for parallel execution step 1.
   *
   * @returns Prompt string directing the model to the completion tool.
   */
  public override getPrompt(): string {
    return `
    You are ConcurStep1.
    Immediately call 'complete_concurrent_step1' with no arguments.
    Do not return prose.
    `;
  }

  /**
   * Runs the nested ConcurStep3 example before this branch makes its own
   * model-selected completion tool call.
   */
  protected override async onEnter() {
    await super.onEnter();
    this.saveState({ concurStep1_onEnter: "Starting nested ConcurStep3." });
    const batch = await this.runSteps([
      {
        step: ConcurStep3,
        userMessage: "Run the ConcurStep3.",
      },
    ]);
    if (batch.rejected.length > 0) {
      throw new Error(batch.rejected[0]!.error.message);
    }
  }

  /**
   * Declares the one tool used to complete this parallel child.
   *
   * @returns Completion tool schema.
   */
  public override defineTool(): ToolType[] {
    return [
      {
        name: "complete_concurrent_step1",
        description: "Finish ConcurStep1 and return its parallel branch result.",
        schema: z.object({}),
      },
    ];
  }

  /**
   * Saves the child-owned result and returns it to the `runSteps()` caller.
   */
  @Tool
  protected async complete_concurrent_step1(): Promise<ToolResponseType> {
    const result = { completed: true };
    this.saveState({ concurStep1_tool: result });
    return directResult(result);
  }
}
