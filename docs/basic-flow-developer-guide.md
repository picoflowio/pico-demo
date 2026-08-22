# BasicFlow developer guide

`BasicFlow` is the broadest PicoFlow tutorial in this repository. It combines a
durable multi-turn conversation with batched tool handling, deterministic logic
steps, prompt-file loading, separate memory namespaces, cross-step state,
transient state, structured output, nested execution, parallel child steps,
step-level model overrides, session restore policy, and a concurrent batch
mode.

For the framework-wide development sequence, complete `Flow` subclass contract,
workflow-shape selection, and session migration hooks, begin with the
[PicoFlow workflow developer guide](./picoflow-workflow-developer-guide.md).

Use the more focused guides for complementary patterns:

- [HotelFlow developer guide](./hotel-flow-developer-guide.md) focuses on a
  practical search, compare, and booking workflow.
- [InvoiceFlow developer guide](./invoice-flow-developer-guide.md) covers
  multimodal document extraction and raw JSON responses.

The implementation is under
[`src/myflow/basic-flow`](../src/myflow/basic-flow/), and its deterministic
conversation scenario is under [`test/basic-flow`](../test/basic-flow/).

Read the [Step authoring contract](./step-authoring-contract.md) for the full
hook and helper list, invocation order, tool dispatch rules, and the boundary
between supported overrides and framework plumbing. `BasicFlow` exercises more
of that contract than any other example in this project.

## Start here: authoring a custom flow

Build a PicoFlow workflow in this order: define the flow shell, register all
steps and memory spaces, implement each step's lifecycle, then connect steps
with semantic tool responses. The flow owns available stages and shared
policy; `flow.currentStep` owns the next user turn.

### 1. Define the flow shell

[`BasicFlow`](../src/myflow/basic-flow/basic-flow.ts) selects a default model
and returns every step that the workflow may activate:

```ts
export class ProfileFlow extends Flow {
  protected configModel() {
    return {
      provider: "openai",
      name: "gpt-4o-mini",
      params: { temperature: 0.2 },
    } as const;
  }

  protected defineSteps(): Step[] {
    return [
      new CollectStep(this).useMemory("profile"),
      new ValidateLogicStep(this),
      new TerminateSessionStep(this).useMemory("end"),
    ];
  }
}
```

The first step returned by `defineSteps()` selects the initial top-level step.
Override `initialStep()` when the entry point depends on runtime context. A later
`go(SomeStep)` can only target a step registered here. Steps without `.useModel(...)` inherit the
flow model; steps without `.useMemory(...)` use their class name as an isolated
memory namespace.

### 2. Choose the step lifecycle

| Pattern | Base class or hook | Use it for |
| --- | --- | --- |
| Conversational step | `Step` with `getPrompt`, tools, and `@Tool` handlers | A resumable stage whose model may ask questions and invoke validated operations |
| Deterministic transition | `LogicStep.runLogic()` | Synchronous or asynchronous application logic that should not call a model |
| Free-form/structured model response | `Step.onResponse()` and optionally `structOutputSchema()` | A stage that consumes the model's response without a tool call |
| Nested child call | `runStep(ChildStep)` | One internal model-backed task whose result returns to its parent |
| Parallel child calls | `runSteps([...])` | Independent internal tasks that can execute concurrently |
| Batch self-invocation | `Flow.concurrentSteps(...)` from `spawnSteps()` | Multiple independent sessions configured from a coordinator request |

`runStep` and `runSteps` use nested in-memory execution frames. Child steps execute and
record nested sequence entries without permanently replacing the parent; the
parent resumes after the child call returns.

### 3. Keep state, memory, and context distinct

- `this.saveState(...)` writes durable state owned by the current step.
- `flow.getStepState(StepClass, key)` reads another step's durable state.
- `flow.saveStepState(...)` writes state owned by another registered step.
- `saveTransientStepState(...)` passes ephemeral data to a child step; transient
  data is omitted when the session document is persisted.
- `useMemory(name)` selects model conversation history. Sharing a name shares
  history; using a different name isolates it.
- `getContext("config.x")` reads session-wide configuration initialized from
  the first request's `config` object. Restored sessions retain their stored
  context; keep domain values in the state of the step that owns them.

### 4. Route from code, not prompt prose

Tool handlers and logic steps return the workflow decision:

