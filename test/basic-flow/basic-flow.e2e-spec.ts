import 'dotenv/config';

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { Test as NestTest } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { FlowEngine } from '@picoflow/core';
import { AppModule } from '../../src/app.module.js';

type RunResponse = {
  success?: boolean;
  completed?: boolean;
  message?: string;
  session?: string;
};

type BasicFlowScenario = {
  flowName: string;
  judgeModel?: string;
  judgeMinScore?: number;
  turns: ScenarioTurn[];
};

type ScenarioTurn = {
  label: string;
  input: string;
  expectedResponse: string;
  completed: boolean;
  minScore?: number;
};

type TranscriptTurn = ScenarioTurn & {
  actualResponse?: string;
  judge?: JudgeResult;
};

type JudgeResult = {
  pass: boolean;
  score: number;
  reason: string;
  missing?: string[];
  contradictions?: string[];
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
const failureArtifactPath = join(
  process.cwd(),
  'test',
  '.tmp',
  'basic-flow-semantic-failure.json',
);

const useEnvDocumentDb = process.env.BASIC_FLOW_TEST_USE_ENV === '1';
if (!useEnvDocumentDb) {
  process.env.DOCUMENT_DB = process.env.BASIC_FLOW_TEST_DOCUMENT_DB ?? 'SQLITE';
  process.env.SQLITE_PATH =
    process.env.BASIC_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
}

if ((process.env.DOCUMENT_DB ?? 'SQLITE').toUpperCase() === 'SQLITE') {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}

const scenario = loadScenario();
const judgeModel =
  process.env.BASIC_FLOW_JUDGE_MODEL ?? scenario.judgeModel ?? 'gpt-4o';
const testTimeoutMs = Number(process.env.BASIC_FLOW_TEST_TIMEOUT_MS ?? 900_000);
const missingLiveConfig = ['OPENAI_KEY', 'PICOFLOW_KEY'].filter(
  (key) => !process.env[key]?.trim(),
);
const shouldRunLiveTest =
  process.env.RUN_LIVE_BASIC_FLOW_TEST !== '0' &&
  missingLiveConfig.length === 0;
const skipReason =
  process.env.RUN_LIVE_BASIC_FLOW_TEST === '0'
    ? 'RUN_LIVE_BASIC_FLOW_TEST=0'
    : `Missing live BasicFlow config: ${missingLiveConfig.join(', ')}`;

test(
  'BasicFlow completes a realistic conversation through a real NestJS app',
  { timeout: testTimeoutMs, skip: shouldRunLiveTest ? false : skipReason },
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

    const transcript: TranscriptTurn[] = [];

    try {
      for (const [index, turn] of scenario.turns.entries()) {
        logProgress(
          `turn ${index + 1}/${scenario.turns.length}: ${turn.label}`,
        );
        logProgress(`input: ${turn.input}`);

        const response = await send(turn.input);
        logProgress(`response: ${preview(response.message)}`);

        const transcriptTurn: TranscriptTurn = {
          ...turn,
          actualResponse: response.message,
        };
        transcript.push(transcriptTurn);

        assert.equal(
          response.completed,
          turn.completed,
          `${turn.label} completed flag mismatch`,
        );

        transcriptTurn.judge = await judgeResponse(turn, response);
        expectSemanticMatch(transcriptTurn, transcript);
        logProgress(
          `judge: pass score=${transcriptTurn.judge.score} reason=${preview(
            transcriptTurn.judge.reason,
          )}`,
        );
      }

      assert.ok(sessionId, 'Expected a session id after conversation');
      logProgress('checking final session state');
      await expectSessionState(app, sessionId);
      logProgress('final session state ok');
    } finally {
      await app.close();
    }
  },
);

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
  }

  return parsed;
}

async function judgeResponse(
  turn: ScenarioTurn,
  response: RunResponse,
): Promise<JudgeResult> {
  const message = response.message?.replace(/\s+/g, ' ').trim();
  assert.ok(message, `${turn.label}: expected non-empty bot message`);

  const openAiResponse = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: judgeModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are a strict but fair evaluator for an AI flow test.',
              'Compare the actual assistant response to the expected semantic behavior.',
              'Ignore wording differences, formatting differences, and harmless extra politeness.',
              'If the actual response asks for the correct next piece of information, do not penalize it for omitting acknowledgement of the prior user answer.',
              'If the actual response asks for the expected field plus additional fields from the same data-collection step, treat that as acceptable unless it prevents the user from continuing.',
              'When a flow crosses into a new data-collection step, accept extra wording that the previous input does not satisfy the new field as long as the response clearly asks for the expected new field.',
              'If the expected behavior says acknowledgement is not required, never mark missing acknowledgement as a problem.',
              'For unsupported-city recovery, asking the user to try different cities counts as a valid recovery. Do not require the assistant to name supported cities such as LA or NYC unless the expected behavior explicitly requires those exact city names.',
              'This BasicFlow assistant may include generic travel-assistant wording while collecting profile details; ignore that unless it refuses to perform the expected next action.',
              'Fail if the response asks for the wrong information, contradicts the expected behavior, skips required recovery behavior, or is too vague to be useful.',
              'Return only JSON with: pass boolean, score number from 0 to 1, reason string, missing string array, contradictions string array.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              turnLabel: turn.label,
              userInput: turn.input,
              expectedSemanticBehavior: turn.expectedResponse,
              actualAssistantResponse: message,
            }),
          },
        ],
      }),
    },
  );

  if (!openAiResponse.ok) {
    assert.fail(
      `${turn.label}: judge request failed: ${await openAiResponse.text()}`,
    );
  }

  const result = (await openAiResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  assert.ok(content, `${turn.label}: judge returned empty response`);

  try {
    return JSON.parse(content) as JudgeResult;
  } catch (_error) {
    assert.fail(`${turn.label}: judge returned invalid JSON: ${content}`);
  }
}

function expectSemanticMatch(
  turn: TranscriptTurn,
  transcript: TranscriptTurn[],
): void {
  const judge = turn.judge;
  assert.ok(judge, `${turn.label}: missing judge result`);

  const minScore = turn.minScore ?? scenario.judgeMinScore ?? 0.75;
  const passed = judge.pass === true && judge.score >= minScore;

  if (!passed) {
    writeFileSync(
      failureArtifactPath,
      JSON.stringify(
        {
          failedTurn: turn.label,
          judgeModel,
          minScore,
          transcript,
        },
        null,
        2,
      ),
      'utf-8',
    );
  }

  assert.equal(
    passed,
    true,
    [
      `${turn.label}: semantic judge failed`,
      `score=${judge.score}, minScore=${minScore}`,
      `reason=${judge.reason}`,
      `actual=${turn.actualResponse}`,
      `artifact=${failureArtifactPath}`,
    ].join('\n'),
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
  const basicFlow = sessionDoc.flows?.find((flow) => flow.name === 'BasicFlow');

  assert.ok(basicFlow, 'Expected BasicFlow session document');
  assert.equal(stepState(basicFlow, 'WeatherStep').city_LA, 72);
  assert.equal(stepState(basicFlow, 'WeatherStep').city_NYC, 83);
  assert.deepEqual(stepState(basicFlow, 'FavoritesStep').favorites, {
    favoriteColor: 'blue',
    favoriteMovie: 'Star Wars',
    favoriteSeason: 'summer',
  });
  assert.equal(stepState(basicFlow, 'NameStep').name, 'Joe Cline');
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
