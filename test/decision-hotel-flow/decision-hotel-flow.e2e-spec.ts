import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { Test as NestTest } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { FlowEngine } from '@picoflow/core';
import { AppModule } from '../../src/app.module.js';

dotenv.config({ override: true, quiet: true });

process.env.HOTEL_FLOW_CURRENT_DATE = '2027-07-15T00:00:00.000Z';
process.env.SESSION_STORE ??= 'MEMORY';
process.env.GEMINI_API_KEY ??= 'unused-in-decision-hotel-flow-test';
process.env.ANTHROPIC_API_KEY ??= 'unused-in-decision-hotel-flow-test';

type RunResponse = {
  success?: boolean;
  completed?: boolean;
  message?: string;
  session?: string;
};

type DecisionHotelFlowScenario = {
  flowName: string;
  judgeModel?: string;
  judgeMinScore?: number;
  turns: ScenarioTurn[];
};

type ScenarioTurn = {
  label: string;
  input: string;
  expectedResponse: string;
  activeStep: string;
  completed: boolean;
  minScore?: number;
};

type JudgeResult = {
  pass: boolean;
  score: number;
  reason: string;
  missing?: string[];
  contradictions?: string[];
};

type TranscriptTurn = ScenarioTurn & {
  actualResponse?: string;
  judge?: JudgeResult;
};

const scenarioPath = join(
  process.cwd(),
  'test',
  'decision-hotel-flow',
  'decision-hotel-flow.scenario.json',
);
const artifactDirectory = join(
  process.cwd(),
  'test',
  '.tmp',
  'decision-hotel-flow',
);
const failureArtifactPath = join(artifactDirectory, 'semantic-failure.json');
const successArtifactPath = join(artifactDirectory, 'live.json');
const scenario = loadScenario();
const judgeModel =
  process.env.DECISION_HOTEL_FLOW_JUDGE_MODEL ??
  scenario.judgeModel ??
  'gpt-4o';
const testTimeoutMs = Number(
  process.env.DECISION_HOTEL_FLOW_TEST_TIMEOUT_MS ?? 900_000,
);
const missingLiveConfig = [
  'TYPESAFE_API_KEY',
  'OPENAI_API_KEY',
  'PICOFLOW_KEY',
].filter((key) => !process.env[key]?.trim());
const skipReason = `Missing live DecisionHotelFlow config: ${missingLiveConfig.join(', ')}`;

