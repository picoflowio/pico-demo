/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { HumanMessageEx, MessageTypes } from "@picoflow/core";
import z from "zod";
import { ConcurStep1 } from "./concur-step1.js";
import { ConcurStep2 } from "./concur-step2.js";
import type { JsonValue, LastResponseType } from "@picoflow/core";

export class InContextStep extends Step {
  /**
   * Initializes the InContextStep with the parent Flow instance.
   *
   * @param flow - The Flow instance orchestrating this step.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Intercepts the user message crossing step boundary to substitute a standardized
   * prompt trigger for structured generation.
   *
   * @param _langMessage - The raw message crossing into this step.
   * @param _priorStep - The name of the previous step.
   * @returns Synthetic human message prompting the model to adhere to system prompt.
   */
  public override onCrossing(
    _langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    super.onCrossing(_langMessage, _priorStep);
    return new HumanMessageEx(this, "Follow system prompt");
  }

  /**
   * Supplies the system prompt instructing the model to generate a sci-fi movie concept.
   *
   * @returns System prompt string.
   */
  public override getPrompt(): string {
    return `
      "Generate a sci-fi movie idea suitable for teens.";
    `;
  }

  /**
   * Lifecycle hook executed when entering the step. Demonstrates reading transient state
   * and executing parallel sub-steps (`ConcurStep1` and `ConcurStep2`), saving their output.
   */
  protected override async onEnter() {
    await super.onEnter();
    const msg = this.getTransientState<string>("msg");
    console.log("InContextStep.transient msg=", msg);

    const batch = await this.runSteps([
      {
        step: ConcurStep1,
        userMessage: "Run the 1st concurrent follow-up task.",
      },
      {
        step: ConcurStep2,
        userMessage: "Run the 2nd concurrent follow-up task.",
      },
    ]);
    if (batch.rejected.length > 0) {
      throw new Error(
        `Parallel follow-up failed: ${batch.rejected.map(({ key, error }) => `${key}: ${error.message}`).join("; ")}`,
      );
    }
    const [concurStep1, concurStep2] = batch.fulfilled;
    this.saveState({
      concurStep1: JSON.parse(JSON.stringify(concurStep1?.output)) as JsonValue,
      concurStep2: JSON.parse(JSON.stringify(concurStep2?.output)) as JsonValue,
    });
  }

  /**
   * Processes the model's structured response, persisting it into step state.
   *
   * @param llmResult - Structured response object or string returned by the model.
   * @returns Stringified response representation.
   */
  public override async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    this.saveState({ who: llmResult as JsonValue });
    return JSON.stringify(llmResult);
  }

  /**
   * Defines the structured output schema for the LLM response using Zod.
   *
   * @returns Zod schema object specifying required movie fields.
   */
  public structOutputSchema(): object {
    return z.object({
      title: z.string().describe("Movie title"),
      genre: z.string().describe("Main genre"),
      releaseYear: z.number().describe("Release year"),
      rating: z.number().min(0).max(10).describe("Rating from 0 to 10"),
      summary: z.string().describe("Short plot summary"),
    });
  }
}
