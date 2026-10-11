import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  FlowEngine,
  ModelProvider,
  PicoModelCatalog,
  type FlowType,
  type LlmCallPolicy,
  type ModelSelection,
  type Step,
} from '@picoflow/core';
import type { ZodType } from 'zod';
import { AppModule } from '../../src/app.module.js';
import { BasicFlow } from '../../src/myflow/basic-flow/basic-flow.js';
import { InContextStep } from '../../src/myflow/basic-flow/incontext-step.js';

const tag = 'qwen3.5:9b';
const modelId = `ollama:${tag}`;
const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const useEnvironment = process.env.USE_ENV === '1';
const keepSession = process.env.KEEP_SESSION === '1';
const artifactPath = resolve('test/.tmp/basic-flow-ollama/replay.latest.json');

type ScenarioTurn = {
  label: string;
  input: string;
  expectedResponse: string;
  expectedActiveStep: string;
  responseMustInclude: string[];
  completed: boolean;
};
// Reuse BasicFlow's own journey: John Doe is rejected, John Wick is accepted.
// It also has structured movie output and a nested ConcurStep fork/join tree.
const scenario = JSON.parse(readFileSync(
  new URL('../basic-flow/basic-flow.scenario.json', import.meta.url), 'utf8',
)) as { flowName: string; turns: ScenarioTurn[] };
assert.equal(scenario.flowName, 'BasicFlow');
assert.equal(scenario.turns.length, 8);

if (!useEnvironment) {
  process.env.SESSION_STORE = 'SQLITE';
  process.env.SQLITE_PATH = resolve('test/.tmp/basic-flow-ollama/session.sqlite');
}
if ((process.env.SESSION_STORE || '').toUpperCase() === 'SQLITE') {
  process.env.SQLITE_PATH ??= resolve('test/.tmp/basic-flow-ollama/session.sqlite');
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}

type RunBody = { success: boolean; completed: boolean; message: string; session?: string };
type RecordedTurn = {
  turn: number;
  label: string;
  user: string;
  httpStatus: number;
  response: RunBody;
  currentStep?: string;
};

// Only the test widens these protected methods so node:test can install mocks.
type BasicFlowTestHooks = {
  configModel(): ModelSelection;
  configLlmCallPolicy(): LlmCallPolicy;
  defineSteps(): Step[];
};

