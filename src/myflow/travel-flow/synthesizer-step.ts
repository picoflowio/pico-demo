/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { TravelPrompts } from "./prompts.js";
import {
  TravelPlan,
  FlightOption,
  HotelOption,
  ActivityOption,
  TravelPackageSchema,
} from "./travel-types.js";
import { z } from "zod";
import { Step } from "@picoflow/core";
import { Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { TerminateSessionStep } from "@picoflow/core";
import { PlannerStep } from "./planner-step.js";
import { FlightStep } from "./flight-step.js";
import { HotelStep } from "./hotel-step.js";
import { ActivityStep } from "./activity-step.js";

export class SynthesizerStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public async run(message: string): Promise<any> {
    const plan = this.flow.getContext<TravelPlan>("travelPlan");
    const flights = this.flow.getContext<FlightOption[]>("flightOptions") || [];
    const hotels = this.flow.getContext<HotelOption[]>("hotelOptions") || [];
    const activities =
      this.flow.getContext<ActivityOption[]>("activityOptions") || [];

    // Store these in state so the LLM prompt can access them
    this.saveState({
      plan,
      flights,
      hotels,
      activities,
    });

    return super.run(message);
  }

  public getPrompt(): string {
    const plan = this.flow.getStepState<TravelPlan>(PlannerStep, "travelPlan");
    const departureFlights = this.flow.getStepState<FlightOption>(
      FlightStep,
      "departureFlights",
    );
    const returnFlights = this.flow.getStepState<FlightOption>(
      FlightStep,
      "returnFlights",
    );
    const hotels = this.flow.getStepState<HotelOption>(HotelStep, "hotels");
    const activities = this.flow.getStepState<ActivityOption>(
      ActivityStep,
      "activities",
    );

    return `
    ${TravelPrompts.SYNTHESIS_PROMPT}

    **CLIENT'S PLAN:**
    ${JSON.stringify(plan)}

    **AVAILABLE OPTIONS:**
    - Departure Flights: ${JSON.stringify(departureFlights)}
    - Return Flights: ${JSON.stringify(returnFlights)}
    - Hotels: ${JSON.stringify(hotels)}
    - Activities: ${JSON.stringify(activities)}
    `;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "generate_packages",
        description: "Submit the generated travel packages",
        schema: z.object({
          packages: z.array(TravelPackageSchema),
        }),
      },
      {
        name: "choose_package",
        description: "Choose a package",
        schema: z.object({
          chosenPackage: TravelPackageSchema,
        }),
      },
    ];
  }

  @Tool
  protected async generate_packages(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const packages = args?.packages;
    this.saveState({ packages });

    // go(...) re-enters the synthesizer so it can present the saved packages.
    return go(SynthesizerStep);
  }

  @Tool
  protected async choose_package(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const chosenPackage = args?.chosenPackage;
    this.saveState({ chosenPackage });

    const prompt =
      "Thank user for using travel planning service. Tell them it is booked";

    // go(...) activates the terminal step with the closing prompt.
    return go(TerminateSessionStep).withPrompt(prompt);
  }
}
