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
import { FlowPrompt } from "@picoflow/core";
import { Prompt } from "@picoflow/core";
import {
  HotelSearchCriteriaSchema,
  toHotelPricingSearchRequest,
} from "../../tools/hotel-pricing-contract.js";
import { searchHotelsViaMcp } from "../../tools/hotel-pricing-mcp-client.js";

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
  /**
   * Initializes the ExploreStep instance with the parent Flow reference.
   *
   * @param flow - The Flow instance managing execution.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Builds the system prompt for hotel search exploration, injecting current date
   * and previous search state into the template JSON.
   *
   * @returns Rendered system prompt string.
   */
  public override getPrompt(): string {
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

  /**
   * Declares tool schemas available during exploration, specifically criteria capture.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
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
        description:
          "Submit the complete accumulated hotel search criteria after the user asks to search.",
        schema: z.object({
          criteria: HotelSearchCriteriaSchema.describe(
            "The complete hotel search criteria accumulated from the conversation.",
          ),
        }),
      },
    ];
  }

  /**
   * Validates criteria and date ranges, executes hotel pricing search via MCP client,
   * saves state, and routes to `PresentStep` with matched hotels or prompts for revisions.
   *
   * @param args - Tool invocation arguments containing search criteria.
   * @returns `stay` if invalid or no hotels found, or `go(PresentStep)` with found hotels.
   */
  @Tool
  protected async capture_choices(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const parsedChoices = HotelSearchCriteriaSchema.safeParse(args?.criteria);
    if (!parsedChoices.success) {
      return stay(
        "The hotel search criteria are incomplete or invalid. Collect valid dates, preferences, and distances before searching.",
      );
    }
    const choices = parsedChoices.data;
    const startDate = new Date(choices.cDate.start);
    const endDate = new Date(choices.cDate.end);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return stay(
        "The checkout date must be after a valid check-in date. Ask the user to correct their stay dates.",
      );
    }

    this.saveState({
      // Tool arguments arrive as JSON. Round-trip through JSON before saving so
      // PicoFlow receives only its durable JsonValue state representation.
      json: JSON.parse(JSON.stringify(choices)),
    });

    let hotelEntries;
    try {
      hotelEntries = await searchHotelsViaMcp(
        toHotelPricingSearchRequest(choices),
      );
    } catch (error) {
      return stay(
        "Hotel pricing is temporarily unavailable. Ask the user to try the search again.",
      );
    }
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

  /**
   * Terminates the conversation upon user exit request.
   *
   * @returns Tool response transitioning to `TerminateSessionStep`.
   */
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step and completes the session.
    return go(TerminateSessionStep);
  }
}