test('replays BasicFlow with local Qwen, its own recovery rules, structured output, and nested parallel steps', {
  timeout: 900_000,
}, async (t) => {
  const localModel = PicoModelCatalog.ollama(tag, {
    temperature: 0.2,
    maxOutputTokens: 2048,
    numCtx: 8192,
    think: false,
  }, { retryAttempts: 3 });
  const hooks = BasicFlow.prototype as unknown as BasicFlowTestHooks;
  const originalDefineSteps = hooks.defineSteps;
  t.mock.method(hooks, 'configModel', () => localModel);
  t.mock.method(hooks, 'configLlmCallPolicy', () => ({ timeoutMs: 120_000 }));
  t.mock.method(hooks, 'defineSteps', function (this: BasicFlow) {
    // Keep the production step instances, memories, tools, prompts, and routing.
    // Replace selections on every step, including WeatherStep/DOBStep overrides
    // and all nested workers. node:test restores the hooks after this test.
    return originalDefineSteps.call(this).map(step => step.useModel(localModel));
  });

  let app: NestFastifyApplication | undefined;
  let sessionId: string | undefined;
  let structuredCalls = 0;
  const structuredAttempts: Record<string, unknown>[] = [];
  const transcript: RecordedTurn[] = [];
  const report: Record<string, unknown> = {
    model: modelId, ollamaBaseUrl: baseUrl, structuredOutputMethod: 'functionCalling',
    sessionStore: process.env.SESSION_STORE || 'MEMORY',
    sessionId: null, keepSession, startedAt: new Date().toISOString(),
    passed: false, transcript, structuredAttempts,
  };

  try {
    assert(process.env.PICOFLOW_KEY?.trim(), 'PICOFLOW_KEY is required to run BasicFlow.');
    const tagsResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(tagsResponse.status, 200, 'Ollama must be running at OLLAMA_BASE_URL.');
    const tags = await tagsResponse.json() as { models: { name: string }[] };
    assert(tags.models.some(model => model.name === tag), `Install the local model first: ollama pull ${tag}`);

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const engine = app.get(FlowEngine);
    // This endpoint override belongs to this test's engine, retaining AppModule's
    // configured session clients and all other providers.
    const adapter = ModelProvider.createOllamaAdapter({ baseUrl });
    engine.registerProvider({
      ...adapter,
      resolve(selection) {
        const runtime = adapter.resolve(selection);
        return {
          ...runtime,
          createInstance() {
            return new Proxy(runtime.createInstance(), {
              get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver);
                if (property !== 'withStructuredOutput') return value;
                assert.equal(typeof value, 'function');
                // Qwen's native JSON-schema mode interpreted the teen movie's
                // rating as age 13. Tool mode exposes the same field descriptions
                // to the model and still uses the original Zod output validator.
                return (schema: unknown, options?: Record<string, unknown>) => {
                  structuredCalls++;
                  const runnable = value.call(target, schema, {
                    ...options, method: 'functionCalling', includeRaw: true,
                  });
                  return {
                    async invoke(input: unknown, callOptions?: Record<string, unknown>) {
                      const output = await runnable.invoke(input, callOptions);
                      // Keep the raw answer so a missing output tool can be
                      // distinguished from invalid tool arguments after a run.
                      structuredAttempts.push({
                        content: output.raw?.content,
                        toolCalls: output.raw?.tool_calls ?? [],
                        parsed: output.parsed ?? null,
                      });
                      if (output.parsed === null) {
                        throw new Error('Ollama structured output failed schema validation; see the replay artifact for the raw answer.');
                      }
                      return output.parsed;
                    },
                  };
                };
              },
            });
          },
        };
      },
    }, true);
    console.log(`Model: ${modelId}; endpoint: ${baseUrl}`);
    console.log(`Session retention: ${keepSession ? 'preserved' : 'deleted after replay'}; store: ${report.sessionStore}`);

    for (const [index, turn] of scenario.turns.entries()) {
      console.log(`\n[Turn ${index + 1}] ${turn.label}; User: ${turn.input}`);
      const response = await app.inject({
        method: 'POST', url: '/ai/run', headers: sessionId ? { CHAT_SESSION_ID: sessionId } : {},
        payload: {
          flowName: 'BasicFlow', message: turn.input,
          ...(index === 0 ? { config: { myRunData: { source: 'basic-flow-ollama-test' } } } : {}),
        },
      });
      const body = response.json<RunBody>();
      const recorded: RecordedTurn = { turn: index + 1, label: turn.label, user: turn.input, httpStatus: response.statusCode, response: body };
      transcript.push(recorded);
      console.log(`[Turn ${index + 1}] Assistant: ${body.message}`);
      assert.equal(response.statusCode, 200, JSON.stringify(body));
      assert.equal(body.success, true, JSON.stringify(body));
      assert.equal(body.completed, turn.completed, turn.label);
      assert(body.session, 'BasicFlow must return its server-assigned session ID.');
      if (sessionId) assert.equal(body.session, sessionId, 'Session continuity must be preserved.');
      else {
        sessionId = body.session;
        report.sessionId = sessionId;
        console.log(`Session: ${sessionId}`);
      }
      assert.equal(response.headers.chat_session_id, sessionId);
      assert(body.message?.trim(), `${turn.label}: expected a nonempty assistant response`);
      for (const text of turn.responseMustInclude) {
        assert(body.message.toLowerCase().includes(text.toLowerCase()),
          `${turn.label}: response must include ${JSON.stringify(text)}. ${turn.expectedResponse}\nActual: ${body.message}`);
      }

      const session = await engine.getFlowSession().fetchAll(sessionId);
      assert(session?.flow);
      const flow = session.flow;
      recorded.currentStep = flow.currentStep;
      assert.equal(flow.name, 'BasicFlow');
      assert.equal(flow.currentStep, turn.expectedActiveStep, turn.label);
      assert.equal(session.runStatus, turn.completed ? 'completed' : 'running');
      assert.deepEqual(flow.model, { provider: 'ollama', name: tag, params: localModel.params, retryAttempts: 3 });
      for (const step of flow.steps) {
        assert(step.model === undefined || (step.model.provider === 'ollama' && step.model.name === tag),
          `${step.name} must use Qwen, including nested workers.`);
      }
      assert.deepEqual(session.error, [], `Turn ${index + 1}: unexpected session errors`);
      if (index < 2) {
        assert.equal(state(flow, 'WeatherStep').city_LA, undefined);
        assert.equal(state(flow, 'WeatherStep').city_NYC, undefined);
      }
      if (index >= 2) {
        assert.equal(state(flow, 'WeatherStep').city_LA, 72);
        assert.equal(state(flow, 'WeatherStep').city_NYC, 83);
      }
      if (index >= 3) assert.deepEqual(state(flow, 'FavoritesStep').favorites, {
        favoriteColor: 'blue', favoriteMovie: 'Star Wars', favoriteSeason: 'summer',
      });
      if (turn.input === 'John Doe') {
        assert.equal(state(flow, 'NameStep').name, undefined);
        assert.equal(state(flow, 'InContextStep').who, undefined);
        assert.equal(state(flow, 'ConcurStep1').concurStep1_tool, undefined);
        assert.equal(state(flow, 'DOBStep').year, undefined);
        assert.match(body.message, /John Doe/i);
      }
      if (index >= 5) assertNestedResults(flow);
    }

    const session = await engine.getFlowSession().fetchAll(sessionId);
    assert(session?.flow);
    report.session = session;
    assert.equal(session.runStatus, 'completed');
    const flow = session.flow;
    assert.equal(flow.currentStep, 'TerminateSessionStep');
    assert.equal(state(flow, 'NameStep').name, 'John Wick');
    assert.equal(state(flow, 'NameStep').source, 'basic-flow-ollama-test');
    assert.deepEqual({ year: state(flow, 'DOBStep').year, month: state(flow, 'DOBStep').month, day: state(flow, 'DOBStep').day }, { year: 2000, month: 1, day: 1 });
    const address = state(flow, 'AddressStep').address as Record<string, unknown>;
    assert(address);
    assert.match(String(address.street), /^123 K (?:St\.?|Street)$/i);
    assert.equal(address.city, 'Portland');
    assert.equal(address.state, 'OR');
    assert.equal(address.zip, '97006');
    assert.equal(state(flow, 'TerminateSessionStep').fromAddress, 5);
    assert(structuredCalls > 0, 'BasicFlow must exercise native Ollama structured output.');
    const messages = Object.values(flow.memory).flatMap(memory => memory.messages);
    assert.equal(messages.some(message => message.name.startsWith('ConcurStep')), false,
      'Parallel worker histories must remain private.');
    report.passed = true;
    console.log(`Verified ${scenario.turns.length} BasicFlow turns, placeholder-name recovery, structured movie output, nested parallel joins, DOB, and address.`);
  } catch (error) {
    report.error = error instanceof Error ? error.stack : String(error);
    if (app && sessionId) report.session = await app.get(FlowEngine).getFlowSession().fetchAll(sessionId).catch(() => null);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Replay artifact: ${artifactPath}`);
    if (app) {
      try {
        if (!keepSession && sessionId) await app.get(FlowEngine).deleteSession(sessionId);
      } finally {
        await app.close();
      }
    }
  }
});

function state(flow: FlowType, stepName: string): Record<string, unknown> {
  const step = flow.steps.find(step => step.name === stepName);
  assert(step, `Expected ${stepName} in the BasicFlow session.`);
  return step.state as Record<string, unknown>;
}

function assertNestedResults(flow: FlowType): void {
  assert.equal(state(flow, 'NameStep').name, 'John Wick');
  assert.deepEqual(state(flow, 'ConcurStep1').concurStep1_tool, { completed: true });
  assert.deepEqual(state(flow, 'InContextStep').concurStep1, { completed: true });
  for (const number of [2, 3, 4]) {
    const result = state(flow, `ConcurStep${number}`)[`concurStep${number}`];
    assert.equal(typeof result, 'string');
    assert.match(String(result), /complete(?:d)?/i);
  }
  const movie = state(flow, 'InContextStep').who;
  const movieSchema = InContextStep.prototype.structOutputSchema() as ZodType;
  movieSchema.parse(movie);
  const embedded = state(flow, 'NameStep').inContext;
  assert.equal(typeof embedded, 'string');
  assert.deepEqual(JSON.parse(String(embedded)), movie);
}
