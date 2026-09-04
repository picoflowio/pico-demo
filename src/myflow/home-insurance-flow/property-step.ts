import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { PropertyProfileSchema, type PropertyProfile } from "./home-insurance-types.js";
import { durableJson, homeInsuranceCurrentDate, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { RiskStep } from "./risk-step.js";
import { ReviewStep } from "./review-step.js";

const Instructions = Prompt.file("prompt/property.md");

export class PropertyStep extends Step {
  constructor(flow: Flow) { super(flow); }

  public override onCrossing(userMessage: MessageTypes): MessageTypes {
    return this.getState("correctionMode")
      ? userMessage
      : new HumanMessageEx(this, "Begin collecting the property characteristics.");
  }

  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      PROPERTY: JSON.stringify(this.getState<PropertyProfile>("property") ?? null),
      CORRECTION_REQUEST: JSON.stringify(this.getState("correctionRequest") ?? null),
    })}`;
  }

  public override defineTool(): ToolType[] {
    return [
      { name: "capture_home_property", description: "Validate and save the complete property profile.", schema: PropertyProfileSchema },
      { name: "end_property_quote", description: "End the home quote during property collection.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_home_property(args: unknown): Promise<ToolResponseType> {
    const parsed = PropertyProfileSchema.safeParse(args);
    if (!parsed.success) return stay("Collect valid dwelling, construction, roof, size, story, and system-update facts before continuing.");
    const currentYear = homeInsuranceCurrentDate().getUTCFullYear();
    if (parsed.data.yearBuilt > currentYear) return stay("The year built cannot be in the future.");
    for (const [label, year] of Object.entries({ plumbing: parsed.data.plumbingUpdatedYear, electrical: parsed.data.electricalUpdatedYear, HVAC: parsed.data.hvacUpdatedYear })) {
      if (year != null && (year < parsed.data.yearBuilt || year > currentYear)) {
        return stay(`The ${label} update year must be between the year built and ${currentYear}, or null.`);
      }
    }
    this.saveState({ property: durableJson(parsed.data) });
    const correctionMode = this.getState<boolean>("correctionMode") === true;
    this.removeState("correctionMode");
    this.removeState("correctionRequest");
    return correctionMode ? go(ReviewStep) : go(RiskStep);
  }

  @Tool
  protected async end_property_quote(): Promise<ToolResponseType> {
    return go(TerminateSessionStep).withPrompt(terminalPrompt("Thank the customer and close the unfinished preliminary quote."));
  }
}
