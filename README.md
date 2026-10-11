# picoflow-demo

This NestJS/Fastify application demonstrates durable PicoFlow workflows and a
direct LangGraph comparison implementation. It includes conversational,
hotel-search, invoice-extraction, customer-support, home-insurance quote,
employee-benefits enrollment, and hotel LangGraph examples, together with their
tests and developer guides.

## Prerequisites

- Node.js 22.5 or newer
- npm and Yarn Classic (for the local library link)
- API credentials for the live scenarios you want to run

The application links the sibling `@picoflow/core` package declared in
[`package.json`](./package.json). Build it with `npm run build:picoflow` before
installing dependencies or rebuilding the application.

## Install and run

```sh
npm run build:picoflow
yarn install
npm run start:dev
```

The server listens on port `8000` and exposes:

- Swagger UI: <http://localhost:8000/api>
- Health check: <http://localhost:8000/healthcheck>
- PicoFlow flow names: `GET /ai/flows`
- Direct LangGraph graph names: `GET /ai-langgraph/graphs`

Create a local `.env` with the credentials for the providers used by your
flows. `AppModule` currently registers the OpenAI, Google, and Anthropic
PicoFlow adapters, plus the application-owned NVIDIA OpenAI-compatible adapter.
The relevant variables are `OPENAI_API_KEY`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `NVIDIA_API_KEY`, and `PICOFLOW_KEY`.

The flow test files use SQLite when run directly; `test:basic-flow` sets
`USE_ENV=1` so the configured Cosmos session store is exercised. The direct
hotel LangGraph implementation supports memory, SQLite, and MongoDB session
stores; MongoDB requires `MONGODB_URL`, `MONGODB_NAME`, and `MONGODB_COLLECTION`.

## API examples

Database clients are configured inline in `src/app.module.ts` through
`FlowEngine.create({ configManager: config, sessionClients: { mongodb, cosmos } })`.
Only the selected store's callback runs. The callbacks receive no arguments
and explicitly read their URL/endpoint and credentials from `ConfigService`;
PicoFlow handles connection setup, session persistence, and cleanup.
No separate persistence file is required.

MongoDB uses `MONGODB_URL`, `MONGODB_NAME`, and `MONGODB_COLLECTION`.
Customize its SDK callback for DocumentDB authentication or connection settings;
`MONGODB_TLS_CA_FILE` is optional. Cosmos uses `COSMODB_URL`, `COSMODB_ID`, and
`COSMODB_SESSION_ID`; its callback chooses `COSMODB_KEY`, explicit
`AZURE_TENANT_ID` / `COSMO_DB_CLIENT_ID` / `COSMO_DB_CLIENT_SECRET`, or
`DefaultAzureCredential`. Set `COSMOS_CREATE_IF_NOT_EXISTS=false` for existing
resources. For shared clients, put `ownsClients: false` inside `sessionClients`
and close the client in its owning provider. The demo closes dedicated clients
through `FlowEngine.close()` during application shutdown.

Run a PicoFlow flow and retain the `CHAT_SESSION_ID` response header for later
turns:

```sh
curl -i http://localhost:8000/ai/run \
  -H 'content-type: application/json' \
  -d '{"flowName":"BasicFlow","message":"Hello","config":{}}'
```

The same flow API provides `POST /ai/end` to delete a session. The direct
LangGraph comparison uses `POST /ai-langgraph/run` and the `SESSION_ID` header.

## Tests

```sh
# Run the standard flow suite
npm test

# Run individual scenarios
# BasicFlow with its original hosted-model declarations
npm run test:basic-flow

# BasicFlow with Qwen selected only inside the test script
npm run test:basic-flow-ollama

npm run test:hotel-flow
npm run test:invoice-flow
npm run test:support-flow
npm run test:home-insurance-flow
npm run test:employee-benefits-flow

# The BasicFlow script already exercises the session store selected by .env
USE_ENV=1 npm run test:basic-flow

# Run the direct LangGraph live evaluation (requires OPENAI_API_KEY)
npm run test:hotel-langgraph
```

`test:basic-flow` runs only the eight-turn live conversation and produces one
session document. The scripted parallel-join test is retained separately at
`test/regression/basic-flow-parallel.spec.ts`, outside the flow package commands.

`test:basic-flow-ollama` reuses BasicFlow's eight-turn scenario and changes model
selection only through scoped `node:test` mocks. It retains BasicFlow's prompts,
tools, memory spaces, structured movie generation, and nested parallel workers;
the original flow and tests keep their hosted-model declarations. The replay uses
`qwen3.5:9b` for every model-driven step, including WeatherStep and DOBStep.
The test's Ollama adapter selects native tool-based structured output, retaining
BasicFlow's original Zod schema and its 0–10 movie-rating validation.

Start Ollama and install the model with `ollama pull qwen3.5:9b`. Set
`OLLAMA_BASE_URL` if the server is not at `http://localhost:11434`. This test
requires `PICOFLOW_KEY` and the credentials for the configured session store.
It uses deterministic response/state assertions and no separate LLM grader.
The package command sets `USE_ENV=1 KEEP_SESSION=1`, preserving configured
persistence and the resulting session. The transcript and session snapshot are
saved under `test/.tmp/basic-flow-ollama/replay.latest.json` on success or failure.

The BasicFlow, HotelFlow, InvoiceFlow, SupportFlow, HomeInsuranceQuoteFlow, and
EmployeeBenefitsFlow
tests load credentials from `.env` and run their live scenarios when the
required credentials are available. The live BasicFlow, HotelFlow,
SupportFlow, 20-turn HomeInsuranceQuoteFlow, and 22-turn
EmployeeBenefitsFlow scenarios require
`OPENAI_API_KEY` and `PICOFLOW_KEY`; InvoiceFlow requires `GEMINI_API_KEY` and
`PICOFLOW_KEY`.
The LangGraph live evaluation requires `OPENAI_API_KEY` and does not silently skip.

For implementation details, start with the workflow overview in
[`docs/picoflow-workflow-developer-guide.md`](./docs/picoflow-workflow-developer-guide.md),
then see the [BasicFlow](./docs/basic-flow-developer-guide.md),
[HotelFlow](./docs/hotel-flow-developer-guide.md), and
[InvoiceFlow](./docs/invoice-flow-developer-guide.md) guides.