```ts
@Tool
protected async capture(args: Record<string, any>) {
  if (!isValid(args.value)) return stay("Explain what must be corrected.");
  this.saveState({ value: args.value });
  return go(NextStep).withState({ accepted: true });
}
```

`stay(...)` retains the current step. `go(...)` activates a registered target.
The optional builders attach model feedback, destination state, a prompt,
message, or content type. Do not rely on the model to enforce a validation rule
that belongs in application code.

## What BasicFlow does

The normal profile path is:

```text
WeatherStep --both cities--> FooLogicStep --> GooLogicStep --> FavoritesStep
    |                                                        |
    +--unsupported/incomplete--> stay                        v
                                                           NameStep
                                                              |
                         nested structured InContextStep -----+
                                  /              \
                         ConcurStep1          ConcurStep2
                              |                    |
                         ConcurStep3          ConcurStep4
                                                              |
                                                              v
                                                           DOBStep
                                                              |
                                                              v
                                                         AddressStep
                                                              |
                                                              v
                                                   TerminateSessionStep
```

Any main conversational stage that defines `terminate_session` can jump to the
terminal step. Two alternate modes are controlled through request config:

- `config.isPresident` makes `PresidentStep`, rather than `WeatherStep`, the
  initial stage for a newly created flow instance.
- `config._concurrent` makes `Flow.run()` call `spawnSteps()`; `BasicFlow`
  starts independent president-query sessions in batches of three.

## Tour of every step

| Step | Kind | Memory | Responsibility and transition |
| --- | --- | --- | --- |
| `WeatherStep` | `Step` + tool | class default | Uses a deterministic local temperature fixture, accumulates LA and NYC temperatures, stays until both exist, then goes to `FooLogicStep` |
| `FooLogicStep` | `LogicStep` | `default` | Proceeds without an LLM call and attaches `fooData` to destination `GooLogicStep` |
| `GooLogicStep` | `LogicStep` | `default` | Attaches `gooData` to destination `FavoritesStep` and proceeds there |
| `FavoritesStep` | response-driven `Step` | `favorite` | Loads prompt/schema files, parses JSON from the model response, saves favorites, and returns `NameStep` |
| `NameStep` | `Step` + tools | `default` | Rejects `John Doe`; reads session context, passes transient data, runs `InContextStep`, saves its answer, then goes to `DOBStep` |
| `InContextStep` | structured nested `Step` | `separate` | Runs two child branches in parallel, requests a typed movie idea, and returns it to `NameStep` |
| `ConcurStep1` | nested `Step` | class default | Runs a first follow-up and returns `ConcurStep3` from `onResponse()` |
| `ConcurStep2` | nested `Step` | class default | Starts `ConcurStep4` from `onEnter()`, then handles its own response |
| `ConcurStep3` / `ConcurStep4` | nested `Step` | class default | Small follow-up model tasks used to demonstrate nested sequencing |
| `DOBStep` | `Step` + tools | `default` | Reads the saved name into its prompt, stores year/month/day, then goes to `AddressStep` |
| `AddressStep` | `Step` + tools | `default` | Validates and parses a US address, stays on failure, and sends destination state and a closing prompt to `TerminateSessionStep` |
| `PresidentStep` | alternate `Step` | `president` | Turns `config.nth` into a president question and completes worker sessions |
| `TerminateSessionStep` | framework step | `temp` | Produces the closing response and marks the session complete |

## Key patterns in detail

### Batched tool handling with incremental state

[`WeatherStep`](../src/myflow/basic-flow/weather-step.ts) calls
`getCityTemperatures(...)`, normalizes `la` and `nyc`, and stores each
result under `city_LA` or `city_NYC`. Its `@Tools(["get_weather"])` handler
receives one or more matching calls, performs one local lookup for the batch, and
routes to `FooLogicStep` when both values are present. It returns a routed
`stay(...)` response for invalid or incomplete batches. The existing individual
`@Tool` handler remains available only when no matching group handler is
selected. The deterministic fixture lives beside the step in
[`city-temperature-service.ts`](../src/myflow/basic-flow/city-temperature-service.ts).

The current readiness check uses truthiness (`if (LA && NYC)`). If the backend
can return `0`, change this to explicit null/undefined checks so a valid
zero-degree temperature does not block progress.

### Deterministic logic steps

