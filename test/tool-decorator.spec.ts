/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolCall } from "@langchain/core/messages/tool";
import { z } from "zod";
import { Flow, Step, Tool, ToolResponseType } from "@picoflow/core";
import { AddressStep } from "../src/myflow/basic-flow/address-step.js";
import { DOBStep } from "../src/myflow/basic-flow/dob-step.js";
import { NameStep } from "../src/myflow/basic-flow/name-step.js";
import { DemoPrompt } from "../src/myflow/basic-flow/prompt/demo-prompt.js";
import { WeatherStep } from "../src/myflow/basic-flow/weather-step.js";
import { CompareStep } from "../src/myflow/hotel-flow/compare-step.js";
import { ExploreStep } from "../src/myflow/hotel-flow/explore-step.js";
import { PresentStep } from "../src/myflow/hotel-flow/present-step.js";
import { ExtractInvoiceStep } from "../src/myflow/invoice-flow/extract-invoice.js";

function createFlowStub(): Flow {
  return {
    requireTool(name: string) {
      return { name };
    },
  } as unknown as Flow;
}

function createToolCall(
  name: string,
  args: Record<string, unknown> = {},
): ToolCall {
  return {
    id: `${name}-call`,
    name,
    args,
    type: "tool_call",
  };
}

class MixedToolStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public useTool(): string[] {
    return ["legacy_tool", "aliased_tool"];
  }

  protected async legacy_tool(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    return args?.result ?? NameStep;
  }

  @Tool("aliased_tool")
  protected async differentlyNamed(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    return args?.result ?? "NameStep";
  }
}

class FirstDuplicateToolStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public defineTool() {
    return [
      {
        name: "duplicate_tool",
        description: "First duplicate tool definition.",
        schema: z.object({}),
      },
    ];
  }
}

class SecondDuplicateToolStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public defineTool() {
    return [
      {
        name: "duplicate_tool",
        description: "Second duplicate tool definition.",
        schema: z.object({}),
      },
    ];
  }
}

class DuplicateToolFlow extends Flow {
  protected configModel() {
    return { provider: "openai", name: "gpt-4o" } as const;
  }

  protected defineSteps(): Step[] {
    return [
      new FirstDuplicateToolStep(this),
      new SecondDuplicateToolStep(this),
    ];
  }
}

test("@Tool replaces useTool for NameStep without changing dispatch", async () => {
  const step = new NameStep(createFlowStub());

  assert.deepEqual(
    step.obtainTools().map((tool) => tool.name),
    ["user_name", "terminate_session"],
  );
  assert.equal(step.isToolAvailable("user_name"), true);
  assert.equal(step.isToolAvailable("terminate_session"), true);
  assert.equal(step.hasToolHandler("user_name"), true);
  assert.equal(step.hasToolHandler("terminate_session"), true);

  const result = await step.invokeToolHandler(
    createToolCall("user_name", { name: "John Doe" }),
  );
  assert.deepEqual(result, {
    step: "NameStep",
    tool: "Cannot accept John Doe, please choose a different name.",
  });
  assert.deepEqual(
    await step.invokeToolHandler(createToolCall("terminate_session")),
    {
      step: "TerminateSessionStep",
      prompt: DemoPrompt.AbruptEnd,
    },
  );
});

test("decorated tools merge with legacy useTool and handlers", async () => {
  const step = new MixedToolStep(createFlowStub());

  assert.deepEqual(
    step.obtainTools().map((tool) => tool.name),
    ["legacy_tool", "aliased_tool"],
  );
  assert.equal(step.hasToolHandler("legacy_tool"), true);
  assert.equal(step.hasToolHandler("aliased_tool"), true);
  assert.equal(
    await step.invokeToolHandler(
      createToolCall("legacy_tool", { result: "legacy args received" }),
    ),
    "legacy args received",
  );
  assert.equal(
    await step.invokeToolHandler(
      createToolCall("aliased_tool", { result: "aliased args received" }),
    ),
    "aliased args received",
  );
});

test("rejects duplicate tool definitions in a flow", () => {
  const flow = new DuplicateToolFlow();
  flow.collectSteps();

  assert.throws(
    () => (flow as unknown as { composeTool(): void }).composeTool(),
    /Duplicate tool 'duplicate_tool' registered in flow 'DuplicateToolFlow'/,
  );
});

test("every flow step exposes its migrated decorated tools", () => {
  const cases: Array<[new (flow: Flow) => Step, string[]]> = [
    [AddressStep, ["address", "terminate_session"]],
    [DOBStep, ["dob", "terminate_session"]],
    [NameStep, ["user_name", "terminate_session"]],
    [WeatherStep, ["get_weather", "terminate_session"]],
    [
      CompareStep,
      ["generate_comparison", "resume_booking", "terminate_session"],
    ],
    [ExploreStep, ["capture_choices", "terminate_session"]],
    [
      PresentStep,
      ["chosen_hotel", "search_again", "go_compare", "terminate_session"],
    ],
    [ExtractInvoiceStep, ["fetch_file", "capture_json"]],
  ];

  for (const [StepClass, expectedTools] of cases) {
    const step = new StepClass(createFlowStub());
    assert.deepEqual(
      step.obtainTools().map((tool) => tool.name),
      expectedTools,
      StepClass.name,
    );
    for (const toolName of expectedTools) {
      assert.equal(step.isToolAvailable(toolName), true, StepClass.name);
      assert.equal(step.hasToolHandler(toolName), true, StepClass.name);
    }
  }
});