test(
  'DecisionHotelFlow completes a live routed, judged, revised hotel booking',
  {
    timeout: testTimeoutMs,
    skip: missingLiveConfig.length === 0 ? false : skipReason,
  },
  async () => {
    const app = await createApp();
    const server = app.getHttpAdapter().getInstance();
    const transcript: TranscriptTurn[] = [];
    let sessionId: string | undefined;

    async function send(message: string): Promise<RunResponse> {
      const response = await server.inject({
        method: 'POST',
        url: '/ai/run',
        headers: {
          'content-type': 'application/json',
          ...(sessionId ? { CHAT_SESSION_ID: sessionId } : {}),
        },
        payload: JSON.stringify({ message, flowName: scenario.flowName }),
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

        const sessionDoc = await app
          .get(FlowEngine)
          .getFlowSession()
          .fetchAll(sessionId!);
        assert.ok(sessionDoc, `${turn.label}: expected session document`);
        assert.equal(
          sessionDoc.flow.currentStep,
          turn.activeStep,
          `${turn.label} active step mismatch`,
        );
        if (turn.label === 'cross-step date correction') {
          assert.deepEqual(
            businessState(sessionDoc.flow, 'DateRangeStep'),
            {
              answered: true,
              start: '2027-08-03',
              end: '2027-08-09',
            },
            'Cross-step correction must update DateRangeStep before returning to amenities',
          );
        }

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
      const sessionDoc = await expectSessionState(app, sessionId);
      logProgress('final session state ok');

      mkdirSync(artifactDirectory, { recursive: true });
      writeFileSync(
        successArtifactPath,
        JSON.stringify(
          {
            transcript,
            decisionUsage: sessionDoc.decisionUsage,
            llmUsage: sessionDoc.tokens,
          },
          null,
          2,
        ),
        'utf-8',
      );
      logProgress(`saved successful transcript: ${successArtifactPath}`);
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

function loadScenario(): DecisionHotelFlowScenario {
  const parsed = JSON.parse(
    readFileSync(scenarioPath, 'utf-8'),
  ) as DecisionHotelFlowScenario;

  assert.equal(parsed.flowName, 'DecisionHotelFlow');
  assert.ok(parsed.turns.length > 0, 'Scenario must include turns');
  for (const turn of parsed.turns) {
    assert.ok(turn.label, 'Scenario turn must include label');
    assert.ok(turn.input, `${turn.label}: scenario turn must include input`);
    assert.ok(
      turn.expectedResponse,
      `${turn.label}: scenario turn must include expectedResponse`,
    );
    assert.ok(
      turn.activeStep,
      `${turn.label}: scenario turn must include activeStep`,
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
              'You are a strict but fair evaluator for a live AI hotel booking flow test.',
              'Compare the actual assistant response with the expected semantic behavior.',
              'Ignore harmless wording, formatting, ordering, and politeness differences.',
              'The flow searches Hilton hotels in the Portland, Oregon metropolitan area.',
              'The test conversation date is July 15, 2027.',
              'August 1 through August 8, 2027 is a valid future stay range; on that turn, a budget question alone is correct and must not be judged as a failure to correct dates.',
              'Accept concise responses that ask for the correct next criterion without acknowledging or repeating the prior answer; persisted state is checked separately, so omission of an acknowledgement is never a failure by itself.',
              'On the opening turn, a question that explicitly invites the user to provide check-in and checkout dates satisfies date collection.',
              'When one supplied date is impossible, accept either asking only for that date to be corrected or asking the user to provide the valid date pair again, as long as date collection remains active.',
              'On the date-correction turn, the visible response only needs to continue by asking for amenities; the test separately verifies that August 3 through August 9, 2027 was already saved, so never require the response to acknowledge or repeat those dates.',
              'A criteria summary may use normalized tool values such as freeWiFi and freeParking.',
              'Hotel result responses must use actual search results, include hotel names and total prices, and explain booking or revision.',
              'The flow intentionally has no hotel-comparison behavior.',
              'Fail responses that ask for the wrong criterion, contradict a saved correction, invent a result or booking, omit a required correction, or claim completion before booking.',
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
    mkdirSync(dirname(failureArtifactPath), { recursive: true });
    writeFileSync(
      failureArtifactPath,
      JSON.stringify(
        { failedTurn: turn.label, judgeModel, minScore, transcript },
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
) {
  const sessionDoc = await app
    .get(FlowEngine)
    .getFlowSession()
    .fetchAll(sessionId);
  assert.ok(sessionDoc, 'Expected DecisionHotelFlow session document');
  assert.equal(sessionDoc.flow.name, 'DecisionHotelFlow');
  assert.equal(sessionDoc.runStatus, 'completed');
  assert.equal(sessionDoc.flow.currentStep, 'PresentStep');

  assert.deepEqual(businessState(sessionDoc.flow, 'DateRangeStep'), {
    answered: true,
    start: '2027-08-03',
    end: '2027-08-09',
  });
  assert.deepEqual(businessState(sessionDoc.flow, 'BudgetStep'), {
    answered: true,
    min: null,
    max: 750,
  });
  assert.deepEqual(businessState(sessionDoc.flow, 'RoomTypeStep'), {
    answered: true,
    roomType: 'suite',
  });
  assert.deepEqual(businessState(sessionDoc.flow, 'AmenityStep'), {
    answered: true,
    amenities: ['freeWiFi', 'freeParking'],
  });
  assert.deepEqual(businessState(sessionDoc.flow, 'DistanceStep'), {
    answered: true,
    airport: null,
    cityCenter: null,
  });

  assert.equal(
    businessState(sessionDoc.flow, 'CriteriaReadinessJudgeStep').accepted,
    true,
  );
  assert.equal(
    businessState(sessionDoc.flow, 'PresentationJudgeStep').accepted,
    true,
  );

  const present = businessState(sessionDoc.flow, 'PresentStep');
  const hotelFound = present.hotelFound as Array<{ hotelName: string }>;
  assert.ok(Array.isArray(hotelFound) && hotelFound.length > 0);
  assert.equal(typeof present.selectedHotel, 'string');
  assert.ok(
    hotelFound.some((hotel) => hotel.hotelName === present.selectedHotel),
    'Booked hotel must come from the current search result set',
  );
  assert.match(String(present.confirmationNumber), /^\d{6}$/);
  assert.ok(sessionDoc.decisionUsage.calls >= 10);
  assert.ok(sessionDoc.tokens.totalTokens > 0);
  assert.equal(
    sessionDoc.flow.steps.some((step) => step.name === 'CompareStep'),
    false,
  );

  return sessionDoc;
}

function businessState(
  flow: { steps: Array<{ name: string; state: Record<string, unknown> }> },
  stepName: string,
): Record<string, any> {
  const step = flow.steps.find((candidate) => candidate.name === stepName);
  assert.ok(step, `Expected ${stepName} in DecisionHotelFlow session`);
  const state = { ...step.state };
  delete state._saveOn;
  return state;
}

function readSessionHeader(
  headers: Record<string, number | string | string[] | undefined>,
): string | undefined {
  const header = headers.chat_session_id ?? headers.CHAT_SESSION_ID;
  return Array.isArray(header) ? header[0] : header?.toString();
}

function logProgress(message: string): void {
  if (process.env.DECISION_HOTEL_FLOW_TEST_LOG === '0') return;
  console.log(`[DecisionHotelFlow live] ${message}`);
}

function preview(message?: string, maxLength = 180): string {
  const compact = message?.replace(/\s+/g, ' ').trim() ?? '';
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength)}...`;
}
