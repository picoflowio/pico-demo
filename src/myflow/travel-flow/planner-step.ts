/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */

import { TravelPrompts } from "./prompts.js";
import { TravelPlan, TravelPlanSchema } from "./travel-types.js";
import { FlightStep } from "./flight-step.js";
import { Step } from "@picoflow/core";
import { Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { HotelStep } from "./hotel-step.js";
import { ActivityStep } from "./activity-step.js";
import { SynthesizerStep } from "./synthesizer-step.js";

export class PlannerStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return TravelPrompts.ANALYSIS_PROMPT;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "submit_plan",
        description:
          "Submit the structured travel plan extracted from user request",
        schema: TravelPlanSchema,
      },
    ];
  }

  @Tool
  protected async submit_plan(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const plan = args as TravelPlan;
    // Save the plan to the flow context so other steps can access it
    this.saveState({ travelPlan: plan });
    if (plan?.user_intent === "full_plan") {
      await this.runStep(FlightStep);
      await this.runStep(HotelStep);
      await this.runStep(ActivityStep);
    } else if (plan?.user_intent === "flights_only") {
      await this.runStep(FlightStep);
    } else if (plan?.user_intent === "hotels_only") {
      await this.runStep(HotelStep);
    } else if (plan?.user_intent === "activities_only") {
      await this.runStep(ActivityStep);
    }

    // go(...) advances to the step that combines the planned travel options.
    return go(SynthesizerStep);
  }
}
