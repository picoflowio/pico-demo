# Critical evaluation: Hotel Reservation using Picoflow vs LangGraph

## Executive conclusion

Both implementations describe the same Hilton hotel conversation: collect a
date range and search criteria, search the local hotel catalog, present priced
results, compare hotels, return to booking, and finish with a confirmation
number. Each repository also contains a 14-turn semantic scenario for that
conversation. The direct implementation demonstrates that Picoflow is not
technically required: LangGraph, LangChain tools, and an application-owned
session layer can deliver the same visible workflow.

The current source also shows a substantial application-authoring difference.
The Picoflow workflow itself is 472 lines across one `Flow` and three
conversation steps. The corresponding pure-LangGraph graph, state definition,
type definitions, and session store are 1,397 lines. The direct implementation
therefore contains 925 more lines in the workflow/runtime boundary; HotelFlow
uses 66.2% less code in that normalized comparison.

Including the hotel-specific catalog, pricing, and chart helpers, the Picoflow
directory contains 942 TypeScript lines and the direct LangGraph directory
contains 1,687. That broader footprint is 745 lines larger on the direct side,
or 44.2% more. The difference is not only graph syntax. Picoflow supplies the
agent loop, tool dispatch, transition handling, session envelope, persistence
contract, memory compaction, token accounting, provider resolution, and
same-session concurrency safeguards as shared runtime behavior.

The recommendation for this codebase is to keep `HotelFlow` as the production
implementation and treat `HotelLanggraph` as a useful conformance and
regression fixture. Direct LangGraph remains the better choice for a small
prototype, an unusual graph that needs unwrapped LangGraph APIs, or a team that
already owns equivalent runtime infrastructure. Picoflow's remaining risks are
manageable through version pinning, contract tests, migration discipline, and
normal application-level validation; the larger default risk in this comparison
is the productivity loss caused by rebuilding and maintaining direct graph
infrastructure.

## What was compared

The review examined the current working-tree implementations:

- [`HotelFlow`](../src/myflow/hotel-flow/hotel-flow.ts), its
  [`ExploreStep`](../src/myflow/hotel-flow/explore-step.ts),
  [`PresentStep`](../src/myflow/hotel-flow/present-step.ts), and
  [`CompareStep`](../src/myflow/hotel-flow/compare-step.ts).
- The Picoflow hotel [catalog and pricing backend](../src/myflow/hotel-flow/backend/),
  chart renderer, prompt assets, and
  [semantic scenario](../test/hotel-flow/hotel-flow.scenario.json).
- The direct
  [`HotelLanggraph`](../../ezgraph-demo/src/graphs/hotel-langgraph/hotel-langgraph.ts),
  its [state and domain types](../../ezgraph-demo/src/graphs/hotel-langgraph/hotel-langgraph.state.ts),
  [custom session store](../../ezgraph-demo/src/graphs/hotel-langgraph/hotel-session-store.ts),
  backend, chart renderer, prompt assets, and
  [semantic scenario](../../ezgraph-demo/test/hotel-langgraph/hotel-langgraph.scenario.json).

The line counts use `wc -l`, so they include comments, imports, and blank lines.
Tests and framework source are excluded. The comparison is made against the
current source rather than an idealized architecture that either project could
build later. The two implementations have parallel copies of the hotel data
and prompts; their helpers are similar but are not literally shared files.

The direct implementation is called “pure LangGraph” here to mean “not built
on Picoflow.” It still uses LangChain message and tool types and binds
`ChatOpenAI` models directly.

## Functional chatbot comparison

Both applications implement this state machine:

```text
collect criteria -> present results -> compare hotels
       ^                 ^                 |
       |                 +-----------------+
       +-- change search                    |
                                            v
                                      resume booking

present results -> book -> terminal
any stage -> terminate -> terminal
```

Both implementations:

- collect dates, budget, room type, amenities, and distance preferences;
- search the same style of bundled Portland-area hotel catalog;
- calculate daily prices and totals with a local pricing engine;
- present results and permit a new search;
- compare price, room type, amenities, or distance;
- reuse selected hotels for a subsequent comparison;
- return to the hotel list and generate a six-digit confirmation number;
- keep stage-specific conversational context; and
- expose deterministic date overrides for replayable tests.

The authoring shape is different:

```text
HotelFlow -> ExploreStep -> PresentStep -> CompareStep
                     \          |             /
                      +---- go/stay/direct ---+

HotelLanggraph -> StateGraph
  START -> exploreAgent -> exploreTools
        -> presentAgent -> presentTools
        -> compareAgent -> compareTools -> END
```

`HotelFlow` registers steps and configures their models and memory. A step
combines its prompt, tool definitions, handlers, domain state, and transition
outcomes. `go(...)` activates another step, `stay(...)` keeps the current step
active with corrective feedback, and `direct(...)` returns a response without
another model call.

`HotelLanggraph` builds six explicit graph nodes: an agent node and a tool node
for each stage. It stores `phase`, `route`, and `inputConsumed` in an
annotation-based state and uses conditional edge functions to route each
invocation. Tool effects and routing are ordinary branches in one large class.

The visible behavior is close, but the implementations are not behaviorally
identical outside the tested path. The direct version validates a selected
hotel against the current results before booking and validates comparison names
against the available results. The current `PresentStep.chosen_hotel` saves the
requested name and goes to the terminal step without that exact-result check.
The current Picoflow comparison handler likewise relies more heavily on the
model and catalog lookup than the direct handler. Those are application-level
validation gaps, not evidence that Picoflow cannot validate them; they should be
fixed in `HotelFlow`.

The direct version persists `bookedHotel` and `confirmationNumber` in its
state. Picoflow persists the selected hotel, but the generated confirmation
number is embedded in the terminal prompt rather than saved as a durable field.
That makes the direct session easier to inspect after booking, even though the
user-visible scenario can still pass.

## Code-size evidence

| Scope | HotelFlow with Picoflow | HotelLanggraph direct | Difference |
| --- | ---: | ---: | ---: |
| Flow/step versus graph/state/types/store | **472** | **1,397** | **+925 direct** |
| All hotel TypeScript, including backend and charting | **942** | **1,687** | **+745 direct** |
| Prompt and catalog assets | 1,141 | 1,160 | +19 direct |
| Complete hotel directory inventory | **2,083** | **2,847** | **+764 direct** |

The first row is the clearest framework comparison. It compares the code an
application author uses to express the conversation with the code required to
build the direct graph's state and session runtime. HotelFlow's 472 lines still
contain real domain logic: prompt construction, criteria extraction, search,
booking, comparisons, and chart assembly. Picoflow is removing repetitive
conversation infrastructure rather than removing the hotel rules.

The second and third rows are inventory context. The direct implementation has
a more compact chart helper, while the Picoflow helper contains additional
formatting functions, so not every line difference is a framework win. The
normalized workflow row avoids pretending that every line in a catalog or
renderer is orchestration code.

Picoflow's own source is intentionally excluded, just as LangGraph and
LangChain internals are excluded. A consumer pays the cost of learning,
configuring, testing, upgrading, and operating a framework; it does not
rewrite that framework for every chatbot.

## Modularity

### HotelFlow

HotelFlow has four small application-owned modules with clear responsibilities:

- `HotelFlow` owns topology, default model policy, and memory compaction;
- `ExploreStep` owns criteria collection and searching;
- `PresentStep` owns result presentation, booking, re-search, and comparison entry;
- `CompareStep` owns feature comparisons, chart generation, and booking return.

The catalog, pricing engine, chart renderer, and prompt assets remain outside
the step classes. A developer changing comparison behavior can work primarily
in `CompareStep`; a developer changing the search contract can work primarily
in `ExploreStep`. State is associated with the step that owns it, while
cross-step data is read through explicit flow helpers such as
`getStepState(...)`.

This shape is also consistent with the other flows in the repository. A team
member can recognize a `Step` as the unit that supplies a prompt, tools, state,
and semantic transitions without reconstructing a local graph convention.

There are real coupling costs. Step class names are persisted identifiers, so a
rename can be a session migration. Decorated tool methods are connected to
definitions by names. The developer must understand `go`, `stay`, memory
namespaces, and the inherited model loop.

### HotelLanggraph

The direct implementation has two good seams:

- `HotelModelFactory` makes stage models replaceable in tests;
- `HotelSessionStore` separates memory, SQLite, and MongoDB persistence.

The conversational implementation is otherwise concentrated in a 1,063-line
class. That class constructs tools and models, builds graph topology, invokes
agents, dispatches tools, validates arguments, normalizes criteria, performs
hotel operations, creates responses, and manages session lifecycle. The state
annotation and session store are separate, but the domain stages are not.

