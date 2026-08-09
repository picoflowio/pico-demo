# InvoiceFlow developer guide

`InvoiceFlow` demonstrates a one-request multimodal workflow: the caller names
a bundled invoice asset, the current step asks the model to fetch it, uploads
and attaches the file through the provider adapter, captures structured data
with a tool, and returns the resulting object as an `application/json` HTTP
response.

For the framework-wide development sequence, complete `Flow` subclass contract,
one-shot and batch architecture, and session migration hooks, begin with the
[PicoFlow workflow developer guide](./picoflow-workflow-developer-guide.md).

This guide follows the active implementation, `ExtractInvoiceStep`.

For conversational workflows, see the
[BasicFlow](./basic-flow-developer-guide.md) or
[HotelFlow](./hotel-flow-developer-guide.md) guide.

See the [Step authoring contract](./step-authoring-contract.md) for the full
list of lifecycle hooks and helpers. InvoiceFlow specifically exercises
`getPrompt()`, `defineTool()`, `@Tool`, `onCrossing()`, model overrides,
provider-aware messages, state, direct output, and content types.

## Start here: authoring a one-shot extraction flow

The same PicoFlow contract applies to a document task: the `Flow` registers every
stage, one `Step` begins active, tools form the trusted application boundary,
and a direct response ends the HTTP request. What differs is the response content type
and the fact that the conversation is driven by server configuration and file
content rather than a long user dialogue.

### Define the flow and active extractor

[`InvoiceFlow`](../src/myflow/invoice-flow/invoice-flow.ts) registers one
extractor:

```ts
protected defineSteps(): Step[] {
  return [
      new ExtractInvoiceStep(this)
      .useMemory("invoice3")
      .useModel({
        provider: "google",
        name: "gemini-3.1-pro-preview",
        params: { temperature: 1.0 },
      }),
    new TerminateSessionStep(this)
      .useModel({ provider: "google", name: "gemini-2.5-pro" })
      .useMemory("temp"),
  ];
}
```

`ExtractInvoiceStep` is the active extractor. The flow-level
`gemini-2.0-flash` model is therefore overridden for normal extraction. Every
model name must be present in the engine's registry and have valid provider
credentials.

### Model the tool sequence explicitly

The extraction prompt requires this order:

```text
fetch_file(config.fileName)
  -> attach provider file to a new human message
  -> analyze the attachment
  -> capture_json({ ...invoice fields... })
  -> direct JSON response
```

Both tools have Zod schemas. Tool handlers, rather than the prompt, must enforce
which file may be read and what result shape is acceptable.

## Architecture at a glance

```text
POST /ai/run
  |  flowName=InvoiceFlow, config.fileName=data/ACME.png
  v
ExtractInvoiceStep
  |-- prompt tells model to call fetch_file
  |-- resolve local path
  |-- LLMFileManager.uploadFile(...)
  |-- append provider content part to HumanMessage
  |-- model reads attachment and calls capture_json
  |-- save extracted object in step state
  |-- emit direct JSON + application/json content type
  v
HTTP JSON response (session remains active)
```

The model/tool loop may take several internal turns, but the caller normally
makes only one HTTP request.

## Source map

| File | Responsibility |
| --- | --- |
| [`invoice-flow.ts`](../src/myflow/invoice-flow/invoice-flow.ts) | Extractor registration, model overrides, terminal step, and batch coordinator |
| [`extract-invoice3.ts`](../src/myflow/invoice-flow/extract-invoice3.ts) | Active provider-file upload, multimodal message, JSON capture, and response content type |
| [`invoice-prompt.ts`](../src/myflow/invoice-flow/prompt/invoice-prompt.ts) | Loads and combines extraction instructions and example output |
| [`invoice.md`](../src/myflow/invoice-flow/prompt/invoice.md) | Persona and required tool sequence |
| [`invoice-example.json`](../src/myflow/invoice-flow/prompt/invoice-example.json) | Example field set and output shape |
| [`data/`](../src/myflow/invoice-flow/data/) | Bundled demo invoices |
| [`invoice-flow.e2e-spec.ts`](../test/invoice-flow/invoice-flow.e2e-spec.ts) | Fixture, application registration, live extraction, response, session, and state assertions |

