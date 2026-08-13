# HotelFlow developer guide

`HotelFlow` is the most complete transactional conversation in this project.
It collects hotel criteria over several turns, searches a local catalog,
presents priced results, supports repeated feature comparisons, returns to
search or booking, and finishes with a confirmation number. It is a useful
template for workflows that preserve business state while moving backward and
forward between conversational stages.

For the framework-wide development sequence, complete `Flow` subclass contract,
workflow-shape selection, and session migration hooks, begin with the
[PicoFlow workflow developer guide](./picoflow-workflow-developer-guide.md).

For complementary patterns, see the
[BasicFlow developer guide](./basic-flow-developer-guide.md) and the
[InvoiceFlow developer guide](./invoice-flow-developer-guide.md).

The implementation is under
[`src/myflow/hotel-flow`](../src/myflow/hotel-flow/), and its semantic scenario
is under [`test/hotel-flow`](../test/hotel-flow/).

The [Step authoring contract](./step-authoring-contract.md) documents every
normal lifecycle hook and helper. This guide focuses on how HotelFlow uses
`getPrompt()`, `defineTool()`, `@Tool`, `onEnter()`, `onCrossing()`, state,
memory, messages, and transitions together.

## Start here: authoring a multi-turn conversation

Before writing prompts, decide which step begins the session, which data each
step owns, which stages share model history, and every legal transition. In
PicoFlow, the `Flow` registers stages and shared policy; each active `Step`
interprets one stage and returns the next workflow decision.

### Build the flow shell first

[`HotelFlow`](../src/myflow/hotel-flow/hotel-flow.ts) selects the default model,
configures memory compaction, and registers all stages:

```ts
export class HotelFlow extends Flow {
  protected configModel() {
    return { provider: "openai", name: "gpt-4o" } as const;
  }

  constructor() {
    super();
    this.getMemory()
      .setSummaryModel({ provider: "openai", name: "gpt-4o" })
      .setSummaryConfig({ minMessages: 8, recentMessages: 4 })
      .enableSummary("hotel-explore");
  }

  protected defineSteps(): Step[] {
    return [
      new ExploreStep(this).useMemory("hotel-explore"),
      new PresentStep(this),
      new CompareStep(this),
      new TerminateSessionStep(this).useMemory("end"),
    ];
  }
}
```

The durable cursor identifies the current top-level step. Register every target that can
be returned by `go(...)`. A step without `.useMemory(...)` gets an isolated
namespace named after its class, which is appropriate for presentation and
comparison here.

### Give every step one lifecycle

A conversational step normally implements:

```text
restore step state and memory
  -> onEnter() when newly activated
  -> onCrossing(...) to adapt the incoming message
  -> getPrompt()
  -> model/tool loop
  -> @Tool handler validates, saves state, and returns stay(...) or go(...)
  -> persist session and `flow.currentStep`
```

Use these hooks deliberately:

| Hook | Responsibility in HotelFlow |
| --- | --- |
| `getPrompt()` | Compose role, stage instructions, current state, and termination policy |
| `defineTool()` | Publish Zod-validated operations available to the model |
| `@Tool` handler | Run catalog/pricing code, save accepted values, and select a transition |
| `onEnter()` | Clear stale presentation/comparison history when re-entering a mode |
| `onCrossing()` | Replace a cross-stage user message with a stage-specific synthetic request |

Prompts decide how the assistant communicates; handlers and backend code
decide what the application accepts and does.

## Workflow at a glance

```text
                         explicit end request
                    +--------------------------> TerminateSessionStep
                    |
START --> ExploreStep --results--> PresentStep --book--> TerminateSessionStep
            ^                         |   |
            |                         |   +--compare--> CompareStep
            |                         |                    |   ^
            +--------search again-----+                    |   |
                                                             +--another comparison
                                                         |
                                                         +--resume booking--> PresentStep
```

Any stage may remain active while it gathers more information. A transition
can forward the last message with `.withMessage(...)`, letting the destination
interpret the same user request without asking the user to repeat it.

## Source map

| Area | Source | Responsibility |
| --- | --- | --- |
| Flow definition | [`hotel-flow.ts`](../src/myflow/hotel-flow/hotel-flow.ts) | Models, memory compaction, step registration, and entry stage |
| Search stage | [`explore-step.ts`](../src/myflow/hotel-flow/explore-step.ts) | Criteria prompt, structured capture, search execution, and retry |
| Results stage | [`present-step.ts`](../src/myflow/hotel-flow/present-step.ts) | Result presentation, booking, re-search, and comparison entry |
| Comparison stage | [`compare-step.ts`](../src/myflow/hotel-flow/compare-step.ts) | Feature selection, backend enrichment, table generation, repeated comparison, and booking return |
| Catalog | [`hotel-catalog.ts`](../src/myflow/hotel-flow/backend/hotel-catalog.ts) | Read-only bundled hotel filtering and lookup |
| Pricing MCP server | [`hotel-pricing-mcp-server.ts`](../src/tools/hotel-pricing-mcp-server.ts) | Typed `search_hotels` interface to the catalog and pricing engine |
| Charting | [`gen-chart.ts`](../src/myflow/hotel-flow/gen-chart.ts) | Flattening and Markdown comparison-table generation |
| Prompt assets | [`prompt/`](../src/myflow/hotel-flow/prompt/) | Role, explore schema/instructions, presentation, and comparison rules |
| Fixture | [`hotels.json`](../src/myflow/hotel-flow/data/hotels.json) | Local Portland-area hotel data |

