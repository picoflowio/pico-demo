/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { TerminateSessionStep } from "@picoflow/core";
import { z } from "zod";
import { SearchHotelEntry } from "./backend/pricing-engine.js";
import { ExploreStep } from "./explore-step.js";
import { MessageTypes } from "@picoflow/core";
import { FlowPrompt } from "@picoflow/core";
import { CompareStep } from "./compare-step.js";
import { Prompt } from "@picoflow/core";
import { HumanMessageEx } from "@picoflow/core";

const PresentPrompt = Prompt.file("prompt/present.md");
//........................................................
export class PresentStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  protected async onEnter() {
    //switch from active to inactive, erase memory
    this.eraseMemory();
  }

  public onCrossing(
    _userMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    return new HumanMessageEx(this, "What hotels choice I have");
  }

  public getPrompt(): string {
    const hotelFoundInfo = this.getState("hotelFound") as SearchHotelEntry;
    let prompt = `
    ${PresentPrompt}
    ${FlowPrompt.EndChat}
    `;

    prompt = Prompt.replace(prompt, {
      HOTEL_FOUND_INFO: JSON.stringify(hotelFoundInfo),
    });

    return prompt;
  }

  public defineTool(): ToolType[] {
    return [
      {
        name: "chosen_hotel",
        description: "Capture user choice of hotel",
        schema: z.object({
          hotelName: z.string().describe("Hotel name chosen"),
        }),
      },
      {
        name: "search_again",
        description: "User request to re-run the search hotel again",
        schema: z.object({
          isSearch: z.boolean().describe("run the search"),
        }),
      },
      {
        name: "go_compare",
        description: "User request compare hotel",
        schema: z.object({
          hotelsToCompare: z
            .array(z.string())
            .describe("Hotel names chosen to be compared"),
        }),
      },
    ];
  }
  @Tool
  protected async chosen_hotel(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    this.saveState({ hotel: args?.hotelName });
    const msg = `Tell user hotel is booked with confirmation #:${this.generateConfirmationNumber()}. Thank the user for choosing Hilton, you MUST NOT talk other things!`;
    // go(...) activates the terminal step, which asks the model to confirm the booking.
    return go(TerminateSessionStep).withPrompt(msg);
  }

  @Tool
  protected async search_again(): Promise<ToolResponseType> {
    // go(...) changes steps; forward the request so ExploreStep can refine the search.
    return go(ExploreStep).withMessage(this.getLastMessage());
  }

  @Tool
  protected async go_compare(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    this.flow.saveStepState(CompareStep, {
      compare_hotel: args?.hotelsToCompare,
    });

    const availableHotel = this.flow.getStepState(
      PresentStep,
      "hotelFound",
    ) as [];

    const strAvailableHotel = availableHotel.map((entry) => {
      return entry["hotelName"];
    }) as string[];

    // go(...) enters comparison mode with the selected hotel data as destination state.
    return go(CompareStep)
      .withState({
        available_hotel: strAvailableHotel,
      })
      .withMessage(this.getLastMessage());
  }

  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step and completes the session.
    return go(TerminateSessionStep);
  }

  private generateConfirmationNumber(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }
}