## 1. Build the prompt from trusted configuration

`ExtractInvoiceStep.getPrompt()` reads
`this.getContext<string>("config.fileName")` and injects it into the prompt.
`FlowEngine.run()` places the request's `config` object under that context
path. Context is appropriate for the initial server-side instruction; the
handler saves the resolved path to durable step state for diagnostics.

`ExtractInvoiceStep` does not currently reject a missing filename explicitly.
Add a presence check so missing configuration fails early with a clear message.

## 2. Upload and attach the file

The `fetch_file` handler joins the requested name to the flow directory, then:

```ts
const fileMgr = new LLMFileManager(this.getLLMType());
const result = await fileMgr.uploadFile(localPath);
const id = fileMgr.getFileId(result);

const userMsg = new HumanMessage({
  content: [
    { type: "text", text: `... file id ${id} ... call capture_json.` },
    result.contentPart,
  ],
  id: this.genMessageId(),
});

return go(ExtractInvoiceStep).withMessage(userMsg);
```

`getLLMType()` derives the provider family from the active model name. The
provider adapter returns a content part suitable for that model.

The current path resolution accepts a model-returned path segment, including
`..` traversal. Before using this pattern outside a controlled demo, resolve
the candidate path, verify that it remains beneath the intended `data`
directory, and preferably map opaque document IDs to server-owned paths rather
than accepting path strings from a tool call.

The handler also does not explicitly delete uploaded provider files. Confirm
the provider adapter's lifecycle guarantees or add cleanup in a `finally`
block/session finalizer when documents are sensitive or storage is billed.

## 3. Capture and return JSON

`capture_json` saves the tool argument to `ExtractInvoiceStep.state.json` and
returns a direct JSON response:

```ts
return direct(args?.json).withContentType(HttpContentType.Json);
```

The general HTTP controller sees the non-plain content type and sends
`result.message` directly as JSON rather than returning the normal PicoFlow
envelope. The `CHAT_SESSION_ID` header is still set, and the stored session
remains active on `ExtractInvoiceStep` for a later request.

The current tool schema uses `z.object({})`, which accepts an object but does
not enforce the invoice example's fields. For production extraction, define a
real `InvoiceSchema`, use it as the `json` property schema, and validate totals,
dates, currency, and line items in code before completing the session.

## Concurrent batch mode

`InvoiceFlow.spawnSteps()` uses `concurrentSteps` to start independent worker
sessions for `data/Evergreen.png` and `data/ACME.png` with a batch size of ten.
This mode runs when the outer request has `config._concurrent: true`.

Each item receives a separate `config.fileName`; results are logged by the
coordinator callback. This is orchestration across sessions, unlike multiple
tool calls inside one extraction session.

## HTTP usage

Start the application, then submit a bundled invoice:

```sh
curl -i http://localhost:8000/ai/run \
  -H 'content-type: application/json' \
  -d '{
    "flowName":"InvoiceFlow",
    "message":"Extract the configured invoice into JSON.",
    "config":{"fileName":"data/ACME.png"}
  }'
```

A successful response has `Content-Type: application/json`, the extracted
invoice object as its body, and a `CHAT_SESSION_ID` header. This demo reads
server-bundled files; it is not an arbitrary upload endpoint.

## Tests

Run:

```sh
npm run test:invoice-flow
```

The spec always checks the fixture, boots the application, and verifies that
`InvoiceFlow` is registered. With live Gemini credentials and `PICOFLOW_KEY`, it
extracts `ACME.png`, checks key invoice fields and line-item count, verifies the
JSON content type and session header, and asserts that persisted
`ExtractInvoiceStep.state.json` matches the HTTP body.

## Extension checklist

1. Accept a server-issued document ID rather than a model-controlled path.
2. Validate resolved paths against an allowlisted root before reading.
3. Replace `z.object({})` with a complete domain schema.
4. Add deterministic post-extraction checks and a recoverable correction path.
5. Define provider-file cleanup and retention policy.
6. Avoid logging invoice bodies when they may contain confidential data.
7. Test missing files, unsupported formats, malformed extraction, provider
   failure, cleanup, JSON content type, completion, and persisted state.
