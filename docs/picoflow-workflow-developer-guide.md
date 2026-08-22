# PicoFlow workflow developer guide

This is the entry point for developing a PicoFlow workflow. It starts with the
`Flow` contract—creation, registration, models, sessions, shared tools, batch
coordination, and document migration—before introducing the `Step` contract.
Use it to choose an architecture, then follow the concrete flow guide closest
to the application you are building.

The central persistence invariant is:

> **One session document contains exactly one Flow.**

A flow can have many session documents—one for each conversation, request
workflow, or batch worker—but a single session document never contains several
flows. Its session ID is permanently bound to the registered flow name that
created it.

| Workflow shape | Start with |
| --- | --- |
| Minimal conversational flow | [BasicFlow](./basic-flow-developer-guide.md) |
| Multi-stage conversation with nested and concurrent work | [BasicFlow](./basic-flow-developer-guide.md) |
| Search, compare, return, and complete | [HotelFlow](./hotel-flow-developer-guide.md) |
| One-shot document or structured-output workflow | [InvoiceFlow](./invoice-flow-developer-guide.md) |
| Complete step lifecycle and customization API | [Step authoring contract](./step-authoring-contract.md) |

## 1. Add a Flow

A `Flow` is the durable workflow boundary. It owns the registered name,
default model, available steps and tools, memory container, session context,
execution sequence, batch coordination, and restore policy. Add and register
the flow before filling in detailed step behavior.

### Create the flow shell

Create a directory under `src/myflow/` and a `Flow` subclass:

```ts
// src/myflow/customer-flow/customer-flow.ts
import { Flow, Step, TerminateSessionStep } from "@picoflow/core";
import { CollectCustomerStep } from "./collect-customer-step.js";

export class CustomerFlow extends Flow {
  protected configModel() {
    return { provider: "openai", name: "gpt-4o-mini" } as const;
  }

  protected defineSteps(): Step[] {
    return [
      new CollectCustomerStep(this).useMemory("customer"),
      new TerminateSessionStep(this).useMemory("end"),
    ];
  }
}
```

The model returned by `configModel()` is required. The first step returned by
`defineSteps()` is the initial stage for a new session. Override `initialStep()`
when the entry point depends on runtime context. Every step that can be activated
by `go(...)`, `runStep(...)`, `runSteps(...)`, a logic response, or a terminal
transition must appear in `defineSteps()`.

All registered step state, memory namespaces, context, model settings, and the
execution sequence are persisted inside this flow's single envelope:

```text
Session document
├── id, revision, version, runStatus, expiry, tokens, logs
└── flow                         # exactly one—not flows[]
    ├── name                     # permanently bound to this session ID
    ├── model
    ├── context
    ├── memory
    ├── steps
    └── sequence
```

Use explicit `.js` extensions in local imports because this project builds as
ES modules.

### Register the flow

Import the class into the application's engine-registration location and add
it exactly once. This demo registers providers and flows in the Nest engine
factory in
[`app.module.ts`](../src/app.module.ts):

```ts
engine.registerFlows([
  CustomerFlow,
  HotelFlow,
]);
```

By default, the registered name is the class name, so callers send
`"flowName": "CustomerFlow"`. `registerFlows(...)` also accepts a map, but
each map key must equal the registered class's `static id`. To keep a public
name stable across a TypeScript class rename, override that static accessor on
the Flow class itself. Use `registerFlow(...)` as the single-flow convenience
wrapper; prefer the bulk form during application bootstrap because it validates
the complete set before registration.

Verify registration after the application starts:

```sh
curl http://localhost:8000/ai/flows
```

### Register every selected provider

PicoFlow resolves model selections through its model catalog and registered
provider adapters. The flow model, every `.useModel(...)`
override, and each memory-summary model must resolve through an
application-registered provider adapter. This demo registers PicoFlow's bundled
helpers plus an application-owned DeepSeek adapter in `AppModule`:

```ts
FlowEngine.create({
  providers: [
    ...ModelProvider.createBuiltinAdapters({
      openai: { apiKey: config.get("OPENAI_API_KEY") },
      google: { apiKey: config.get("GEMINI_API_KEY") },
    }),
    ModelProvider.createCustomAdapter({
      provider: "deepseek",
      runtimeProvider: "deepseek",
      config: { apiKey: config.get("DEEPSEEK_API_KEY") },
    }),
  ],
  flows: [CustomerFlow, HotelFlow],
});
```

The bundled helpers own connection setup and runtime construction, but do not
set model hyperparameters. Put `temperature`, reasoning controls, and other
model parameters in `configModel()` or `.useModel(...)`. A model ID must be
known to the catalog (or supplied through a custom provider adapter); adding a
cataloged model does not require changing the Flow source. Keep secrets in
environment configuration, not Flow, Step, or prompt source.

### Call the new flow

```sh
curl -i http://localhost:8000/ai/run \
  -H 'content-type: application/json' \
  -d '{
    "flowName":"CustomerFlow",
    "message":"Hi",
    "config":{"tenantId":"demo"}
  }'
```

The first response supplies a `CHAT_SESSION_ID` header and a matching session
field. Send that header on later turns. A session is permanently bound to the
flow that created it; start a new session to run another flow. Reusing the ID
with a different `flowName` fails with `SESSION_FLOW_MISMATCH` rather than
replacing or appending another flow.

## 2. The Flow subclass contract

The current [`Flow` implementation](../../picoflow/src/picoflow/flow/flow.ts)
provides these practical subclass hooks:

| Hook | Default | Override when |
| --- | --- | --- |
| `configModel()` | Abstract | Always; it declares the Flow provider, model, and provider-owned parameters |
| `constructor()` | Inherited | Only when deterministic setup beyond model configuration is needed; call `super()` |
| `init()` | No operation | Per-instance initialization is required before steps are collected and before a session is bootstrapped |
| `defineSteps()` | Registers only a terminal step | The flow declares its initial, conversational, internal, nested, and terminal stages |
| `defineTool()` | Returns `[]` | Multiple steps should use one flow-wide tool definition |
| `onRestoreSessionDoc(doc)` | Returns the document, or `null` | Stored sessions need compatibility checks, in-place migration, or reset |
| `sessionIdleMs(doc)` | Milliseconds since the document's last save | A Flow needs an idle-time restore policy |
| `spawnSteps()` | Returns an empty string | `config._concurrent` should coordinate independent worker sessions |
| `run(message)` | Dispatches to `spawnSteps()` for concurrent mode, otherwise runs `flow.currentStep` and builds the response envelope | The entire dispatch or response contract intentionally differs from the standard flow lifecycle |
| `isBatch()` | Returns `false` | A specialized flow needs an extra pre-run session checkpoint; it does not itself select `spawnSteps()` |

### `configModel()` and the constructor

`configModel()` declares the Flow model separately from Step composition. The
framework resolves it lazily after construction; the selected provider adapter
owns parameter validation and capability checks.

```ts
protected configModel() {
  return {
    provider: "openai",
    name: "gpt-4o",
    params: { temperature: 0.2 },
  } as const;
}

public constructor() {
  super();
  this.getMemory()
    .setSummaryModel({ provider: "openai", name: "gpt-4o" })
    .setSummaryConfig({ minMessages: 16, recentMessages: 8 })
    .enableSummary("conversation");
}
```

Only define a constructor when the Flow has other deterministic setup such as
memory configuration or cheap services. Do not perform request-specific work
there.

### `init()`

The factory calls `init()` after binding the registered flow name and adding
request context, but before collecting steps and binding the `FlowEngine` used
by `getFlowEngine()`. Use it for initialization that does not require the bound
engine or a loaded session. Avoid mutating external systems on every request.

### `defineSteps()`

`defineSteps()` constructs the step registry for every flow instance. The
runtime persists step state by class name, so class renames are session-schema
changes and require migration. Avoid conditional registration based on values
that can change between turns. Conditional *activation*, as used by
`BasicFlow`, is safe only when the same registered step set remains available.

By default, the first step returned from `defineSteps()` starts a new session.
Override `initialStep()` only when runtime context selects a different
registered step. The runtime writes that ID to `flow.currentStep`; no `Step`
document has an active flag.

### `defineTool()`

Use the flow-level hook to declare a tool schema shared by several steps:

```ts
public defineTool(): ToolType[] {
  return [{
    name: "lookup_customer",
    description: "Look up a customer by stable identifier",
    schema: z.object({ customerId: z.string().uuid() }),
  }];
}
```

Steps select shared definitions with `useTool()` or a matching `@Tool`
handler. Definitions from the flow and all steps enter one registry, and tool
names must be unique across that entire flow.

### `run()`

The default implementation is the application-level dispatch contract:

```text
config._concurrent true -> spawnSteps()
otherwise               -> currentStep.run(message)
then                     -> success/completed/message/session/contentType
```

Prefer step hooks and response builders over overriding `Flow.run()`. An
override assumes responsibility for current-step selection, completion,
content conversion, errors, and the `RunResponseType` contract.

## 3. Flow lifecycle

For every HTTP invocation, the engine creates a fresh flow object and runs:

```text
construct Flow
  -> bind registered name
  -> add request config as { config: ... } context
  -> init()
  -> defineSteps() / collect step instances
  -> bootstrap session
       -> inherit flow model where a step has no override
       -> load or create session document
       -> validate one-flow invariant
       -> onRestoreSessionDoc(...) for an eligible existing session
       -> new: startingStep.onStart()
       -> existing: restore memory/state/model + currentStep.onRestore()
       -> compose the flow-wide tool registry
  -> run(message)
  -> compact enabled memory spaces
  -> persist context, memory, step state, sequence, tokens, and status
```

The session layer serializes same-session requests within one engine instance.
The session-store contract also requires `revision`-based compare-and-swap.
Shared production stores enforce that check atomically; stale writes fail with
a session conflict rather than silently overwriting newer work. The complete
concurrency contract is described in Section 9.

## 4. Add Steps after the Flow shell

Once the flow is registered, implement each stage against the complete
[Step authoring contract](./step-authoring-contract.md). A conventional stage
needs only a prompt, tool definitions, and handlers:

```ts
export class CollectCustomerStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public getPrompt(): string {
    return "Collect the customer ID, then call lookup_customer.";
  }

  public defineTool(): ToolType[] {
    return [{
      name: "lookup_customer",
      description: "Validate a customer ID",
      schema: z.object({ customerId: z.string().uuid() }),
    }];
  }

  @Tool
  protected async lookup_customer(args: Record<string, any>) {
    const customer = await this.customerService.find(args.customerId);
    if (!customer) return stay("No customer was found; ask for another ID.");
    this.saveState({ customer });
    return go(TerminateSessionStep).withPrompt("Confirm the saved customer.");
  }
}
```

Keep the graph of legal transitions visible in flow and step code. Prompts
should describe conversational behavior; deterministic handlers should own
validation, side effects, state changes, and routing.

## 5. Choose the workflow shape

### Conversational and resumable

Use this shape when the workflow collects information or makes decisions over
several HTTP turns:

  - register the conversational steps and let `flow.currentStep` identify the current one;
- use `stay(...)` for incomplete or correctable input;
- use `go(NextStep)` for accepted transitions;
- persist domain data in the owning step's state;
- isolate memory by role, or deliberately share it for continuity;
- include `TerminateSessionStep` and route explicit end requests to it; and
  - reuse `CHAT_SESSION_ID` until the response or session document reports completion.

`BasicFlow` and `HotelFlow` demonstrate increasing levels of this pattern.

### One-shot or document workflow

Use this shape when one request contains all required configuration or data:

- choose the worker as the initial step through `defineSteps()` order or
  `initialStep()`;
- use `onCrossing()` when the model needs a synthetic starting message;
- expose tightly validated tools for server-owned resources;
- use direct messages when another model turn is unnecessary;
- set `HttpContentType.Json` for raw structured responses; and
- use a terminal step only when the session should be completed; direct output
  itself short-circuits the current model turn.

`InvoiceFlow` is normally a one-shot document flow even though its internal
model/tool loop may make several provider calls.

### Batch coordinator

The built-in coordinator path is selected by initial session config:

```json
{ "config": { "_concurrent": true } }
```

Override `spawnSteps()` and call `concurrentSteps(...)`:

```ts
protected async spawnSteps(): Promise<string> {
  const coordinator = this.requireCurrentStep();
  await this.concurrentSteps({
    items: this.workItems,
    batchSize: 5,
    onConfig: (item) => ({ documentId: item.id }),
    onBotResponse: (item, response) => {
      coordinator.saveState({
        [item.id]: response.data?.message,
      });
    },
  });

  coordinator.sessionCompleted();
  return `Processed ${this.workItems.length} documents.`;
}
```

`concurrentSteps()` divides items into sequential batches and runs items within
each batch with `Promise.all`. Each item is a self-HTTP request to `SELF_URL`,
with the same flow name and a fresh worker session configured by `onConfig`.
Set `SELF_URL` to this application's run endpoint, for example
`http://localhost:8000/ai/run`.

The current callback receives the HTTP client's response object, so the PicoFlow
body is under `response.data`. Do not return `_concurrent: true` from
`onConfig`, or a worker will recursively start another coordinator.

The coordinator must decide and record its own completion. `concurrentSteps()`
does not automatically mark the outer session completed, aggregate failures,
or roll back successful workers. Design idempotency, retry, result storage,
partial-failure policy, concurrency limits, and observability explicitly.

`BasicFlow.spawnSteps()` demonstrates a completing coordinator. InvoiceFlow's
`spawnSteps()` demonstrates document fan-out but currently does not mark its
outer coordinator session complete.

### Nested or parallel specialists

Use `Step.runStep()` for one internal child and `Step.runSteps()` for
independent children inside the current request. This is not batch mode:
nested children share the outer session and return control to their parent,
while `concurrentSteps()` creates separate sessions through self-HTTP calls.

## 6. Flow-owned data and helpers

| Concern | Flow API | Guidance |
| --- | --- | --- |
| Session configuration | `getContext`, `addContext`, `setContext` | Initial request `config` is persisted as flow context; restored sessions keep stored context |
| Step state | `getStepState`, `saveStepState`, `saveTransientStepState` | Keep durable domain values with their owning step; transient values disappear on persistence |
| Memory | `getMemory()` / `getMemory(namespace)` | Configure summary policy on the container; steps select namespaces with `useMemory` |
| Models | `configModel`, `getModel`, `getModelSelection` | Flow defaults are inherited by steps; configure per-step overrides with the Step API `.useModel(...)` |
| Session access | `getSessionId`, `getSessionDoc` | Use sparingly for migration, coordinator state, logging, or diagnostics |
| Steps | `getStep`, `requireStep`, `getCurrentStep`, `requireCurrentStep`, `getExecutingStep`, `requireExecutingStep` | Use current-step accessors for the durable cursor and executing-step accessors inside nested execution |
| Tools | `getTool`, `requireTool` | Normally selected and dispatched through step decorators rather than called directly |

Context is persisted session-wide. A new `config` sent with an existing
session does not replace the stored context during restore. Use a new session
for immutable configuration changes, or implement an explicit, validated
state-changing step.

## 7. Session document restore hooks

The protected hook is the compatibility boundary for a stored, running
session:

```ts
protected async onRestoreSessionDoc(
  sessionDoc: SessionType,
): Promise<SessionType | null> {
  if (this.sessionIdleMs(sessionDoc) >= 30 * 60_000) return null;
  if (this.isSessionCurrent(sessionDoc)) return sessionDoc;

  // Mutate an older document in place when it is safe to migrate.
  if (sessionDoc.version < 2) {
    sessionDoc.version = 2;
    return sessionDoc;
  }

  return null; // incompatible or newer schema: start a fresh session
}
```

It receives the mutable document after the store has loaded it and after the
runtime has verified that it belongs to this flow and satisfies the current
one-flow envelope invariant. It runs before step state, memory, model settings,
context, and `flow.currentStep` are read into the new flow instance.

### When the hook runs

The hook runs only when all of these are true:

- the supplied session ID exists in the configured store;
- `runStatus` is neither `completed` nor `aborted`;
- the stored flow name matches the requested registered flow name; and
- the document passes the current one-flow structural invariant.

