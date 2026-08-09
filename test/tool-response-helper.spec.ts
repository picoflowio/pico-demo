/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { AIMessage } from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/messages/tool";
import {
  Flow,
  HttpContentType,
  K,
  Step,
  Tool,
  ToolResponseType,
  direct,
  go,
  stay,
} from "@picoflow/core";

function createFlowStub(): Flow {
  return {} as Flow;
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

class HelperStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  @Tool
  protected async default_stay(): Promise<ToolResponseType> {
    await Promise.resolve();
    return stay();
  }

  @Tool
  protected async custom_stay(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    await delay(args?.delay ?? 0);
    return stay(args?.feedback);
  }

  @Tool
  protected async direct_message(): Promise<ToolResponseType> {
    return direct("Done");
  }
}

class OtherHelperStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  @Tool
  protected async custom_stay(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    await delay(args?.delay ?? 0);
    return stay(args?.feedback);
  }
}

test("go normalizes constructor and string targets to plain response data", () => {
  const fromClass = go(HelperStep);
  const fromString = go("HelperStep");

  assert.deepEqual(fromClass, { step: "HelperStep" });
  assert.deepEqual(fromString, { step: "HelperStep" });
  assert.equal(Object.getPrototypeOf(fromClass), Object.prototype);
  assert.deepEqual(Object.keys(fromClass), ["step"]);
  assert.equal(JSON.stringify(fromClass), '{"step":"HelperStep"}');
});

test("go rejects invalid Step targets", () => {
  assert.throws(() => go("  "), /non-empty Step name/);
  assert.throws(
    () => go(null as unknown as typeof HelperStep),
    /Step constructor/,
  );
});

test("fluent methods compose immutable response envelopes", () => {
  const message = new AIMessage("Done");
  const state = { city: "LA" };
  const base = go(HelperStep);
  const response = base
    .withToolFeedback("validated")
    .withState(state)
    .withPrompt("Continue")
    .withMessage(message)
    .withContentType(HttpContentType.Json);

  assert.deepEqual(base, { step: "HelperStep" });
  assert.notEqual(response, base);
  assert.equal(response.step, "HelperStep");
  assert.equal(response.tool, "validated");
  assert.equal(response.state, state);
  assert.equal(response.prompt, "Continue");
  assert.equal(response.message, message);
  assert.equal(response.contentType, HttpContentType.Json);
  assert.deepEqual(Object.keys(response), [
    "step",
    "tool",
    "state",
    "prompt",
    "message",
    "contentType",
  ]);
  assert.equal("withState" in response, true);
  assert.equal(JSON.stringify(response).includes("withState"), false);
});

test("later fluent calls replace only their own field", () => {
  const firstState = { city: "LA" };
  const secondState = { city: "NYC" };
  const response = go(HelperStep)
    .withState(firstState)
    .withPrompt("First")
    .withState(secondState)
    .withPrompt("Second");

  assert.equal(response.state, secondState);
  assert.equal(response.prompt, "Second");
});

test("stay resolves the invoking Step and defaults to K.ToolValidated", async () => {
  const step = new HelperStep(createFlowStub());
  const response = await step.invokeToolHandler(createToolCall("default_stay"));

  assert.deepEqual(response, {
    step: "HelperStep",
    tool: K.ToolValidated,
  });
});

test("stay uses custom feedback from the invoking tool handler", async () => {
  const step = new HelperStep(createFlowStub());
  const response = await step.invokeToolHandler(
    createToolCall("custom_stay", { feedback: "Try again" }),
  );

  assert.deepEqual(response, {
    step: "HelperStep",
    tool: "Try again",
  });
});

test("direct returns a direct message on the invoking Step", async () => {
  const step = new HelperStep(createFlowStub());
  const response = await step.invokeToolHandler(createToolCall("direct_message"));

  assert.equal(response.step, "HelperStep");
  assert.equal(response.tool, undefined);
  assert.equal(response.message?.content, "Done");
  assert.deepEqual(response.message?.additional_kwargs, { direct: true });
});

test("stay rejects calls outside a tool handler", () => {
  assert.throws(() => stay(), /only be used while a picoflow tool handler/);
});

test("direct rejects calls outside a tool handler", () => {
  assert.throws(() => direct("Done"), /only be used while a picoflow tool handler/);
});

test("stay scopes concurrent handler invocations to the correct Step", async () => {
  const first = new HelperStep(createFlowStub());
  const second = new OtherHelperStep(createFlowStub());

  const [firstResponse, secondResponse] = await Promise.all([
    first.invokeToolHandler(
      createToolCall("custom_stay", { delay: 10, feedback: "first" }),
    ),
    second.invokeToolHandler(
      createToolCall("custom_stay", { delay: 1, feedback: "second" }),
    ),
  ]);

  assert.deepEqual(firstResponse, { step: "HelperStep", tool: "first" });
  assert.deepEqual(secondResponse, {
    step: "OtherHelperStep",
    tool: "second",
  });
});