Pure LangGraph does not require a monolith. The direct class could be split into
phase modules, reusable agent/tool-loop helpers, and a shared persistence
package. Doing that well would, however, recreate much of the standard
application layer that Picoflow already provides.

**Modularity winner for this codebase: HotelFlow/Picoflow.** Direct LangGraph
retains the advantage of local visibility when a developer needs to step
through a single raw graph invocation.

## Team consistency and time to market

Direct LangGraph provides flexible primitives but does not establish one
application-wide convention for stage state, tool dispatch, persistence,
history, error handling, or response envelopes. One team can use reducers and
checkpointers; another can use an outer session document; a third can put the
conversation cursor in a custom database record. Each choice may be reasonable
in isolation, but the portfolio becomes harder to review and operate.

Picoflow makes the intended authoring picture explicit:

```text
Flow -> registered Step -> prompt and selected tools
     -> typed outcome -> step state and memory
     -> one versioned session document
```

The application controller also exposes all registered flows through one
`/ai/run` contract and one `flowName` selector. The hotel flow is therefore
part of the same runtime vocabulary as the basic, invoice, travel, and tutorial
flows.

The line-count result is not a calendar-time benchmark. It does indicate that a
new Picoflow chatbot has fewer application-owned concerns to design, review,
test, and explain before it can reach the same demonstration. A stronger
experiment would measure implementation hours, review comments, defects, and
time to add a second graph.

**Time-to-market assessment: Picoflow has the stronger default for a portfolio
of multi-turn chatbots.** Direct LangGraph may be faster for one small graph
when the team already knows its preferred runtime pattern.

## Contract clarity

| Boundary | HotelFlow/Picoflow | HotelLanggraph direct |
| --- | --- | --- |
| HTTP contract | Shared `AiController` at `/ai/run`, with `flowName` and `CHAT_SESSION_ID` | `HotelLanggraph.run(...)` accepts a graph-specific input object |
| Graph identity | Registered `HotelFlow` name, bound to one session | Explicit `name = "HotelLanggraph"` checked by its custom store |
| Durable cursor | `flow.currentStep` | `phase` plus transient `route` |
| Stage contract | `Step` lifecycle, prompt, tools, state, memory, and outcomes | Plain async graph nodes plus explicit conditional edges |
| Tool contract | Zod definition plus decorated `@Tool` handler and framework dispatch | LangChain tool objects plus manual name-based dispatch branches |
| Transition contract | `go`, `stay`, `direct`, and destination state/message/prompt | State updates to `phase`, `route`, message arrays, and `inputConsumed` |
| Persistence contract | Shared versioned session schema, adapters, logs, tokens, and revisions | Graph-specific document with custom memory/SQLite/Mongo adapters |
| Provider contract | Provider adapters and model selection; this flow currently selects OpenAI | Direct `ChatOpenAI` with an injectable factory |

Picoflow has the stronger cross-application contract. It validates the
one-flow-per-session invariant, records status and operational metadata, and
gives every flow the same persistence and response boundary.

The direct graph is more locally explicit. A LangGraph developer can read its
`StateGraph` and conditional edges without learning Picoflow's lifecycle. That
is valuable for one-off work and for adopting new LangGraph features quickly.
The cost is that `phase`, `route`, and `inputConsumed` form a distributed
protocol whose invariants are maintained manually.

**Contract winner: Picoflow for a shared application platform; direct
LangGraph for raw local transparency.**

## Where the boilerplate went

HotelLanggraph implements the following concerns in application source:

- seven Zod schemas and seven LangChain tool objects;
- stage-to-tool arrays and per-stage bound models;
- three agent nodes and three tool nodes;
- conditional routing after every agent and tool node;
- manual selection of termination and tool calls;
- repeated invalid-tool result construction and Zod error formatting;
- user-input consumption and synthetic messages when stages change;
- criteria normalization and date validation;
- message serialization and restoration;
- session ID validation, expiration, load, save, and deletion;
- memory, SQLite, and MongoDB adapters; and
- the graph-specific response envelope.

HotelFlow still contains the hotel rules, schemas, validation choices, search,
comparison construction, booking transition, and prompts. Picoflow removes
mostly the repeated machinery around those rules. That is the useful kind of
abstraction: application code stays responsible for what a hotel operation
means, while the framework owns how a multi-turn step is executed and saved.