[`FooLogicStep`](../src/myflow/basic-flow/foo-logic.ts) and
[`GooLogicStep`](../src/myflow/basic-flow/goo-logic.ts) illustrate the smallest
non-LLM stage:

```ts
public async runLogic(): Promise<LogicResponseType> {
  return { step: GooLogicStep, state: { fooData: "fooValue" } };
}
```

For a logic response object, `state` is saved on the destination step after it
is activated. The example therefore puts `fooData` in `GooLogicStep` state;
the next logic step puts `gooData` in `FavoritesStep` state.

Use `LogicStep` for database lookups, calculations, authorization decisions,
and other operations that do not need model interpretation.

### Prompt files and response parsing

`FavoritesStep` loads `prompt/favorites.md` and `prompt/favorites.json` with
`Prompt.file`, injects the schema with `Prompt.replace`, then parses the
model's string result with `StringUtil.parseJson`. This is a legacy
response-driven structured-data pattern. For new code, prefer an explicit tool
schema when you need deterministic submission and validation.

### Structured output and parallel child work

`InContextStep.structOutputSchema()` returns a Zod object for a movie idea. Its
`onEnter()` calls `runSteps` with two requests, which executes both branches via
`Promise.all`, and saves serializable copies of the results. `NameStep` invokes
this step with `runStep`, so the child work completes inside the same outer
request before the flow moves to `DOBStep`.

### Session compatibility policy

`BasicFlow.onRestoreSessionDoc(...)` overrides the flow restore hook. The demo
currently delegates straight to `super`, preserving PicoFlow's default policy:
incompatible session documents return `null` and start a new session; a current
document is returned and persisted before restoration continues. PicoFlow does
not impose a framework-wide expiration policy.

```ts
protected async onRestoreSessionDoc(
  doc: SessionType,
): Promise<SessionType | null> {
  return super.onRestoreSessionDoc(doc);
}
```

Override this method when a flow needs an idle-time policy or an idempotent
in-place migration. Return the updated `doc` to continue the session, or `null`
when it is unsafe to restore. `isSessionCurrent(doc)` and
`sessionIdleMs(doc)` are available to help implement that policy.

## Models and memory

The flow default is `gpt-4o-mini`. `WeatherStep` overrides it with `gpt-4o`.
`InContextStep` has its own memory, `FavoritesStep` and `PresidentStep` are
isolated, and the core profile steps share `default`. A shared namespace lets a
later step see earlier conversation messages; an isolated namespace prevents
unrelated instructions and tool history from leaking into another role.

## HTTP usage

Start the application:

```sh
npm run start:dev
```

Start a normal session:

```sh
curl -i http://localhost:8000/ai/run \
  -H 'content-type: application/json' \
  -d '{"flowName":"BasicFlow","message":"Hi","config":{"myRunData":{"source":"guide"}}}'
```

Reuse the returned `CHAT_SESSION_ID` header on every later request. A typical
semantic path supplies LA/NYC, favorites, a non-placeholder full name, a date
of birth, and a valid US address.

## Tests

Run:

```sh
npm run test:basic-flow
```

[`basic-flow.scenario.json`](../test/basic-flow/basic-flow.scenario.json)
defines an eight-turn conversation. The end-to-end test boots the real NestJS
application with the configured OpenAI models, sends all eight turns in order,
checks required response terms, verifies the persisted `currentStep` after every
turn, and inspects final state. It requires `OPENAI_API_KEY` and `PICOFLOW_KEY`.

For a fast deterministic contract check without provider calls, run:

```sh
npm run test:basic-flow:contract
```

The contract variant uses a scripted model but still exercises the controller,
engine, tools, transitions, SQLite session store, nested steps, and the same
persisted-state assertions.

When extending the flow, add scenario turns for every new stay/go decision and
assert the owning step's durable state. For nested work, also inspect the
recorded sequence and child state so a fluent outer response cannot hide a
failed internal branch.

## Extension checklist

1. Register a new step before returning it from `go`, `onResponse`, or
   `runLogic`.
2. Decide whether it shares an existing memory namespace or needs isolation.
3. Put deterministic validation in code and tool argument shape in Zod.
4. Use transient state only for data needed inside the current invocation.
5. Keep nested tasks independent before placing them in `runSteps`.
6. Add model registration for every model override.
7. Test invalid input, resume behavior, termination, persistence, and the
   actual internal state—not only assistant wording.