## 1. Collect and search criteria

`ExploreStep` combines the role prompt, `explore.md`, the framework's end-chat
instructions, and a mutable JSON template. It injects the current UTC time, or
`HOTEL_FLOW_CURRENT_DATE` when deterministic replay is required. Previously
found hotels can also be reflected in the prompt.

The `capture_choices` tool accepts a typed criteria object containing dates, room
type, amenities, price range, and distance constraints. Its handler:

1. parses and saves the criteria under `ExploreStep.state.json`;
2. validates and maps the criteria to an MCP request;
3. calls the local `search_hotels` MCP tool;
4. projects each match to `hotelName`, daily `prices`, and `total`; and
5. returns `go(PresentStep).withState({ hotelFound })`, or `stay(...)` if no
   hotel matches.

The destination-state builder is important: `PresentStep.getPrompt()` reads
`hotelFound` from its own state. Cross-step data ownership should be explicit
rather than inferred from shared history.

The language model calls PicoFlow's `capture_choices` tool, not the MCP server
directly. `ExploreStep` owns durable criteria state and the `go(...)`/`stay(...)`
decision; the MCP service owns the read-only catalog and price calculation. This
keeps workflow routing deterministic while demonstrating a real service boundary.

Invalid criteria now return `stay(...)`, an empty MCP result is a normal
no-match response, and an MCP transport/service error remains distinct from
both so it is not presented as “no hotel found.”

## 2. Present results and interpret the next intent

When activated, `PresentStep.onEnter()` erases its memory so an old result list
does not bias the new presentation. `onCrossing()` supplies the synthetic
message `What hotels choice I have`, ensuring that a transition from search
immediately renders results.

Its prompt asks the model to list names and currency-formatted totals, then
offer three actions:

- `chosen_hotel` saves the choice and routes to `TerminateSessionStep` with a
  generated six-digit confirmation prompt;
- `search_again` routes to `ExploreStep` and forwards the last message, so a
  request such as “change to two beds and search” can update criteria directly;
- `go_compare` seeds `CompareStep` with selected and available hotel names,
  forwards the request, and activates comparison mode.

The current confirmation prompt always thanks the user for choosing Hilton,
but it does not interpolate the selected hotel name. If exact booking identity
matters, validate the choice against `hotelFound` and include the resolved name
in both saved state and the closing prompt.

## 3. Compare features repeatedly

`CompareStep` supports `amenities`, `roomType`, `distance`, and `price`.
`generate_comparison` fetches full catalog records, combines the selected
feature with pricing data from `PresentStep`, normalizes values through
`GenChart`, and emits a direct Markdown response.

It then returns to itself:

```ts
return direct(`${table}\nAnother comparison or ready to book?`);
```

Because selected hotel data is saved, a follow-up such as “compare on
amenities” can reuse the previous set. `resume_booking` routes back to
`PresentStep`; that step's crossing behavior regenerates the booking list.

## Backend behavior

`HotelCatalog` loads the bundled JSON once and filters hotels by required
amenities, room types, and strict distance cutoffs. `PricingEngine` enumerates
the requested dates, applies month, holiday, room, and weekend multipliers,
then filters by nightly budget and calculates totals.

The holiday fixture is named for 2025 and compares month/day rather than year.
That makes its holiday adjustments recur in other years. Treat this as demo
pricing; use a year-aware calendar and domain-reviewed rate rules in a real
booking system.

## Models, memory, and compaction

The flow default is `gpt-4o`. `ExploreStep` and `CompareStep` override it with
`gpt-5.1` at low reasoning effort; `PresentStep` keeps `gpt-4o` and overrides
temperature to `0.5`.

Only `hotel-explore` has rolling summarization enabled. Once it reaches eight
raw messages, PicoFlow uses `gpt-4o` to summarize older history while retaining
the four newest messages. Presentation and comparison use their class-named
spaces and explicitly erase them on entry.

## HTTP usage

Start a session:

```sh
curl -i http://localhost:8000/ai/run \
  -H 'content-type: application/json' \
  -d '{"flowName":"HotelFlow","message":"Hi","config":{}}'
```

Reuse the returned `CHAT_SESSION_ID` on every turn. A typical path provides a
Portland stay date range, nightly budget, room type, amenities, and distance
preferences; requests a search; compares results; resumes booking; and chooses
a hotel.

For deterministic date-sensitive runs, set `HOTEL_FLOW_CURRENT_DATE` before
starting the application.

## Tests

Run:

```sh
npm run test:hotel-flow
```

[`hotel-flow.scenario.json`](../test/hotel-flow/hotel-flow.scenario.json)
defines fourteen turns covering criteria collection, same-turn search changes,
initial and repeated comparisons, booking resumption, and completion. The test
boots the real NestJS application, checks session continuity and final state,
and uses a model judge for semantic output. It pins the conversation date to
July 15, 2027 and skips live execution when credentials are unavailable.

## Extension checklist

1. Add accepted criteria to the prompt JSON, parsed validation, and
   `PricingEngine` together.
2. Register a new step before targeting it with `go(...)`.
3. Decide whether re-entry should preserve, summarize, or erase its memory.
4. Validate names and identifiers against backend results before saving a
   booking decision.
5. Forward the current message only when the destination can safely interpret
   it in its own prompt.
6. Test no-result retries, same-turn mode changes, repeated comparisons,
   termination, and persisted business state.
