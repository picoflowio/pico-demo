# picoflow-demo

This NestJS and Fastify application contains the examples, controllers, MCP
tools, and end-to-end flow scenarios that were separated from the `picoflow`
library. It consumes the local debug package at
`../picoflow-ws/picoflow/npmlib/staging/lib` during development.

Before running the demo, build the local library package:

```sh
cd ../picoflow-ws/picoflow
npm run build:locallib

cd ../../picoflow-demo
npm install
npm run start:dev
```

Set the flow provider and session environment variables in a local `.env`.

## Model registration

PicoFlow does not provide a default model catalog. This application registers
PicoFlow's OpenAI, Google, Anthropic, Kimi, and Ollama helpers plus its own
DeepSeek adapter in [`src/app.module.ts`](./src/app.module.ts). That module is
the application-bootstrap contract when adding a provider. Flow and Step source
select dynamic `{ provider, name, params }` values; it does not register
credentials or supply hidden temperature/retry defaults.

## Flow tests

```sh
npm run test:basic-flow
npm run test:hotel-flow
npm run test:invoice-flow
```

`test:basic-flow` runs the full turn-by-turn conversation against the configured
OpenAI models. Use `npm run test:basic-flow:contract` for the fast deterministic
version that exercises the same transitions and SQLite assertions with a
scripted model. Tests requiring provider access run when their API keys and
`PICOFLOW_KEY` are available; otherwise the live scenario is reported as skipped.
