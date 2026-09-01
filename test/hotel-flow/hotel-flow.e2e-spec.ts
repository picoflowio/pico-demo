/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
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
import { AppModule } from '../../src/app.module.js';
import { FlowEngine } from '@picoflow/core';

type RunResponse = {
  success?: boolean;
  completed?: boolean;
  message?: string;
  session?: string;
};

type HotelFlowScenario = {
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
  'hotel-flow-session.sqlite',
);
const scenarioPath = join(
  process.cwd(),
  'test',
  'hotel-flow',
  'hotel-flow.scenario.json',
);
const failureArtifactPath = join(
  process.cwd(),
  'test',
  '.tmp',
  'hotel-flow-semantic-failure.json',
);

const useEnvDocumentDb = process.env.HOTEL_FLOW_TEST_USE_ENV === '1';
if (!useEnvDocumentDb) {
  process.env.DOCUMENT_DB = process.env.HOTEL_FLOW_TEST_DOCUMENT_DB ?? 'SQLITE';
  process.env.SESSION_STORE =
    process.env.HOTEL_FLOW_TEST_SESSION_STORE ?? 'SQLITE';
  process.env.SQLITE_PATH =
    process.env.HOTEL_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
  process.env.GEMINI_API_KEY =
    process.env.GEMINI_API_KEY ?? 'unused-in-hotel-flow-test';
  process.env.ANTHROPIC_API_KEY =
    process.env.ANTHROPIC_API_KEY ?? 'unused-in-hotel-flow-test';
  process.env.MONGODB_NAME =
    process.env.MONGODB_NAME ?? 'unused-in-hotel-flow-test';
  process.env.MONGODB_COLLECTION =
    process.env.MONGODB_COLLECTION ?? 'unused-in-hotel-flow-test';
  process.env.MONGODB_URL =
    process.env.MONGODB_URL ?? 'mongodb://unused-in-hotel-flow-test';
}

process.env.HOTEL_FLOW_CURRENT_DATE =
  process.env.HOTEL_FLOW_CURRENT_DATE ?? '2027-07-15T00:00:00.000Z';

if ((process.env.DOCUMENT_DB ?? 'SQLITE').toUpperCase() === 'SQLITE') {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}
const scenario = loadScenario();
const judgeModel =
  process.env.HOTEL_FLOW_JUDGE_MODEL ?? scenario.judgeModel ?? 'gpt-4o';
const testTimeoutMs = Number(process.env.HOTEL_FLOW_TEST_TIMEOUT_MS ?? 900_000);
const missingLiveConfig = ['OPENAI_API_KEY', 'PICOFLOW_KEY'].filter(
  (key) => !process.env[key]?.trim(),
);
const shouldRunLiveTest = missingLiveConfig.length === 0;
const skipReason = `Missing live HotelFlow config: ${missingLiveConfig.join(', ')}`;

test(
  'HotelFlow completes a realistic search, comparison, and booking conversation',
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
      try {
        await app.get(FlowEngine).close();
      } finally {
        await app.close();
      }
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
  if (process.env.HOTEL_FLOW_TEST_LOG === '0') {
    return;
  }
  console.log(`[HotelFlow E2E] ${message}`);
}

function preview(message?: string, maxLength = 180): string {
  const compact = message?.replace(/\s+/g, ' ').trim() ?? '';
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function loadScenario(): HotelFlowScenario {
  const parsed = JSON.parse(
    readFileSync(scenarioPath, 'utf-8'),
  ) as HotelFlowScenario;

  assert.equal(parsed.flowName, 'HotelFlow');
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
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
              'You are a strict but fair evaluator for an AI hotel booking flow test.',
              'Compare the actual assistant response to the expected semantic behavior.',
              'Ignore wording differences, formatting differences, markdown table layout differences, and harmless extra politeness.',
              'This assistant books Hilton hotels only in the Portland, Oregon metropolitan area.',
              'The test conversation date is July 15, 2027. This scenario explicitly selects a stay from August 1 through August 8, 2027. It is required and correct for all subsequent search and comparison dates and prices to use 2027; do not mark 2027 comparison dates as incorrect.',
              'Accept responses that ask for the correct next hotel-search field even if they omit acknowledgement of the prior answer.',
              'Accept hotel lists when they include hotel names and prices, even if the exact order or formatting differs.',
              'Accept comparison responses when they include the requested hotels and feature in a table or other structured form.',
              'In comparison tables, column headers such as Hotel 1, Hotel 2, and Hotel 3 are generic comparison labels; judge the actual hotelName row rather than treating those headers as the original numbered hotel list selection.',
              'For the amenities reuse turn, fail if the assistant asks the user to choose hotels again instead of reusing the prior comparison hotels.',
              'Fail if the response asks for the wrong information, skips a required search or comparison behavior, contradicts the expected behavior, or is too vague to be useful.',
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
  assert.equal(sessionDoc.flow?.name, 'HotelFlow');
  const hotelFlow = sessionDoc.flow;

  assert.ok(hotelFlow, 'Expected HotelFlow session document');

  const searchJson = stepState(hotelFlow, 'ExploreStep').json;
  assert.equal(searchJson.cDate.start, '2027-08-01');
  assert.equal(searchJson.cDate.end, '2027-08-08');
  assert.deepEqual(searchJson.cRoomType, ['two beds']);
  assert.deepEqual(searchJson.cAmenities, ['freeWiFi', 'freeParking']);
  assert.equal(searchJson.cPriceRange.max, 700);

  const hotelFound = stepState(hotelFlow, 'PresentStep').hotelFound;
  assert.ok(Array.isArray(hotelFound), 'Expected hotel search results');
  assert.ok(hotelFound.length > 0, 'Expected at least one hotel result');

  assert.equal(
    stepState(hotelFlow, 'PresentStep').hotel,
    'Hampton Inn Sherwood Portland',
  );

  const comparedHotels = stepState(hotelFlow, 'CompareStep').compare_hotel;
  assert.deepEqual(comparedHotels, [
    'Hampton Inn Portland-Airport',
    'Hampton Inn Portland/Clackamas',
  ]);
}

function stepState(
  flow: { steps?: Array<{ name?: string; state?: Record<string, any> }> },
  stepName: string,
): Record<string, any> {
  const step = flow.steps?.find((candidate) => candidate.name === stepName);
  assert.ok(step, `Expected ${stepName} in HotelFlow session`);
  return step.state ?? {};
}