Missing, completed, or aborted sessions are replaced by a new session before
the hook. A Flow decides whether an existing running document is too old to
restore. A flow-name mismatch or malformed flow envelope fails before the hook,
so this hook cannot repair those cases.

Returning the document continues restoration. Returning `null` creates a fresh
session and returns a new session ID; it does not delete the old document. A
returned document is persisted before restoration continues, so migration writes
participate in compare-and-swap.

### Versioned in-place migration

The runtime writes the current framework `K.sessionDocVersion` on every normal
save. Use `sessionDoc.version` to make migrations ordered and idempotent:

```ts
import {
  K,
  SessionType,
} from "@picoflow/core";

protected async onRestoreSessionDoc(
  doc: SessionType,
): Promise<SessionType | null> {
  if (doc.version === K.sessionDocVersion) return doc;
  if (doc.version > K.sessionDocVersion) return null;

  if (doc.version < 2) {
    const oldStep = doc.flow.steps.find(
      (step) => step.name === "CustomerNameStep",
    );

    if (oldStep) {
      const oldState = oldStep.state as Record<string, unknown>;
      oldStep.name = "CollectCustomerStep";
      oldStep.state = {
        customer: {
          displayName: oldState["name"] ?? null,
        },
      };
    }

    if (doc.flow.currentStep === "CustomerNameStep") {
      doc.flow.currentStep = "CollectCustomerStep";
    }

    for (const entry of doc.flow.sequence) {
      if (typeof entry !== "string" && entry.stepName === "CustomerNameStep") {
        entry.stepName = "CollectCustomerStep";
      }
    }

    const oldMemory = doc.flow.memory["customer-name"];
    if (oldMemory) {
      doc.flow.memory["customer"] = oldMemory;
      delete doc.flow.memory["customer-name"];
    }

    doc.version = 2;
  }

  return doc;
}
```

A step rename can affect the step document name, `flow.currentStep`, sequence
entries, memory namespace, cross-step state references,
and application code that searches sessions by name. Migrate all affected
locations together.

Do not silently accept a document whose version is newer than the running
code. A later normal save would stamp it with the older runtime version and
could destroy fields this code does not understand. Reject it explicitly or
reset according to product policy.

The current bootstrap normalizes legacy string sequence entries after the
migration hook. If supporting such documents, handle both strings and
`{ level, stepName }` entries or leave string entries unchanged for the runtime
normalizer.

### Reset incompatible sessions

Return `null` when preserving the conversation would be misleading or unsafe:

```ts
protected async onRestoreSessionDoc(
  doc: SessionType,
): Promise<SessionType | null> {
  if (doc.version < MIN_SUPPORTED_VERSION) return null;
  return doc;
}
```

Tell API consumers that the returned session ID may change after reset. If the
user needs an explanation, store a reset reason in logs/metrics or begin the
new flow with an appropriate message.

### Migration rules

1. Make every migration idempotent; retries must not duplicate or corrupt data.
2. Mutate only the supplied document and return it when it can be restored.
3. Preserve `id`, `revision`, flow name, and required envelope fields.
4. Keep `flow.currentStep` null or registered by the current `defineSteps()`.
5. Migrate state, memory namespaces, model configuration, context, currentStep, and
   sequence together when a change crosses those boundaries.
6. Do not assume arbitrary dates inside user state are hydrated as `Date`
   objects; stores deliberately hydrate session metadata only.
7. Let compare-and-swap conflicts surface. Reloading and retrying is safer than
   overwriting another request's migration.
8. Test migration from every supported historical version, repeated migration,
   reset behavior, returned session IDs, and the first resumed user turn.

The active runtime hook is `onRestoreSessionDoc(...)`. There is no separate
three-decision migration contract: return the document for both unchanged and
migrated sessions, and `null` to reset.

## 8. One Flow per session document

The singular flow envelope is enforced at every session boundary:

- session creation writes `sessionDoc.flow`, never a collection of flows;
- loading validates that the envelope exists and has a nonempty flow name;
- the requested registered name must equal `sessionDoc.flow.name`;
- saves preserve the same flow name; stores reject attempts to change it;
- every step in the workflow reads and writes the same flow envelope; and
- nested steps share that document, while batch workers receive independent
  session documents containing their own instance of the same registered flow.