Picoflow does retain visible ceremony. A tool can appear in both `defineTool()`
and a decorated method; transitions use framework-specific helpers; and a
developer must understand the lifecycle when forwarding or replacing messages.
Those costs are smaller than implementing a separate state-and-session runtime
for each graph, but they are not zero.

**Boilerplate winner: HotelFlow/Picoflow.**

## Memory and session-document organization

The two implementations make different choices about persistence. The direct
graph writes a graph-specific document after each invocation. Picoflow writes
one framework session document that contains the flow, its steps, memory,
status, operational logs, and token totals.

### Picoflow session shape

The effective Picoflow document is structured like this:

```jsonc
{
  "id": "...",
  "revision": 7,
  "version": 1.5,
  "runStatus": "running | completed | aborted",
  "flow": {
    "name": "HotelFlow",
    "model": { "provider": "openai", "name": "gpt-4o", "params": {} },
    "currentStep": "ExploreStep | PresentStep | CompareStep | ...",
    "steps": [
      { "name": "ExploreStep", "state": {}, "model": {} }
    ],
    "memory": {
      "hotel-explore": { "messages": [], "summary": "..." }
    },
    "context": {},
    "sequence": []
  },
  "tokens": {},
  "log": [],
  "error": [],
  "warn": [],
  "createdOn": "...",
  "saveOn": "..."
}
```

HotelFlow enables rolling summary compaction only for `hotel-explore`, keeping
the recent conversation and summarizing older messages with `gpt-4o`. Present
and compare use isolated step-named memory and clear it when entering a new
mode. Picoflow also records provider-neutral token totals and model overrides.

The `revision` field is a compare-and-swap value. FlowEngine serializes turns
for a session in-process, and the session stores reject stale revisions. This
means the framework has a defined response to concurrent requests instead of
silently letting the last whole-document write win.

### Direct session shape

HotelLanggraph persists a smaller application-specific envelope:

```jsonc
{
  "version": 1,
  "id": "...",
  "graphName": "HotelLanggraph",
  "state": {
    "phase": "explore | present | compare | terminal",
    "route": "exploreAgent | presentAgent | compareAgent | end",
    "completed": false,
    "response": "...",
    "userInput": "...",
    "inputConsumed": true,
    "criteria": {},
    "hotelFound": [],
    "availableHotels": [],
    "selectedHotels": [],
    "lastComparison": [],
    "bookedHotel": "...",
    "confirmationNumber": 123456,
    "exploreMessages": [],
    "presentMessages": [],
    "compareMessages": []
  },
  "expireAfter": 50000,
  "createdAt": "...",
  "modifiedAt": "..."
}
```

This shape is straightforward for one graph and keeps all domain state in one
annotation-compatible object. It also persists transient control values such as
`response`, `userInput`, `route`, and `inputConsumed`. It has no revision-based
write protection, token totals, warning/error history, or framework-wide
operational status. Its custom store is clear, but it is application code that
every direct graph would need to duplicate or extract.

HotelLanggraph's fallback expiration is 50,000 milliseconds, approximately 50
seconds. PicoFlow has no framework-wide timeout: each Flow chooses whether an
old session may resume in `onRestoreSessionDoc()`. The direct fallback is
especially short for a human conversation.

| Question | Better choice | Reason |
| --- | --- | --- |
| Understand one graph in isolation | HotelLanggraph | Its state mirrors the graph annotation directly |
| Diagnose a production turn | HotelFlow | Status, logs, warnings, errors, model metadata, and tokens are standard fields |
| Query sessions across many flows | HotelFlow | Every flow shares the same outer schema |
| Add a small custom store | HotelLanggraph | `HotelSessionStore` is a compact local interface |
| Prevent stale whole-document writes | HotelFlow | Revision checks and session locking are framework concerns |
| Compact long-running chat history | HotelFlow | Memory namespaces and rolling summaries are built in |
| Use only the minimum persisted fields | HotelLanggraph | The graph controls its own envelope |

**Session organization winner: HotelFlow/Picoflow for an application fleet;
HotelLanggraph for a single graph whose state must be immediately visible.**

## Debugging and machine comprehension

### Source-level debugging

