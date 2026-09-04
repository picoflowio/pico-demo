/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow, Tool, Tools, go, stay } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { TerminateSessionStep } from "@picoflow/core";
import type { ToolCall } from "@langchain/core/messages/tool";
import { z } from "zod";
import { DemoPrompt } from "./prompt/demo-prompt.js";
import { FooLogicStep } from "./foo-logic.js";
import { getCityTemperatures } from "./city-temperature-service.js";

export class WeatherStep extends Step {
  /**
   * Initializes the WeatherStep with the enclosing flow.
   *
   * @param flow - The Flow instance controlling execution.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Generates prompt instructions for collecting and comparing weather for LA and NYC.
   *
   * @returns Step prompt guiding model responses and tool invocation rules.
   */
  public override getPrompt(): string {
    return `
    ${DemoPrompt.DemoPrompt}
    This demo supports exactly two city aliases: LA and NYC.
    On the initial response, explicitly say that LA and NYC are the only supported cities and ask the user to provide the supported cities they want to compare.
    When the user supplies an unsupported city, explicitly say it is unsupported, remind them that only LA and NYC are supported, and ask them to enter LA or NYC. Do not call 'get_weather' for unsupported input and do not ask only a yes-or-no question.
    When a message contains LA and NYC, you MUST call 'get_weather' exactly once for LA and exactly once for NYC in the same response. Do not ask for confirmation and do not describe the weather yourself.
    If only one supported city is supplied, call 'get_weather' for it and then ask for the remaining supported city.
    If the user explicitly asks to exit, call 'terminate_session'.
    `;
  }

  /**
   * Defines the tool schema for looking up weather by city alias.
   *
   * @returns Array of tool definitions including `get_weather`.
   */
  public override defineTool(): ToolType[] {
    return [
      {
        name: "get_weather",
        description:
          "Look up one supported city. Call once with LA and once with NYC when both are supplied.",
        schema: z.object({
          cityName: z
            .string()
            .describe("Supported city alias: exactly LA or NYC"),
        }),
      },
    ];
  }

  /**
   * Handles individual city weather lookups, recording temperature in state
   * and transitioning to `FooLogicStep` once both LA and NYC temperatures are collected.
   *
   * @param args - Tool invocation arguments containing `cityName`.
   * @returns `stay` asking for the remaining city or reporting errors, or `go(FooLogicStep)` when both are present.
   */
  @Tool
  protected async get_weather(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const cityName = args?.cityName;
    if (typeof cityName !== "string") {
      // stay(...) keeps WeatherStep active and returns corrective feedback to the model.
      return stay("Only LA and NYC cities are allowed");
    }

    const stateCityName = this.normalizeCityName(cityName);
    if (stateCityName !== "LA" && stateCityName !== "NYC") {
      // stay(...) keeps WeatherStep active until the model receives a supported city.
      return stay(
        `${cityName} is unsupported. Only LA and NYC are supported. Ask the user to enter LA or NYC.`,
      );
    }

    const [weather] = getCityTemperatures([stateCityName]);
    if (weather?.temperature !== null && weather?.temperature !== undefined) {
      this.saveState({
        [`city_${stateCityName}`]: weather.temperature,
      });

      const LA = this.getState("city_LA");
      const NYC = this.getState("city_NYC");
      if (LA !== undefined && NYC !== undefined) {
        // go(...) advances once weather for both required cities is available.
        return go(FooLogicStep);
      } else {
        const remainingCity = stateCityName === "LA" ? "NYC" : "LA";
        // stay(...) keeps this step active while requesting the remaining city.
        return stay(
          `${stateCityName} was accepted. Ask the user for ${remainingCity}.`,
        );
      }
    } else {
      // stay(...) keeps WeatherStep active and returns corrective feedback to the model.
      return stay("Only LA and NYC cities are allowed");
    }
  }

  /**
   * Handles batch weather tool calls when the model invokes `get_weather` for multiple cities concurrently.
   * Verifies both LA and NYC are requested, saves their temperatures, and transitions to `FooLogicStep`.
   *
   * @param calls - Array of tool call invocations from the model.
   * @returns `stay` if validation fails, or `go(FooLogicStep)` when both cities are processed.
   */
  @Tools(["get_weather"])
  protected async get_weather_batch(
    calls: readonly ToolCall[],
  ): Promise<ToolResponseType> {
    const cityNames = calls.map((call) => {
      const cityName = call.args?.cityName;
      return typeof cityName === "string"
        ? this.normalizeCityName(cityName)
        : undefined;
    });

    if (
      cityNames.some((cityName) => cityName !== "LA" && cityName !== "NYC") ||
      new Set(cityNames).size !== cityNames.length
    ) {
      return stay(
        "Provide LA and NYC exactly once so their weather can be compared.",
      );
    }

    const weather = getCityTemperatures(cityNames);
    if (
      weather.length !== cityNames.length ||
      weather.some(
        (entry) =>
          entry?.temperature === null || entry?.temperature === undefined,
      )
    ) {
      return stay("Only LA and NYC cities are allowed");
    }

    if (weather.length !== 2) {
      return stay(
        "Provide LA and NYC exactly once so their weather can be compared.",
      );
    }

    for (const entry of weather) {
      this.saveState({
        [`city_${entry.city}`]: entry.temperature,
      });
    }

    return go(FooLogicStep);
  }

  /**
   * Normalizes colloquial or full city name variants into canonical aliases ('LA' or 'NYC').
   *
   * @param cityName - Raw city string provided by the user or model.
   * @returns Canonical city code or the original string if unrecognized.
   */
  private normalizeCityName(cityName: string): string {
    const normalized = cityName.trim().toLowerCase();
    if (normalized === "nyc" || normalized === "new york city") {
      return "NYC";
    }
    if (normalized === "la" || normalized === "los angeles") {
      return "LA";
    }
    return cityName;
  }

  /**
   * Handles user exit requests by redirecting to the terminal step.
   *
   * @returns Tool response transitioning to `TerminateSessionStep`.
   */
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> {
    // go(...) activates the terminal step with the abrupt-end prompt.
    return go(TerminateSessionStep).withPrompt(DemoPrompt.AbruptEnd);
  }
}
