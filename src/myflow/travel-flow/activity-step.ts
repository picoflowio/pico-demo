/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */

import { Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { z } from "zod";
import { PlannerStep } from "./planner-step.js";
import { ActivityOption, TravelPlan } from "./travel-types.js";
import { DirectMessage } from "@picoflow/core";
import { TravelPrompts } from "./prompts.js";
import { Prompt } from "@picoflow/core";

export class ActivityStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepState<TravelPlan>(PlannerStep, "travelPlan");

    const prompt = Prompt.replace(TravelPrompts.ACTIVITY_SEARCH_PROMPT, {
      PLAN: JSON.stringify(plan),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "search_activities",
        description: "Search for activity options",
        schema: z.object({
          location: z.string(),
        }),
      },
    ];
  }

  @Tool
  protected async search_activities(): Promise<ToolResponseType> {
    // Mock Data
    const mockActivities: ActivityOption[] = [
      {
        id: "A1",
        name: "City Tour",
        price: 50,
        duration: "4 hours",
        description: "Guided tour of the city.",
      },
      {
        id: "A2",
        name: "Museum Visit",
        price: 25,
        duration: "2 hours",
        description: "Visit the national museum.",
      },
      {
        id: "A3",
        name: "Adventure Park",
        price: 100,
        duration: "Full Day",
        description: "Theme park access.",
      },
    ];

    this.saveState({ activities: mockActivities });

    // go(...) re-enters ActivityStep; DirectMessage stops here instead of calling the model again.
    return go(ActivityStep).withMessage(new DirectMessage(this, {}));
  }
}