HotelLanggraph is easy to enter with a debugger because the model call, graph
node, tool dispatch, route selection, and state update are in the same source
file. The drawback is that a stage transition can involve several manually
maintained fields and repeated branches. A bug in input forwarding may require
tracing `phase`, `route`, `inputConsumed`, message reducers, and conditional
edges together.

HotelFlow is easier to navigate by business responsibility. A search problem
belongs to `ExploreStep`; a comparison problem belongs to `CompareStep`; the
runtime lifecycle is shared. A rare framework problem requires stepping into
Picoflow's runner, memory, or session store, so the debugging boundary moves
out of the application repository. That is a real dependency cost, balanced by
the fact that the same infrastructure is debugged once for many flows.

### Machine comprehension

For an AI coding agent reading one local function, direct LangGraph is more
explicit: tool calls and state updates are ordinary code. For an agent reasoning
about the complete application, HotelFlow's three named steps are more cohesive
than one 1,063-line multipurpose class.

For machines consuming persisted data, Picoflow has the stronger contract. A
tool can reliably look for `runStatus`, `flow.currentStep`, `flow.steps`,
`flow.memory`, `tokens`, and `error` across the entire portfolio. A direct
LangGraph consumer must learn a new state and persistence vocabulary for each
application.

The Picoflow advantage depends on documentation and type declarations being
available. If the framework is opaque or its lifecycle is undocumented, the
same abstractions that reduce application code can become hidden context.

**Debugging assessment: direct LangGraph for low-level local stepping; Picoflow
for routine domain work, session diagnosis, and fleet-wide automation.**

## Risks specific to Picoflow

Picoflow's risks are real but comparatively bounded. They are mostly dependency
governance and lifecycle-learning risks, not repeated productivity risks in
every chatbot:

- Pin the Picoflow version, run its contract tests in CI, and review upgrades
  against the public `Flow`, `Step`, tool, memory, and session contracts. The
  distribution terms should also be explicit before production adoption.
- A framework defect can affect several flows at once. Version pinning,
  conformance scenarios, staged rollout, and a supported release process keep
  that blast radius observable and recoverable.

The practical Picoflow mitigation is straightforward: keep the framework
boundary stable, test it once at the platform level, and keep business rules in
the steps and backend. None of these risks requires each chatbot team to
reimplement the session engine or agent loop.

## Risks specific to direct LangGraph: complexity and productivity loss

The main direct-LangGraph risk is not that it cannot work. It is that every
application team becomes responsible for a growing amount of workflow
infrastructure, and that responsibility compounds as the number of graphs and
developers increases.

- **More code means more design work before domain work begins.** In this
  comparison the direct workflow/runtime boundary is 1,397 lines versus 472 in
  HotelFlow. The extra 925 lines are largely agent loops, tool routing, state
  transitions, message forwarding, session serialization, and persistence. A
  developer must understand and maintain those concerns before adding a hotel
  feature.
- **A small feature crosses too many mechanisms.** Adding a new stage or tool
  can require a schema, a tool object, a stage-tool array, a bound model, an
  agent node, a tool node, one or more conditional routes, message-history
  handling, state fields, and persistence serialization. The feature's business
  code is surrounded by coordination work.
- **State-machine complexity consumes engineering capacity.** `phase`, `route`,
  `inputConsumed`, three message arrays, reducers, synthetic messages, and
  conditional edges form a protocol that must remain consistent. The code may
  be explicit, but explicit distributed state is still cognitive load. A change
  that looks local can alter resume behavior, tool-loop behavior, or the next
  HTTP response.
- **Productivity declines through review and onboarding.** A new developer has
  to reconstruct the local graph conventions before safely changing a node.
  Reviewers must inspect topology, state updates, tool dispatch, persistence,
  and error paths in addition to the business rule. That increases ramp-up
  time, review latency, and the chance that a correct domain change introduces
  an unrelated lifecycle regression.
- **The same infrastructure is paid for repeatedly.** Each direct graph needs
  decisions about session shape, expiration, message serialization, token
  accounting, logging, errors, concurrency, and provider adapters. Even if the
  first graph tolerates that cost, the second graph repeats it or forces an
  early internal framework project.
- **Operational inconsistency becomes a maintenance tax.** One direct graph
  may persist a `phase`, another a `currentNode`, and another only a database
  checkpoint. Operators, dashboards, migration scripts, and coding agents must
  learn every vocabulary. Shared incidents cannot be fixed once at the common
  runtime boundary.
