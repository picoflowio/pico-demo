/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import 'dotenv/config';

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { Test as NestTest } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module.js';
import { FlowEngine, Model } from '@picoflow/core';

type RunResponse = {
  success?: boolean;
  completed?: boolean;
  message?: string;
  session?: string;
};

type BasicFlowScenario = {
  flowName: string;
  turns: ScenarioTurn[];
};

type ScenarioTurn = {
  label: string;
  input: string;
  expectedResponse: string;
  expectedActiveStep: string;
  responseMustInclude: string[];
  completed: boolean;
};

const sqlitePath = join(
  process.cwd(),
  'test',
  '.tmp',
  'basic-flow-session.sqlite',
);
const scenarioPath = join(
  process.cwd(),
  'test',
  'basic-flow',
  'basic-flow.scenario.json',
);
const useEnvDocumentDb = process.env.USE_ENV === '1';
if (!useEnvDocumentDb) {
  process.env.SESSION_STORE =
    process.env.BASIC_FLOW_TEST_DOCUMENT_DB ?? 'SQLITE';
  process.env.SQLITE_PATH =
    process.env.BASIC_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
}

if ((process.env.SESSION_STORE ?? 'SQLITE').toUpperCase() === 'SQLITE') {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}

const scenario = loadScenario();
const testTimeoutMs = Number(process.env.BASIC_FLOW_TEST_TIMEOUT_MS ?? 900_000);
const requiredConfig = ['OPENAI_API_KEY', 'PICOFLOW_KEY'];
const missingConfig = requiredConfig.filter(
  (key) => !process.env[key]?.trim(),
);
const skipReason = `Missing BasicFlow config: ${missingConfig.join(', ')}`;

test(
  'BasicFlow completes a realistic conversation through a real NestJS app (live model)',
  { timeout: testTimeoutMs, skip: missingConfig.length === 0 ? false : skipReason },
  async () => {
    const app = await createApp();
    const server = app.getHttpAdapter().getInstance();
    let sessionId: string | undefined;

    async function send(message: string): Promise<RunResponse> {
      const response = await server.inject({
        method: 'POST',
        url: '/ai/run',
        headers: {
          'content-type': 'application/json',
          ...(sessionId ? { CHAT_SESSION_ID: sessionId } : {}),
        },
        payload: JSON.stringify({
          message,
          flowName: scenario.flowName,
        }),
      });

      assert.equal(
        response.statusCode,
        200,
        `POST /ai/run failed for "${message}": ${response.payload}`,
      );

      const body = JSON.parse(response.payload) as RunResponse;
      assert.equal(body.success, true, `Expected success for "${message}"`);
      assert.ok(body.session, `Expected session id for "${message}"`);

      const responseSessionId = readSessionHeader(response.headers);
      if (sessionId) {
        assert.equal(body.session, sessionId, 'Session id changed in body');
        assert.equal(
          responseSessionId,
          sessionId,
          'Session id changed in response header',
        );
      } else {
        sessionId = responseSessionId ?? body.session;
      }

      return body;
    }

    try {
      for (const [index, turn] of scenario.turns.entries()) {
        logProgress(
          `turn ${index + 1}/${scenario.turns.length}: ${turn.label}`,
        );
        logProgress(`input: ${turn.input}`);

        const response = await send(turn.input);
        logProgress(`response: ${preview(response.message)}`);

        assert.equal(
          response.completed,
          turn.completed,
          `${turn.label} completed flag mismatch`,
        );
        expectResponseContract(turn, response);
        assert.ok(sessionId, `${turn.label}: expected a session id`);
        await expectTurnSessionState(app, sessionId, turn);
        logProgress(`contract: current step=${turn.expectedActiveStep}`);
      }

      assert.ok(sessionId, 'Expected a session id after conversation');
      logProgress('checking final session state');
      await expectSessionState(app, sessionId);
      logProgress('final session state ok');
    } finally {
      try {
        await app.get(FlowEngine).close();
      } finally {
        await app.close();
      }
    }
  },
);

test(
  'BasicFlow returns ConcurStep1 directResult data through the parallel join',
  { concurrency: false },
  async () => {
    ScriptedBasicFlowModel.toolCallId = 0;
    const restoreModel = installScriptedBasicFlowModel();
    const app = await createApp();
    const server = app.getHttpAdapter().getInstance();
    let sessionId: string | undefined;

    try {
      for (const turn of scenario.turns.slice(0, 6)) {
        const response = await server.inject({
          method: 'POST',
          url: '/ai/run',
          headers: {
            'content-type': 'application/json',
            ...(sessionId ? { CHAT_SESSION_ID: sessionId } : {}),
          },
          payload: JSON.stringify({ message: turn.input, flowName: scenario.flowName }),
        });
        assert.equal(response.statusCode, 200, response.payload);
        const body = JSON.parse(response.payload) as RunResponse;
        sessionId = readSessionHeader(response.headers) ?? body.session;
        assert.ok(sessionId, 'Expected session id from scripted turn');
      }

      const sessionDoc = await app
        .get(FlowEngine)
        .getFlowSession()
        .fetchAll(sessionId!);
      assert.ok(sessionDoc?.flow, 'Expected BasicFlow session document');
      assert.deepEqual(stepState(sessionDoc.flow, 'ConcurStep1').concurStep1_tool, {
        completed: true,
      });
      assert.equal(
        stepState(sessionDoc.flow, 'ConcurStep3').concurStep3,
        'The concurrent follow-up task is complete.',
      );
      assert.deepEqual(stepState(sessionDoc.flow, 'InContextStep').concurStep1, {
        completed: true,
      });
    } finally {
      restoreModel();
      try {
        await app.get(FlowEngine).close();
      } finally {
        await app.close();
      }
    }
  },
);

