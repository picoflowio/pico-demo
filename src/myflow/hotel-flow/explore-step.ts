/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Tool, go, stay } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { TerminateSessionStep } from "@picoflow/core";
import { z } from "zod";
import { HotelPrompt } from "./prompt/hotel-prompt.js";
import moment from "moment";
import lodash from "lodash";
import { PresentStep } from "./present-step.js";
import { PricingEngine } from "./backend/pricing-engine.js";
import { FlowPrompt } from "@picoflow/core";
import { Prompt } from "@picoflow/core";

const { set } = lodash;
//........................................................
const ExplorePartial = Prompt.file("prompt/explore.md");
const ExplorePrompt = `
  ${HotelPrompt.Role}
  ${ExplorePartial}
  ${FlowPrompt.EndChat}
  `;

const HotelJSON = Prompt.file("prompt/explore.json");
//........................................................
export class ExploreStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    const hotelJson = JSON.parse(HotelJSON);
    // Allow deterministic callers (notably replayable E2E scenarios) to pin
    // the conversation date without changing the production default.
    const currentDate =
      process.env.HOTEL_FLOW_CURRENT_DATE ?? moment().utc().format();
    set(hotelJson, "currentDate", currentDate);

    const hotelFound = this.getState("hotelFound");
    if (hotelFound) {
      set(hotelJson, "hotelFound", hotelFound);
    }

    const prompt = Prompt.replace(ExplorePrompt, {
      HOTEL_JSON: JSON.stringify(hotelJson),
    });
    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      // {
      //   name: 'capture_budget',
      //   description: 'Capture min/max budget per night',
      //   schema: z.object({
      //     min: z.number().describe('minimum per night'),
      //     max: z.number().describe('maximum per night'),
      //   }),
      // },
      // {
      //   name: 'capture_dates',
      //   description: 'Capture reservation dates',
      //   schema: z.object({
      //     days: z.array(z.date()).describe('an array of days chosen'),
      //   }),
      // },
      {
        name: "capture_choices",
        description: "Capture user choice for hotel search criteria",
        schema: z.object({
          json: z.string().describe("JSON object"),
        }),
      },
    ];
  }
  @Tool
  protected async capture_choices(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    //do a hotel search here.
    let choices;
    try {
      choices = JSON.parse(args?.json);
    } catch (_ex) {}
    this.saveState({
      json: choices,
    });

    const startDate = choices["cDate"]["start"];
    const endDate = choices["cDate"]["end"];
    const roomType = choices["cRoomType"];
    const amenities = choices["cAmenities"];
    const maxBudget = choices["cPriceRange"]["max"] ?? null;
    const minBudget = choices["cPriceRange"]["min"] ?? null;
    const cityCenter = choices["cDistance"]["cityCenter"];
    const airport = choices["cDistance"]["airport"];

    const hotelEntries = await PricingEngine.searchHotel(
      startDate,
      endDate,
      amenities,
      roomType,
      maxBudget,
      minBudget,
      airport,
      cityCenter,
    );
    if (hotelEntries && hotelEntries.length > 0) {
      const hotelFoundInfo = hotelEntries.map((entry) => {
        return {
          hotelName: entry.hotelName,
          total: entry.total,
          prices: entry.prices,
        };
      });
      // go(...) advances to the results step and supplies its hotel state.
      return go(PresentStep).withState({
        hotelFound: hotelFoundInfo,
      });
    } else {
      // stay(...) keeps ExploreStep active and returns corrective feedback to the model.
      return stay("No hotel found, please adjust your criteria and try again.");
    }
  }

  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step and completes the session.
    return go(TerminateSessionStep);
  }
}
