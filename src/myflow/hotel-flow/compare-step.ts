/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { direct, Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { TerminateSessionStep } from "@picoflow/core";
import { z } from "zod";
import { ExploreStep } from "./explore-step.js";
import { FlowPrompt } from "@picoflow/core";
import { PresentStep } from "./present-step.js";
import { PricingEngine } from "./backend/pricing-engine.js";
import lodash from "lodash";
import { GenChart } from "./gen-chart.js";
import { Prompt } from "@picoflow/core";

const { merge } = lodash;
//........................................................
const ComparePrompt = Prompt.file("prompt/compare.md");
//........................................................
export class CompareStep extends Step {
  /**
   * Initializes the CompareStep instance with the parent Flow reference.
   *
   * @param flow - The Flow instance orchestrating this step.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Clears conversational memory upon entering to maintain a focused context for hotel comparison.
   */
  protected override async onEnter() {
    this.eraseMemory();
  }

  /**
   * Renders the comparison prompt with currently selected and available hotel information.
   *
   * @returns Formatted prompt text for the comparison step.
   */
  public override getPrompt(): string {
    const chosen_hotels = (this.getState("chosen_hotels") as []) ?? [];
    const available_hotel = this.getState(`available_hotel`) ?? [];

    let prompt = `
    ${ComparePrompt}
    ${FlowPrompt.EndChat}
    `;

    const hotels = chosen_hotels.map((entry) => {
      return { hotelName: entry["hotelName"] };
    });

    prompt = Prompt.replace(prompt, {
      ChosenHotels: JSON.stringify(hotels),
      AvailableHotels: JSON.stringify(available_hotel),
    });

    return prompt;
  }

  /**
   * Defines tool schemas for generating comparison charts and returning to booking.
   *
   * @returns Array of tool definitions.
   */
  public override defineTool(): ToolType[] {
    return [
      {
        name: "generate_comparison",
        description: "Call to generate comparison",
        schema: z.object({
          hotels: z.array(z.string()).describe("Hotels name chosen"),
          feature: z.string().describe("chosen feature"),
        }),
      },
      {
        name: "resume_booking",
        description: "Resume to booking",
        schema: z.object({
          isResumed: z.boolean().describe("is resume booking"),
        }),
      },
    ];
  }

  /**
   * Generates a side-by-side comparison table for selected hotels based on a specified feature
   * (amenities, roomType, distance, or price), returning the rendered Markdown table directly to the user.
   *
   * @param args - Tool invocation arguments containing `hotels` and `feature`.
   * @returns Direct tool response displaying the comparison table without additional LLM call.
   */
  @Tool
  protected async generate_comparison(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    //perform a hotel search
    let chosenHotels;
    try {
      chosenHotels = JSON.parse(args?.hotels);
    } catch (_e) {
      chosenHotels = args?.hotels;
    }

    this.saveState({ compare_hotel: chosenHotels });

    const feature = args?.feature;
    // console.log(`feature: ${feature}`);

    //find the full hotel doc from DB
    const fetchHotels = (await PricingEngine.fetchHotels(
      chosenHotels,
    )) as object[];

    //merge the price into the chosenHotels JSON
    const hotelAvailable = this.flow.getStepState(
      PresentStep,
      "hotelFound",
    ) as object[];

    let finalHotels = fetchHotels.map((doc) => {
      for (const aHotel of hotelAvailable) {
        if (aHotel["hotelName"] === doc["hotelName"]) {
          const myFeatures = {};
          merge(myFeatures, { hotelName: doc["hotelName"] });
          if (feature === "amenities") {
            merge(myFeatures, GenChart.flattenObject(doc["amenities"]));
          } else if (feature === "roomType") {
            merge(myFeatures, GenChart.transRoomType(doc["roomType"]));
          } else if (feature === "distance") {
            merge(myFeatures, { cityCenter: `${doc["cityCenter"]} mi` });
            merge(myFeatures, { airport: `${doc["airport"]} mi` });
          } else if (feature === "price") {
            const tree = this.flow.getStepState<{ cDateArray: string[] }>(
              ExploreStep,
              "json",
            );
            const dates = tree["cDateArray"];
            const prices = aHotel["prices"];
            const jObject = GenChart.createJsonObject(dates, prices);
            merge(myFeatures, jObject);
            merge(myFeatures, {
              total: GenChart.formatCurrency(aHotel["total"]),
            });
          }

          return {
            ...myFeatures,
          };
        }
      }
    });

    if (feature === "amenities" || feature === "roomType") {
      finalHotels = GenChart.transAmenities(finalHotels);
    }

    this.saveState({ chosen_hotels: finalHotels });

    //produce a comparison chart
    const table = GenChart.getChart(finalHotels);

    // direct(...) returns this table without another model call and keeps CompareStep active.
    return direct(`${table}\nAnother comparison or ready to book?`);
  }

  /**
   * Resumes the booking flow by transitioning back to `PresentStep`.
   *
   * @returns Tool response navigating to `PresentStep`.
   */
  @Tool
  protected async resume_booking(): Promise<ToolResponseType> {
    // go(...) returns to the booking-results step.
    return go(PresentStep);
  }

  /**
   * Handles user exit requests by terminating the session.
   *
   * @returns Tool response navigating to `TerminateSessionStep`.
   */
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step and completes the session.
    return go(TerminateSessionStep);
  }
}