function installScriptedBasicFlowModel(): () => void {
  const modelPrototype = Model.prototype as unknown as {
    createInstance: (...args: unknown[]) => unknown;
  };
  const originalCreateInstance = modelPrototype.createInstance;
  modelPrototype.createInstance = () => new ScriptedBasicFlowModel();

  return () => {
    modelPrototype.createInstance = originalCreateInstance;
  };
}

class ScriptedBasicFlowModel {
  private structuredOutput = false;
  public static toolCallId = 0;

  public bindTools(): this {
    return this;
  }

  public withStructuredOutput(): this {
    this.structuredOutput = true;
    return this;
  }

  public async invoke(
    messages: Array<{ content?: unknown }>,
  ): Promise<AIMessage | Record<string, unknown>> {
    const systemPrompt = messageText(messages[0]?.content);
    const latestMessage = messageText(messages.at(-1)?.content);

    if (this.structuredOutput && systemPrompt.includes('sci-fi movie idea')) {
      return {
        title: 'Orbit Academy',
        genre: 'Science fiction',
        releaseYear: 2030,
        rating: 8,
        summary: 'Teen cadets protect their orbital school from a rogue satellite.',
      };
    }

    if (systemPrompt.includes('exactly two city aliases')) {
      if (/\bLA\s*,\s*NYC\b/i.test(latestMessage)) {
        return scriptedToolCalls([
          { name: 'get_weather', args: { cityName: 'LA' } },
          { name: 'get_weather', args: { cityName: 'NYC' } },
        ]);
      }
      if (/PDX|PHX/i.test(latestMessage)) {
        return scriptedText(
          'PDX and PHX are unsupported. Only LA and NYC are supported; please enter LA or NYC.',
        );
      }
      return scriptedText(
        'Only LA and NYC are supported. Which supported cities would you like to compare?',
      );
    }

    if (systemPrompt.includes('favorite color, favorite movie')) {
      if (/blue.*star wars.*summer/i.test(latestMessage)) {
        return scriptedText(
          JSON.stringify({
            favoriteColor: 'blue',
            favoriteMovie: 'Star Wars',
            favoriteSeason: 'summer',
          }),
        );
      }
      return scriptedText(
        'What are your favorite color (red, blue, or white), movie, and season (spring, summer, autumn, or winter)?',
      );
    }

    if (systemPrompt.includes('Ask the customer for their full name')) {
      if (/cannot accept john doe/i.test(latestMessage)) {
        return scriptedText(
          'John Doe cannot be accepted. Please provide a different full name.',
        );
      }
      if (/john doe/i.test(latestMessage)) {
        return scriptedToolCalls([
          { name: 'user_name', args: { name: 'John Doe' } },
        ]);
      }
      if (/john wick/i.test(latestMessage)) {
        return scriptedToolCalls([
          { name: 'user_name', args: { name: 'John Wick' } },
        ]);
      }
      return scriptedText('Please provide your full name.');
    }

    if (systemPrompt.includes("immediately trigger the 'dob' tool")) {
      if (/1\/1\/2000/.test(latestMessage)) {
        return scriptedToolCalls([
          { name: 'dob', args: { year: 2000, month: 1, day: 1 } },
        ]);
      }
      return scriptedText('Please provide your date of birth.');
    }

    if (systemPrompt.includes('one complete US mailing address')) {
      if (/123 K St\. Portland, OR 97006/i.test(latestMessage)) {
        return scriptedToolCalls([
          {
            name: 'address',
            args: { address: '123 K St. Portland, OR 97006' },
          },
        ]);
      }
      return scriptedText('Please provide your complete US mailing address.');
    }

    if (systemPrompt.includes('profile collection is complete')) {
      return scriptedText(
        'Your address was accepted and your profile collection is complete.',
      );
    }

    if (systemPrompt.includes('You are ConcurStep1')) {
      return scriptedToolCalls([
        { name: 'complete_concurrent_step1', args: {} },
      ]);
    }

    if (systemPrompt.includes('You are ConcurStep')) {
      return scriptedText('The concurrent follow-up task is complete.');
    }

    throw new Error(
      `No scripted BasicFlow response for system prompt: ${preview(systemPrompt)}`,
    );
  }
}

function scriptedText(content: string): AIMessage {
  return new AIMessage({ content });
}

function scriptedToolCalls(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: calls.map((call) => ({
      ...call,
      id: `scripted-tool-${++ScriptedBasicFlowModel.toolCallId}`,
    })),
  });
}

function messageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return content === undefined || content === null
    ? ''
    : JSON.stringify(content);
}

async function createApp(): Promise<NestFastifyApplication> {
  const moduleRef = await NestTest.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function readSessionHeader(
  headers: Record<string, number | string | string[] | undefined>,
): string | undefined {
  const header = headers.chat_session_id ?? headers.CHAT_SESSION_ID;
  return Array.isArray(header) ? header[0] : header?.toString();
}

function logProgress(message: string): void {
  if (process.env.BASIC_FLOW_TEST_LOG === '0') {
    return;
  }
  console.log(`[BasicFlow E2E] ${message}`);
}

function preview(message?: string, maxLength = 180): string {
  const compact = message?.replace(/\s+/g, ' ').trim() ?? '';
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function loadScenario(): BasicFlowScenario {
  const parsed = JSON.parse(
    readFileSync(scenarioPath, 'utf-8'),
  ) as BasicFlowScenario;

  assert.equal(parsed.flowName, 'BasicFlow');
  assert.ok(parsed.turns.length > 0, 'Scenario must include turns');

  for (const turn of parsed.turns) {
    assert.ok(turn.label, 'Scenario turn must include label');
    assert.ok(turn.input, `${turn.label}: scenario turn must include input`);
    assert.ok(
      turn.expectedResponse,
      `${turn.label}: scenario turn must include expectedResponse`,
    );
    assert.equal(
      typeof turn.completed,
      'boolean',
      `${turn.label}: scenario turn must include completed`,
    );
    assert.ok(
      turn.expectedActiveStep,
      `${turn.label}: scenario turn must include expectedActiveStep`,
    );
    assert.ok(
      turn.responseMustInclude.length > 0,
      `${turn.label}: scenario turn must include responseMustInclude`,
    );
  }

  return parsed;
}

function expectResponseContract(
  turn: ScenarioTurn,
  response: RunResponse,
): void {
  const message = response.message?.replace(/\s+/g, ' ').trim().toLowerCase();
  assert.ok(message, `${turn.label}: expected non-empty bot message`);

  for (const requiredText of turn.responseMustInclude) {
    assert.ok(
      message.includes(requiredText.toLowerCase()),
      [
        `${turn.label}: response must include "${requiredText}"`,
        `expected behavior=${turn.expectedResponse}`,
        `actual=${response.message}`,
      ].join('\n'),
    );
  }
}

async function expectTurnSessionState(
  app: NestFastifyApplication,
  sessionId: string,
  turn: ScenarioTurn,
): Promise<void> {
  const sessionDoc = await app
    .get(FlowEngine)
    .getFlowSession()
    .fetchAll(sessionId);
  assert.ok(sessionDoc, `${turn.label}: expected a session document`);
  assert.equal(sessionDoc.flow?.name, scenario.flowName);
  assert.equal(
    sessionDoc.runStatus,
    turn.completed ? 'completed' : 'running',
    `${turn.label}: persisted run status mismatch`,
  );

  assert.equal(
    sessionDoc.flow?.currentStep,
    turn.expectedActiveStep,
    `${turn.label}: persisted current step mismatch`,
  );
}

async function expectSessionState(
  app: NestFastifyApplication,
  sessionId: string,
): Promise<void> {
  const sessionDoc = await app
    .get(FlowEngine)
    .getFlowSession()
    .fetchAll(sessionId);
  assert.equal(sessionDoc.flow?.name, 'BasicFlow');
  const basicFlow = sessionDoc.flow;

  assert.ok(basicFlow, 'Expected BasicFlow session document');
  assert.equal(stepState(basicFlow, 'WeatherStep').city_LA, 72);
  assert.equal(stepState(basicFlow, 'WeatherStep').city_NYC, 83);
  assert.deepEqual(stepState(basicFlow, 'FavoritesStep').favorites, {
    favoriteColor: 'blue',
    favoriteMovie: 'Star Wars',
    favoriteSeason: 'summer',
  });
  assert.equal(stepState(basicFlow, 'NameStep').name, 'John Wick');
  assert.deepEqual(stepState(basicFlow, 'ConcurStep1').concurStep1_tool, {
    completed: true,
  });
  assert.deepEqual(stepState(basicFlow, 'InContextStep').concurStep1, {
    completed: true,
  });
  assert.equal(stepState(basicFlow, 'DOBStep').year, 2000);
  assert.equal(stepState(basicFlow, 'DOBStep').month, 1);
  assert.equal(stepState(basicFlow, 'DOBStep').day, 1);
  assert.equal(stepState(basicFlow, 'AddressStep').address.zip, '97006');
  assert.equal(stepState(basicFlow, 'AddressStep').address.city, 'Portland');
  assert.equal(stepState(basicFlow, 'AddressStep').address.state, 'OR');
}

function stepState(
  flow: { steps?: Array<{ name?: string; state?: Record<string, any> }> },
  stepName: string,
): Record<string, any> {
  const step = flow.steps?.find((candidate) => candidate.name === stepName);
  assert.ok(step, `Expected ${stepName} in BasicFlow session`);
  return step.state ?? {};
}