- **Testing must cover infrastructure combinations, not only intent.** Tests
  need to exercise agent-without-tool responses, malformed tool calls, repeated
  comparisons, cross-stage input forwarding, terminal behavior, stale sessions,
  expired sessions, serialization, and concurrent writes. The direct class
  owns all of those combinations.
- **Debugging complexity grows faster than linearly.** A route bug can involve
  a model response, the latest-tool-call selector, a reducer, a synthetic
  message, a conditional edge, and a session write. The source is visible, but
  the interaction surface is large. Visibility should not be confused with
  simplicity.
- **The opportunity cost is material.** Time spent building a runner, store,
  history policy, and observability layer is time not spent on booking
  correctness, security, user experience, or integrations. For a product team,
  that lost feature capacity is often more important than the direct graph's
  lower framework dependency count.
- **The likely end state is another framework.** Once several direct graphs
  exist, teams naturally extract shared runners, stores, state conventions, and
  tool loops. That creates framework maintenance without the benefit of a
  deliberate public contract, migration policy, or shared conformance suite.

The direct implementation's local transparency is a legitimate benefit, but it
does not cancel this productivity cost. Raw primitives give maximum control;
they also transfer the complexity budget from the framework maintainer to every
application team.

## Is Picoflow actually easier for a developer?

**Yes, for the second and subsequent multi-turn workflows that fit its staged
conversation model.** The current source has smaller, more cohesive domain
modules, and important session, memory, and provider behavior comes from one
runtime. The 472-versus-1,397 normalized line comparison makes that benefit
visible.

**There is still a bounded abstraction and dependency cost.** A developer must
learn the Picoflow lifecycle, understand inherited behavior, preserve persisted
step names, and wait for the framework to expose advanced capabilities. That
cost is usually smaller than the recurring direct-LangGraph complexity above
when several flows share the same runtime contract.

The defensible value proposition is:

> Picoflow standardizes the repetitive application engineering around
> multi-turn LangChain/LangGraph-style conversations so individual flow authors
> can focus on prompts, tools, validation, domain state, and transitions.

It should not be advertised as making the language model more capable or as
eliminating the need for direct business validation.

## Decision framework

Use Picoflow when most of the following are true:

- the application will contain several conversational flows;
- flows need one HTTP contract, session shape, storage policy, and operational
  metadata model;
- developers should work in domain-oriented stages;
- memory compaction, token accounting, provider adapters, and concurrency
  safeguards should be shared;
- the team can depend on Picoflow's release and licensing terms; and
- the workflow fits the `Flow`/`Step` lifecycle.

Prefer direct LangGraph when most of the following are true:

- there is one small graph or a short-lived prototype;
- the graph needs LangGraph features before Picoflow exposes them;
- full control of state reducers, topology, and persistence is more valuable
  than a common application contract;
- another platform already owns sessions, observability, and concurrency;
- the team has strong direct LangGraph expertise; or
- the graph is unusual enough that the Picoflow lifecycle fights its design.

For a normal multi-turn product chatbot, direct LangGraph should carry an
explicit productivity-risk review. The team should estimate not only the first
graph's implementation effort, but also the cost of the next graph, onboarding,
cross-graph operations, regression testing, and maintaining the custom runtime.

## Recommendation for this codebase

Keep `HotelFlow` as the primary application path. It is substantially smaller
at the workflow boundary, more modular in this repository, and integrated with
the same controller, session, provider, and memory conventions as the other
Picoflow examples. The direct implementation is valuable as an independent
behavioral baseline: it proves that the hotel conversation is not dependent on
Picoflow-specific model magic and can catch regressions in the framework.

Do not maintain both as equivalent production paths. That would double the
maintenance surface while preserving the same demo-domain defects. Instead:

1. port the direct implementation's stronger selected-hotel and comparison
   validation into `PresentStep` and `CompareStep`;
2. persist the confirmation number as booking state in `PresentStep`;
3. replace random confirmation with an idempotent reservation boundary;
4. fix exclusive checkout pricing and add tests for date and rate rules;
5. document Picoflow's public versioning, licensing, provider, and persistence
   guarantees;
6. keep the direct LangGraph scenario as a conformance fixture; and
7. measure future graphs by implementation time, defects, review effort, and
   operational incidents—not by line count alone.