This means a session ID is a cursor for one workflow, not a container for a
user's activity across unrelated workflows. If one user starts `HotelFlow` and
`InvoiceFlow`, the application must keep two session IDs.

It also means flow naming is part of the persisted schema. If a public flow
name changes, existing sessions cannot reach `onRestoreSessionDoc()` under the
new name because mismatch validation happens first. Keep the registered name
stable; override the Flow class's static `id` accessor if a TypeScript class
rename must not change the public name.

Do not directly copy step state between session documents to “switch” flows.
Use an application-level handoff: validate the source result, start a new
session for the destination flow, and pass only an intentional input contract.

## 9. Safeguarding concurrent updates to one session document

PicoFlow uses two layers of concurrency control because either layer alone is
insufficient in every deployment.

### Layer 1: serialize a complete run inside one engine

`FlowEngine.run()` wraps flow creation, session load, restore/migration, model
and tool execution, and final save in:

```ts
flowSession.withSessionLock(sessionId, async () => {
  // load -> restore/migrate -> run -> save
});
```

`SessionMutex` maintains a FIFO promise chain per session ID. Two requests for
the same ID in one `FlowEngine` execute one after another; requests for
different IDs remain concurrent. `deleteSession()` uses the same lock so a
local delete cannot race a local run.

This is a process- and engine-instance-local lock. It does not coordinate a
second server process, another `FlowEngine` instance, or a direct store writer.
Requests without a session ID do not need this lock because each creates a new
random session ID.

### Layer 2: optimistic compare-and-swap in the store

Every session document has an integer `revision`:

```text
load document at revision 7
  -> run and mutate the private loaded copy
  -> save(document, expectedRevision=7)
       -> success: atomically write revision 8
       -> stale/missing: throw SessionConflictError
```

Only one writer can win from a given revision. `FlowSession.save()` updates the
in-memory document to the returned revision after every successful checkpoint,
including an immediate migration save, so later saves in the same run use the
current compare-and-swap token.

The stores implement the contract as follows:

| Store | Concurrent-write safeguard | Deployment scope |
| --- | --- | --- |
| Memory | Checks the current in-memory revision before replacing a cloned document | One process only; intended for examples and tests |
| SQLite | Atomic conditional `UPDATE ... WHERE id = ? AND revision = ?` | Multiple connections/processes sharing the SQLite database |
| MongoDB | Atomic update filter containing `_id`, flow name, and expected revision | Distributed application instances sharing MongoDB |
| Cosmos DB | Expected revision plus `_etag` `IfMatch` precondition | Distributed application instances sharing Cosmos DB |

For horizontally scaled deployments, use SQLite where its shared-filesystem
constraints are appropriate, or MongoDB/Cosmos DB. Do not rely on the Memory
store to coordinate writers in separate processes.

### Conflict behavior

A stale save or revision-checked delete throws `SessionConflictError` with code
`SESSION_CONFLICT` and `statusCode: 409` at the session layer. The standard
`FlowEngine.run()` response flattens failures into `RunResponseType`, so the
typed code and status are not preserved; the demo controller therefore maps
unsuccessful results to HTTP 400. If an API needs a precise 409 response, it
must catch the typed error before that flattening boundary or use a dedicated
error-aware adapter. The engine deliberately does not mark the stored session
aborted or overwrite it with the losing request's error—the winning document
must remain untouched.

There is no automatic replay of the complete flow run. Blind replay is unsafe
because the first attempt may already have called an LLM, sent a message,
uploaded a file, charged a card, or changed another system before losing the
session save.

Handle a conflict by:

1. returning a retryable conflict to the caller;
2. reloading the latest session state;
3. deciding whether the original user command is still valid; and
4. retrying only through an idempotent application path.

Use stable operation IDs or idempotency keys for tool side effects. For
high-value operations, record intent in the domain database and use a
transactional/outbox pattern. Session compare-and-swap protects the session
document; it cannot roll back an external side effect.

If the application cannot tolerate duplicate cross-process execution at all,
add a distributed lock, queue partition, or actor keyed by session ID around
the complete run. Keep revision compare-and-swap as the final write guard even
when such coordination is present.

### Application rules

