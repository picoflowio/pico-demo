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
import { HotelOption, TravelPlan } from "./travel-types.js";
import { DirectMessage } from "@picoflow/core";
import { TravelPrompts } from "./prompts.js";
import { Prompt } from "@picoflow/core";

export class HotelStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepState<TravelPlan>(PlannerStep, "travelPlan");
    const prompt = Prompt.replace(TravelPrompts.HOTEL_SEARCH_PROMPT, {
      PLAN: JSON.stringify(plan),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "search_hotels",
        description: "Search for hotel options",
        schema: z.object({
          location: z.string(),
        }),
      },
    ];
  }

  @Tool
  protected async search_hotels(): Promise<ToolResponseType> {
    // Mock Data
    const mockHotels: HotelOption[] = [
      {
        id: "H1",
        name: "Grand EZ Hotel",
        price_per_night: 150,
        rating: 4.5,
        location: "City Center",
      },
      {
        id: "H2",
        name: "Budget Inn",
        price_per_night: 80,
        rating: 3.0,
        location: "Suburbs",
      },
      {
        id: "H3",
        name: "Luxury Palace",
        price_per_night: 400,
        rating: 5.0,
        location: "Beachfront",
      },
    ];

    this.saveState({ hotels: mockHotels });

    // go(...) re-enters HotelStep; DirectMessage stops here instead of calling the model again.
    return go(HotelStep).withMessage(new DirectMessage(this, {}));
  }
}
