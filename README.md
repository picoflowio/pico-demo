# picoflow-demo

This NestJS/Fastify application demonstrates durable PicoFlow workflows and a
direct LangGraph comparison implementation. It includes conversational,
hotel-search, invoice-extraction, customer-support, home-insurance quote, and
hotel LangGraph examples, together with their tests and developer guides.

## Prerequisites

- Node.js 22.5 or newer
- npm
- API credentials for the live scenarios you want to run

The application uses the published `@picoflow/core` dependency declared in
[`package.json`](./package.json). If you are developing the sibling `picoflow`
library as well, build its local library from `../picoflow` with
`npm run build:picoflow` before rebuilding this application.

## Install and run

```sh
npm install
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

SQLite is the default session store for the flow tests. The direct hotel
LangGraph implementation supports memory, SQLite, and MongoDB session stores;
MongoDB requires `MONGODB_URL`, `MONGODB_NAME`, and `MONGODB_COLLECTION`.

## API examples

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
npm run test:basic-flow
npm run test:hotel-flow
npm run test:invoice-flow
npm run test:support-flow
npm run test:home-insurance-flow

# Run the direct LangGraph live evaluation (requires OPENAI_API_KEY)
npm run test:hotel-langgraph
```

The BasicFlow, HotelFlow, InvoiceFlow, SupportFlow, and HomeInsuranceQuoteFlow
tests use deterministic fixtures or fall back to a skipped live scenario when
the required credentials are missing. The live BasicFlow, HotelFlow,
SupportFlow, and 20-turn HomeInsuranceQuoteFlow scenarios require
`OPENAI_API_KEY` and `PICOFLOW_KEY`; InvoiceFlow requires `GEMINI_API_KEY` and
`PICOFLOW_KEY`. Set `RUN_LIVE_HOME_INSURANCE_FLOW_TEST=0` to run only the
deterministic rating checks. The LangGraph live evaluation requires
`OPENAI_API_KEY` and does not silently skip.

For implementation details, start with the workflow overview in
[`docs/picoflow-workflow-developer-guide.md`](./docs/picoflow-workflow-developer-guide.md),
then see the [BasicFlow](./docs/basic-flow-developer-guide.md),
[HotelFlow](./docs/hotel-flow-developer-guide.md), and
[InvoiceFlow](./docs/invoice-flow-developer-guide.md) guides.