1. Always mutate session state through `FlowEngine` or the `SessionStore`
   contract; do not bypass revision checks.
2. Never catch `SessionConflictError` and force-write the stale document.
3. Prefer client-side serialization of turns for the same session even though
   the server is protected; it avoids unnecessary model calls and conflicts.
4. Make tool side effects idempotent before allowing a request to be retried.
5. Keep `onRestoreSessionDoc()` migrations idempotent because their immediate
   save also participates in compare-and-swap.
6. Pass the current revision to deletes that must not race an update.
7. Run the session-store conformance suite for every custom store; it verifies
   that two concurrent saves from one revision have exactly one winner.

## 10. Persistence and session stores

Memory storage is the default and is process-local. Set `SESSION_STORE` to
`SQLITE`, `MONGO`, or `COSMO`/`COSMOS` for durable sessions. SQLite is the
recommended local durable store. Every store implements load, create,
compare-and-swap save, delete, and close.

The document contains:

- session identity, revision, timestamps, expiry, version, and run status;
- exactly one flow envelope with name, model, context, memory, steps,
  and execution sequence;
- token accounting; and
- structured log, error, warning, debug, and verbose entries.

Completed and aborted sessions do not resume through the normal run path.
`TerminateSessionStep` marks a workflow completed while retaining its session
document. `FlowEngine.deleteSession(sessionId)` permanently deletes the
document with the same local lock and revision check used for updates.

The demo's legacy `POST /ai/end` endpoint now calls `deleteSession()`. Endpoint
naming can be migrated separately to an HTTP `DELETE` route without confusing
workflow completion with data deletion. `FlowEngine.endChat()` remains only as
a deprecated compatibility delegate.

## 11. Error handling and completion

Unhandled flow errors produce `success: false`, mark an available session
aborted, and attempt to persist the error. Session conflicts, flow mismatch,
and invariant errors are returned without rewriting the conflicted document.

For conversational and one-shot flows, complete through
`TerminateSessionStep`. A custom worker or batch coordinator may call
`sessionCompleted()` on its current step. Returning a string from `spawnSteps()`
alone does not complete the session.

Use `deleteSession()` only when the stored record itself should be permanently
removed.

Use direct JSON responses only when the HTTP adapter understands the selected
`HttpContentType`; the demo controller sends non-plain `result.message`
directly with that content type.

## 12. Testing a new Flow

Test the workflow at four levels:

1. **Registration:** the application boots and `GET /ai/flows` contains the
   public flow name.
2. **Step contracts:** tool schemas, decorated handlers, validation, and every
   `stay`/`go` decision behave deterministically.
3. **End-to-end session:** the real HTTP adapter maintains the same session ID,
   resumes the correct current step, and returns the correct completion and
   content type.
4. **Persistence and migration:** final step state, context, memory ownership,
   sequence, status, version upgrades, reset IDs, and conflict behavior are
   correct.

Live model tests should be paired with deterministic contract assertions so a
fluent response cannot hide missing state or a wrong transition. The existing
[`BasicFlow`](../test/basic-flow/basic-flow.e2e-spec.ts),
[`HotelFlow`](../test/hotel-flow/hotel-flow.e2e-spec.ts), and
[`InvoiceFlow`](../test/invoice-flow/invoice-flow.e2e-spec.ts) specs provide
starting patterns.

## New-flow checklist

1. Create the `Flow` class and choose a stable registered name.
2. Select the Flow and Step models and register their provider adapters during application bootstrap.
3. Register a stable ordered set of steps; implement `initialStep()` only for
   context-dependent initial routing.
4. Choose conversational, one-shot, batch, or nested execution deliberately.
5. Define state ownership, session context, and memory namespaces before
   prompts.
6. Implement steps using the [Step contract](./step-authoring-contract.md).
7. Define legal transitions and explicit completion.
8. Add `onRestoreSessionDoc()` before shipping a session-schema change.
9. Configure the session store, each Flow's restore policy, same-session
   concurrency policy, and `SELF_URL` when batch mode is used.
10. Make external tool effects idempotent and test registration, invalid input,
    resume, concurrent conflicts, completion, persistence, migration, errors,
    and content type.
