# Multi-tool handlers in BasicFlow

PicoFlow's `@Tools([...])` decorator handles a matching set of tool types from
one model response. It is useful when several calls can be processed together,
such as the two weather lookups requested by `WeatherStep`.

## Type-based matching

The decorator names tool types, not the number of model call instances:

```ts
import type { ToolCall } from "@langchain/core/messages/tool";
import { Tools, type ToolResponseType } from "@picoflow/core";

@Tools(["get_weather"])
protected async get_weather_batch(
  calls: readonly ToolCall[],
): Promise<ToolResponseType> {
  // calls may contain one, two, or more get_weather calls
}
```

Matching is order-independent and uses the exact distinct-name set. Repeated
`get_weather` calls are passed to the same handler with their original
arguments and IDs.

When a matching `@Tools` handler exists, it shadows the individual `@Tool`
handler—even for a single call. If no group handler matches, individual
handlers are used normally and sequentially.

`@Tools` does not publish a tool definition by itself. The individual tool
still needs its `defineTool()` schema and an individual `@Tool` or `useTool()`
selection.

## WeatherStep behavior

[`WeatherStep`](../src/myflow/basic-flow/weather-step.ts) keeps its existing
individual `get_weather` handler and adds a group handler. The group handler:

1. Normalizes every requested city.
2. Requires LA and NYC exactly once for a comparison batch.
3. Calls the deterministic city-temperature fixture once with all cities.
4. Saves each temperature under `city_LA` or `city_NYC`.
5. Returns `go(FooLogicStep)` when both values are available, otherwise a
   routed `stay(...)` response.

The group handler must always return a routing result. Returning `null`,
`undefined`, or an invalid/unknown result is an error; the runtime never falls
back to the individual handler after selecting the group handler.

The runner still emits one tool-result message per original tool-call ID, even
though the backend operation and route are applied once.
