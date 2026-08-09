# Step authoring contract

`Step` is the main PicoFlow customization boundary. A step can participate in
session start and restore, activation and deactivation, message crossing,
prompt construction, tool selection and dispatch, response validation,
structured output, nested execution, state persistence, memory management,
model selection, and completion.

Every step registered by a flow persists inside that flow's one session
document. A session document contains exactly one flow envelope; it does not
hold an array of flows. See
[one Flow per session document](./picoflow-workflow-developer-guide.md#8-one-flow-per-session-document)
and
[concurrent update safeguards](./picoflow-workflow-developer-guide.md#9-safeguarding-concurrent-updates-to-one-session-document)
for flow binding, local serialization, and revision-based compare-and-swap.

Start with the [PicoFlow workflow developer guide](./picoflow-workflow-developer-guide.md)
when creating and registering a new `Flow`, selecting a workflow shape, or
designing session-document migration. Use this reference when implementing the
individual steps inside that flow.

This reference covers the author-facing contract implemented by the current
[`Step` source](../../picoflow/src/picoflow/flow/step.ts). The flow tutorials show
how those hooks combine in real workflows:

- [BasicFlow](./basic-flow-developer-guide.md) — the broadest lifecycle,
  structured-output, nested, concurrent, and logic-step examples
- [HotelFlow](./hotel-flow-developer-guide.md) — `onEnter`, `onCrossing`,
  memory clearing, tools, and reversible stage transitions
- [InvoiceFlow](./invoice-flow-developer-guide.md) — multimodal messages,
  provider files, direct responses, and content types

## The short version

A conventional conversational step usually overrides only `getPrompt()`,
`defineTool()`, and one or more `@Tool` handlers:

```ts
export class CollectNameStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return "Ask for a full name, then call capture_name.";
  }

  public defineTool(): ToolType[] {
    return [{
      name: "capture_name",
      description: "Validate and save a full name",
      schema: z.object({ name: z.string().min(1) }),
    }];
  }

  @Tool
  protected async capture_name(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const name = args.name.trim();
    if (!name.includes(" ")) return stay("Please provide a full name.");
    this.saveState({ name });
    return go(NextStep);
  }
}
```

Add other hooks only when the stage has a clear need. In particular, avoid
overriding `run()` merely to observe a request: it owns the normal model loop,
so an override should call `super.run(message)` unless it intentionally
replaces that loop.

## Durable cursor and session shape

The flow envelope—not an individual step—owns the only persisted cursor:

```ts
flow: {
  name: "CustomerFlow",
  currentStep: "CollectNameStep", // null only when the flow has no next turn
  steps: [{ name: "CollectNameStep", state: {}, model?: { /* override */ } }],
  memory: {},
  context: {},
  sequence: [],
}
```

By default, the first step returned from `defineSteps()` supplies `currentStep`
for a new session. Override `initialStep()` only when that choice depends on
runtime context. `Flow.goto()` is the only transition API that changes it. In
contrast, `runStep()` and `runSteps()` use in-memory execution frames only;
their children may call `saveState()`, but they return control and transition
authority to their owner.

## Lifecycle order

### New session

```text
Flow creates step documents with `flow.currentStep` set from `initialStep()`
  -> initialStep.onStart()
       -> default onStart calls onEnter()
       -> default onStart calls onCrossing(null)
  -> initial message is placed in the step's memory
  -> Step.run(userMessage)
  -> getPrompt()
  -> obtain selected tools
  -> structOutputSchema()
  -> model call
       -> tool calls: @Tool handler -> stay/go -> continue or cross step
       -> no tool call: onResponse(...)
  -> persist `flow.currentStep`, step state, memory, model overrides, and session
```

### Restored session

```text
Flow restores persisted step documents and memory
  -> currentStep.onRestore()
  -> currentStep.run(userMessage)
  -> normal prompt/model/tool/response lifecycle
  -> persist again
```

`onStart()` is not called when an existing session is restored. `onRestore()`
is not called for a new session.

### Top-level step transition

```text
current handler returns go(TargetStep)
  -> currentStep.onExit()
  -> targetStep.onEnter()
  -> targetStep.onCrossing(message, currentStepName)
  -> targetStep.getPrompt()
  -> target model/tool loop
```

A direct AI message can end the current HTTP invocation without another target
model call. In that case the target is activated and `onEnter()` runs, but the
normal cross-step model path—and therefore `onCrossing()`—may not run.

### Nested step execution

`runStep(ChildStep, message?)` pushes an in-memory execution frame, calls the
child's `onEnter()`, runs it, calls the child's `onExit()` in `finally`, and
then restores the parent frame. `runSteps([...])` creates one independent
execution frame per child and joins their results with `Promise.all`.

Nested execution calls the child directly, so it does not automatically behave
like a top-level cross-step transition. Pass an explicit `userMessage` or
implement child setup in `onEnter()` when the child needs an initial command;
do not assume its `onCrossing()` will synthesize one.

## Override hooks

These methods are the practical `Step` subclass extension points.

| Hook | Called when | Default behavior | Override when |
| --- | --- | --- | --- |
| `getPrompt()` | Before every model invocation, including repeats in a tool loop | Returns destination `_prompt` state when one was attached with `.withPrompt(...)`, otherwise `null` | The step needs a system prompt assembled from role text, state, context, or prompt files |
| `defineTool()` | Flow bootstrap collects tool definitions from every step | Returns `[]` | The flow needs a globally registered model tool with a name, description, and Zod object schema |
| `useTool()` | Before a model call selects tools for this step | Returns `[]`; decorated handlers are added automatically | The step uses a tool definition declared by another step or by `Flow.defineTool()`, or it retains a legacy undecorated handler |
| `@Tool` handler | The model calls the decorated tool while this step is active | No default handler | The tool must validate domain input, call application code, save state, and return a transition |
| `onEnter()` | Initial start through default `onStart`, top-level activation, or nested activation | No operation | Setup is required each time the step becomes active, such as clearing memory or running prerequisite children |
| `onExit()` | A top-level transition deactivates the step or a nested scope closes | No operation | The step must release temporary resources or record exit behavior |
| `onRestore()` | An existing session restores this step as active | No operation | Runtime-only resources or caches must be rebuilt without repeating normal entry work |
| `onStart()` | A new session initializes the starting step | Calls `onEnter()` and then `onCrossing(null)` | The starting step needs custom bootstrap behavior or a custom initial message |
| `onCrossing(message, priorStep?)` | New-session start and normal execution crossing from a different top-level step | May create a `HumanMessageEx("Start")` when no incoming message exists; otherwise preserves the message | A stage must transform, replace, forward, or suppress the incoming message when roles change |
| `run(userMessage?)` | The active top-level step handles a request, or a parent invokes a nested step | Converts a nonempty string to `HumanMessageEx` and starts the shared model runner | Pre-model state must be prepared or the step intentionally owns a custom execution lifecycle |
| `checkResponse(result)` | After a nonempty model result and before accepting it | Returns `false` | A bad response should be rejected and retried; return `true` to request retry |
| `onResponse(result)` | The model returns without a tool call | Stringifies objects and otherwise returns the result unchanged | Free-form or structured output must be validated, saved, rewritten, or routed by returning another `Step` class |
| `structOutputSchema()` | Before the model call | Returns `null` | The provider should use structured output constrained by a schema |
| `isEnd()` | `Flow.run()` builds its `completed` flag | Checks whether the session status is `completed` | A specialized terminal step needs different completion reporting; most flows should use `TerminateSessionStep` or `sessionCompleted()` |

### Hooks for specialized base classes

`LogicStep` overrides `isLogic()` and requires:

```ts
public async runLogic(): Promise<LogicResponseType> {
  return { step: NextStep, state: { result: 42 } };
}
```

The runner activates `NextStep` and saves `state` on that destination. Use a
`LogicStep` for deterministic work that does not need an LLM.

`TerminateSessionStep` overrides `onEnter()` to mark the session completed,
`isEnd()` to return `true`, `onCrossing()` to create its closing input, and
`getPrompt()` to honor a prompt attached by the previous transition.

## Prompt contract

`getPrompt()` supplies the system message and is called again after every tool
response. It may safely read current step state, another step's state through
the flow, session context, or static prompt files.

If a transition uses `.withPrompt(...)`, PicoFlow saves that value as `_prompt`
on the destination. The base `getPrompt()` returns it. A subclass that wants to
support transition-supplied prompts must check the base value:

```ts
public getPrompt(): string {
  return super.getPrompt() ?? "The normal prompt for this step.";
}
```

Do not put security or final business validation only in prompt text. The
model can misunderstand a prompt; tool schemas and handler code form the
runtime boundary.

## Tool contract

### Define once per flow

`defineTool()` returns `ToolType[]`:

```ts
{
  name: "capture_name",
  description: "Validate and save a full name",
  schema: z.object({ name: z.string().min(1) }),
}
```

Definitions from all steps and `Flow.defineTool()` are composed into one
flow-wide registry. Tool names must therefore be unique across the entire
flow; duplicate definitions fail during bootstrap.

### Select and handle tools

The preferred pattern is `@Tool` when the method name matches the tool name,
or `@Tool("external_name")` for an alias:

```ts
@Tool("capture_name")
protected async saveName(args: Record<string, any>) {
  // ...
}
```

Decoration does two things: it exposes that registered tool to this step's
model call and registers the runtime handler. Decorated handlers are inherited,
so subclasses can reuse or override handlers as needed.

`useTool()` remains available to select a flow-wide tool by name. An
undecorated method with the same name can serve as the legacy handler. Prefer
`@Tool` because it keeps selection and dispatch together.

For a response containing multiple calls that can be processed together, add a
type-based group handler with `@Tools([...])`. The names describe tool types,
not call counts, so `@Tools(["get_weather"])` can receive one or many
`get_weather` calls. Matching is order-independent and preserves repeated calls
in the `ToolCall[]` passed to the handler.

A matching group handler shadows the individual `@Tool` handler in every case,
including a single call. If no group handler matches, individual handlers run
sequentially. A group handler must return a valid routing result such as
`go(...)`, `stay(...)`, or `direct(...)`; `null`, `undefined`, and unknown
results are errors and never trigger individual fallback. See the
[multi-tool handler guide](./multi-tool-handlers.md) for the complete contract
and the WeatherStep example.

### Return a semantic transition

A handler returns a step class, a registered step-name string, or the fluent
response from `go(...)`/`stay(...)`:

```ts
return go(ReviewStep)
  .withToolFeedback("Accepted")
  .withState({ recordId })
  .withPrompt("Review the accepted record.")
  .withMessage(message)
  .withContentType(HttpContentType.Json);
```

Builder effects apply after the target is activated:

| Builder | Effect |
| --- | --- |
| `withToolFeedback(text)` | Returns text to the model as the tool result |
| `withState(json)` | Saves the JSON on the destination step |
| `withPrompt(text)` | Saves `_prompt` on the destination step |
| `withMessage(message)` | Appends an existing LangChain message after the tool result |
| `withContentType(type)` | Sets the destination response content type |

`stay(feedback?)` is valid only inside a PicoFlow tool handler. It resolves the
currently executing step and returns `go(CurrentStep)` with feedback. Without
explicit feedback it uses the framework's standard validated-tool message.

## Response contract

There are three result paths:

1. A model tool call goes through the tool handler and transition machinery.
2. A normal model response goes through `onResponse()`.
3. A direct `AiMessageEx` returned with `.withMessage(...)` is sent to the
   caller without another model invocation.

`onResponse()` may return text to the caller or a `Step` constructor to
activate another stage and continue execution. When using
`structOutputSchema()`, treat `llmResult` as the provider-normalized structured
value and validate or serialize it deliberately.

`checkResponse()` has inverted retry semantics: `false` accepts the response;
`true` asks the retry loop to try again. Keep the predicate deterministic and
avoid state mutations because it may run more than once. At runtime the runner
passes the raw provider result (currently an `AIMessageChunk`); inspect its
content deliberately when implementing a custom gate.

## State and context helpers

| API | Purpose |
| --- | --- |
| `getState<T>(key?)` | Read this step's persistent state or a nested key |
| `saveState(json)` | Merge durable JSON into this step and update `_saveOn` |
| `removeState(key)` | Remove a durable key from this step |
| `getTransientState<T>(key?)` | Read this step's invocation-only transient state |
| `saveTransientState(json)` | Save state that is intentionally omitted from the persisted session document |
| `getContext<T>(key)` | Read flow context, normally initial session configuration under `config.*` |
| `flow.getStepState(StepClass, key?)` | Read another registered step's durable state |
| `flow.saveStepState(StepClass, json)` | Write another registered step's durable state |
| `flow.saveTransientStepState(StepClass, json)` | Pass non-persisted data to another registered step |

Flow context is initialized from the first request's `config` and persisted in
the flow document. When an existing session is restored, its stored context is
loaded; callers should not expect a new `config` object to reconfigure that
session. Keep domain values in the state of the step that owns them, and use
context for session-wide configuration. Transient state is useful for nested
work in the same invocation and is removed when the session is written.

## Memory and message helpers

| API | Purpose |
| --- | --- |
| `useMemory(namespace)` | Select this step's persisted conversation-history space |
| `getMemory()` | Access the selected history; initializes its system-message slot |
| `getLastMessage()` | Read the latest message in the selected namespace |
| `eraseMemory()` | Protected helper that empties the selected namespace |
| `genMessageId()` | Create a step-attributed ID for a custom LangChain message |
| `onCrossing(...)` | Rewrite the message when entering from another top-level step |

Steps sharing a namespace share model history. Separate namespaces isolate
roles and tool traces. Erasing history does not erase step state.

When constructing custom messages, use `HumanMessageEx`, `AiMessageEx`, or
`DirectMessage` when their PicoFlow metadata is needed; use `genMessageId()` for
raw LangChain messages so crossing and persistence can attribute them to the
correct step.

## Model and output helpers

| API | Purpose |
| --- | --- |
| `useModel({ provider, name, params })` | Override the flow's default model with application-owned provider parameters |
| `getModel()` / `getModelSelection()` | Inspect the resolved step configuration |
| `getLLMType()` | Map the current model name to Gemini, OpenAI, Anthropic, or unsupported for provider-file operations |
| `contentType` | Read or set the current execution step's HTTP content type |
| `.withContentType(...)` | Preferable transition-time way to set the destination content type |

Model parameters are associated with a model name. The runner rejects a
parameter override targeted at a different resolved model. Unsupported
temperature overrides are rejected during model validation; treat them as a
configuration error and choose a compatible model or remove the parameter.

## Nested execution and completion helpers

| API | Purpose |
| --- | --- |
| `runStep(StepClass, userMessage?)` | Execute one registered child inside an in-memory execution frame and return its model content |
| `runSteps([{ step, userMessage }, ...])` | Execute independent registered children concurrently and preserve result order |
| `sessionCompleted()` | Mark the current session document completed immediately |
| `isEnd()` | Report completion from session status; terminal steps may specialize it |

Only put independent operations in `runSteps()`. It rejects duplicate step
classes. Parallel children may save their own state, but cannot call `goto()`
or independently persist the session; return results to the owner, which
alone chooses the next durable cursor. Children sharing a memory namespace can
interleave history writes, so isolated namespaces are safer unless that is
intentional.

For normal user-facing completion, transition to `TerminateSessionStep`. Use
`sessionCompleted()` for specialized workers or coordinators that intentionally
finish without the terminal conversation step.

## Methods that are runtime plumbing

`Step` exposes additional public methods because the framework uses the same
class internally. Application steps should normally not override or call these
directly:

- execution-frame mechanics: `pushExecutionFrame` and the static execution
  scope helpers;
- persistence mechanics: `createDoc`, `readDoc`, and `writeDoc`;
- tool dispatch mechanics: `obtainTools`, `isToolAvailable`,
  `hasToolHandler`, and `invokeToolHandler`;
- model inheritance plumbing: `inheritModel`;
- identity/accessors used by the runner: `getName`, `getMemorySpace`, and model
  parameter target accessors.

`invokeTool(...)` exists on the current class but is not called by the default
runner; tool dispatch goes through `invokeToolHandler(...)`. Do not build new
customization around `invokeTool(...)`.

Similarly, override `isLogic()` only by extending `LogicStep`; directly
claiming that an ordinary `Step` is logic-backed bypasses the clearer
`runLogic()` contract.

## Complete step skeleton

This skeleton shows all normal hooks. A real step should implement only the
ones it needs.

```ts
export class CustomStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  protected async onEnter(): Promise<void> {}
  protected async onExit(): Promise<void> {}
  public async onRestore(): Promise<void> {}

  public async onStart(): Promise<MessageTypes | null> {
    return await super.onStart();
  }

  public onCrossing(
    message: MessageTypes | null | undefined,
    priorStep?: string,
  ): MessageTypes | null {
    return super.onCrossing(message, priorStep);
  }

  public getPrompt(): string {
    return super.getPrompt() ?? "Custom system prompt";
  }

  public defineTool(): ToolType[] {
    return [];
  }

  public useTool(): string[] {
    return [];
  }

  @Tool("tool_name")
  protected async handleTool(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    return stay();
  }

  public async run(message?: string): Promise<MessageContent | null> {
    // Prepare state here, then preserve the standard model lifecycle.
    return await super.run(message);
  }

  public checkResponse(result: string | object): boolean {
    return false; // true means retry
  }

  public async onResponse(
    result: string | object,
  ): Promise<string | StepClassType> {
    return await super.onResponse(result);
  }

  public structOutputSchema(): object | null {
    return null;
  }
}
```

## Review checklist

1. Is one step responsibility expressed clearly in `getPrompt()`?
2. Are tool names unique across the flow and arguments validated by Zod?
3. Does each `@Tool` handler make the domain decision in code and return an
   explicit transition?
4. Is `stay()` used only inside a tool handler?
5. Does destination state belong to the destination, and durable state to the
   step that owns it?
6. Do start, restore, entry, exit, and crossing hooks avoid duplicating work?
7. Does an overridden `run()` call `super.run()` unless replacing the entire
   model lifecycle is intentional?
8. Are shared memory namespaces deliberate, especially for parallel children?
9. Is completion explicit through `TerminateSessionStep` or
   `sessionCompleted()`?
10. Do tests cover invalid input, retries, transitions, restore, nested work,
    direct responses, content type, and persisted state?
