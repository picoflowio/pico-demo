import "dotenv/config";

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, test } from "node:test";
import { Test as NestTest } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { FlowEngine } from "@picoflow/core";
import { AppModule } from "../../src/app.module.js";
import { RatingEngine, type QuoteApplication } from "../../src/myflow/home-insurance-flow/backend/rating-engine.js";
import { QuotePresenter } from "../../src/myflow/home-insurance-flow/backend/quote-presenter.js";

type RunResponse = { success?: boolean; completed?: boolean; message?: string; session?: string };
type ScenarioTurn = { label: string; input: string; expectedResponse: string; completed: boolean; minScore?: number };
type Scenario = { flowName: string; judgeModel?: string; judgeMinScore?: number; turns: ScenarioTurn[] };
type JudgeResult = { pass: boolean; score: number; reason: string; missing?: string[]; contradictions?: string[] };
type TranscriptTurn = ScenarioTurn & { actualResponse?: string; judge?: JudgeResult };

const testDate = new Date("2027-07-15T00:00:00.000Z");
process.env.HOME_INSURANCE_FLOW_CURRENT_DATE ??= testDate.toISOString();

const application: QuoteApplication = {
  qualification: { state: "OR", zip: "97205", purchaseStatus: "buying", occupancy: "primary", effectiveDate: "2027-10-01" },
  property: { dwellingType: "single_family", yearBuilt: 1998, squareFeet: 2100, stories: 2, construction: "wood_frame", roofMaterial: "composition", roofAgeYears: 4, plumbingUpdatedYear: 2018, electricalUpdatedYear: 2018, hvacUpdatedYear: 2022 },
  risk: { claims: [{ year: 2024, type: "water", amount: 7000 }], hazards: { pool: false, trampoline: false, woodStove: false }, protections: { smokeAlarms: true, burglarAlarm: true, monitoredAlarm: true, sprinklerSystem: false } },
  coverage: { dwellingCoverage: 450000, deductible: 2500, liabilityLimit: 500000, endorsements: ["water_backup"] },
};

describe("HomeInsuranceQuoteFlow deterministic services", () => {
  it("calculates versioned options without an LLM", () => {
    const result = RatingEngine.quote(application, testDate);
    assert.equal(result.decision, "eligible");
    assert.equal(result.options.length, 3);
    assert.deepEqual(result.options.map((option) => option.id), ["ESSENTIAL", "ENHANCED", "PREMIER"]);
    assert.deepEqual(result.options.map((option) => option.annualPremium), [1556.12, 1788.18, 2008.24]);
    assert.deepEqual(result.options.map((option) => option.monthlyPremium), [129.68, 149.02, 167.35]);
    assert.match(result.quoteId, /^EHI-20270715-[A-F0-9]{8}$/);
    assert.match(QuotePresenter.options(result), /non-binding estimate/);
  });

  it("routes unsupported and high-risk applications to code-owned review decisions", () => {
    const unsupported = RatingEngine.quote({ ...application, qualification: { ...application.qualification, state: "WA" } }, testDate);
    assert.equal(unsupported.decision, "unsupported");
    assert.deepEqual(unsupported.reasonCodes, ["UNSUPPORTED_STATE"]);
    assert.deepEqual(unsupported.options, []);
    const referral = RatingEngine.quote({ ...application, property: { ...application.property, roofAgeYears: 30 } }, testDate);
    assert.equal(referral.decision, "referral");
    assert.ok(referral.reasonCodes.includes("ROOF_AGE_REVIEW"));
    assert.deepEqual(referral.options, []);
  });

  it("changes quote identity and premiums when the deductible changes", () => {
    const original = RatingEngine.quote(application, testDate);
    const rerated = RatingEngine.quote({ ...application, coverage: { ...application.coverage, deductible: 5000 } }, testDate);
    assert.notEqual(rerated.quoteId, original.quoteId);
    assert.ok(rerated.options[0]!.annualPremium < original.options[0]!.annualPremium);
  });
});

const sqlitePath = join(process.cwd(), "test", ".tmp", "home-insurance-flow-session.sqlite");
const useEnvironmentDocumentStore = process.env.USE_ENV === "1";
if (!useEnvironmentDocumentStore) {
  process.env.DOCUMENT_DB = "SQLITE";
  process.env.SESSION_STORE = "SQLITE";
  process.env.SQLITE_PATH = process.env.HOME_INSURANCE_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
}
if ((process.env.DOCUMENT_DB ?? "SQLITE").toUpperCase() === "SQLITE") {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}
process.env.GEMINI_API_KEY ??= "unused-in-home-insurance-flow-test";
process.env.ANTHROPIC_API_KEY ??= "unused-in-home-insurance-flow-test";
process.env.MONGODB_NAME ??= "unused-in-home-insurance-flow-test";
process.env.MONGODB_COLLECTION ??= "unused-in-home-insurance-flow-test";
process.env.MONGODB_URL ??= "mongodb://unused-in-home-insurance-flow-test";

const scenarioPath = join(process.cwd(), "test", "home-insurance-flow", "home-insurance-flow.scenario.json");
const failureArtifactPath = join(process.cwd(), "test", ".tmp", "home-insurance-flow-semantic-failure.json");
const scenario = loadScenario();
const judgeModel = process.env.HOME_INSURANCE_FLOW_JUDGE_MODEL ?? scenario.judgeModel ?? "gpt-4o";
const timeoutMs = Number(process.env.HOME_INSURANCE_FLOW_TEST_TIMEOUT_MS ?? 1_200_000);
const missingLiveConfig = ["OPENAI_API_KEY", "PICOFLOW_KEY"].filter((key) => !process.env[key]?.trim());
const shouldRunLive = missingLiveConfig.length === 0;
const skipReason = `Missing live HomeInsuranceQuoteFlow config: ${missingLiveConfig.join(", ")}`;

test(
  "HomeInsuranceQuoteFlow completes all 20 live conversation turns",
  { timeout: timeoutMs, skip: shouldRunLive ? false : skipReason },
  async () => {
    const app = await createApp();
    const server = app.getHttpAdapter().getInstance();
    let sessionId: string | undefined;
    const transcript: TranscriptTurn[] = [];
    try {
      for (const [index, turn] of scenario.turns.entries()) {
        console.log(`[HomeInsuranceQuoteFlow live] turn ${index + 1}/${scenario.turns.length}: ${turn.label}`);
        const response = await server.inject({
          method: "POST",
          url: "/ai/run",
          headers: { "content-type": "application/json", ...(sessionId ? { CHAT_SESSION_ID: sessionId } : {}) },
          payload: JSON.stringify({ message: turn.input, flowName: scenario.flowName }),
        });
        assert.equal(response.statusCode, 200, `POST /ai/run failed for ${turn.label}: ${response.payload}`);
        const body = JSON.parse(response.payload) as RunResponse;
        assert.equal(body.success, true, `${turn.label}: ${body.message}`);
        assert.ok(body.session, `${turn.label}: expected session id`);
        if (sessionId) assert.equal(body.session, sessionId, `${turn.label}: session id changed`);
        sessionId ??= body.session;
        assert.equal(body.completed, turn.completed, `${turn.label}: completed flag mismatch`);
        const transcriptTurn: TranscriptTurn = { ...turn, actualResponse: body.message };
        transcript.push(transcriptTurn);
        transcriptTurn.judge = await judgeResponse(turn, body);
        expectSemanticMatch(transcriptTurn, transcript);
        console.log(`[HomeInsuranceQuoteFlow live] response: ${preview(body.message)}`);
      }
      assert.ok(sessionId, "Expected a session id");
      await expectSessionState(app, sessionId);
    } finally {
      try { await app.get(FlowEngine).close(); } finally { await app.close(); }
    }
  },
);

async function createApp(): Promise<NestFastifyApplication> {
  const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  assert.ok(app.get(FlowEngine).getFlowNames().includes("HomeInsuranceQuoteFlow"));
  return app;
}

function loadScenario(): Scenario {
  const parsed = JSON.parse(readFileSync(scenarioPath, "utf8")) as Scenario;
  assert.equal(parsed.flowName, "HomeInsuranceQuoteFlow");
  assert.equal(parsed.turns.length, 20, "Live scenario must contain exactly 20 turns");
  for (const turn of parsed.turns) {
    assert.ok(turn.label && turn.input && turn.expectedResponse, "Every scenario turn requires a label, input, and expected response");
    assert.equal(typeof turn.completed, "boolean");
  }
  return parsed;
}

async function judgeResponse(turn: ScenarioTurn, response: RunResponse): Promise<JudgeResult> {
  const message = response.message?.replace(/\s+/g, " ").trim();
  assert.ok(message, `${turn.label}: expected a non-empty response`);
  const judged = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: judgeModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a strict but fair evaluator for a fictional home insurance quote flow.",
            "Compare the actual response with the expected semantic behavior, ignoring wording and harmless formatting differences.",
            "The test date is July 15, 2027 and the requested effective date is October 1, 2027.",
            "The workflow must treat eligibility and premiums as backend-owned, provide only preliminary non-binding estimates, and never claim coverage is bound.",
            "After option selection, it is acceptable to mention optional phone and property street address in addition to name and email; those optional fields must not be treated as a failure.",
            "Exact quote and comparison tables may contain deterministic amounts not listed in the expected description; accept them when internally coherent.",
            "A response that asks for the correct next-stage information MUST pass even when it does not verbally repeat, confirm, acknowledge, or say it recorded facts that the preceding tool call already saved. Never require a user-visible recording acknowledgement.",
            "Fail if the assistant asks for the wrong stage, loses accumulated facts, invents a premium before rating, fails the roof correction or deductible re-rate, or omits the requested final action.",
            "Return only JSON with pass boolean, score number from 0 to 1, reason string, missing string array, and contradictions string array.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify({ label: turn.label, input: turn.input, expected: turn.expectedResponse, actual: message }) },
      ],
    }),
  });
  if (!judged.ok) assert.fail(`${turn.label}: judge request failed: ${await judged.text()}`);
  const result = await judged.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = result.choices?.[0]?.message?.content;
  assert.ok(content, `${turn.label}: judge returned no content`);
  return JSON.parse(content) as JudgeResult;
}

function expectSemanticMatch(turn: TranscriptTurn, transcript: TranscriptTurn[]): void {
  const judge = turn.judge;
  assert.ok(judge, `${turn.label}: missing judge result`);
  const minScore = turn.minScore ?? scenario.judgeMinScore ?? 0.75;
  const passed = judge.score >= minScore;
  if (!passed) {
    writeFileSync(failureArtifactPath, JSON.stringify({ failedTurn: turn.label, judgeModel, minScore, transcript }, null, 2), "utf8");
  }
  assert.equal(passed, true, `${turn.label}: semantic judge failed\nscore=${judge.score}\nreason=${judge.reason}\nactual=${turn.actualResponse}\nartifact=${failureArtifactPath}`);
}

async function expectSessionState(app: NestFastifyApplication, sessionId: string): Promise<void> {
  const session = await app.get(FlowEngine).getFlowSession().fetchAll(sessionId);
  assert.equal(session.flow?.name, "HomeInsuranceQuoteFlow");
  assert.equal(session.runStatus, "completed");
  assert.equal(stepState(session.flow!, "QualificationStep").qualification.zip, "97205");
  assert.equal(stepState(session.flow!, "PropertyStep").property.roofAgeYears, 4);
  assert.equal(stepState(session.flow!, "CoverageStep").coverage.deductible, 5000);
  assert.equal(stepState(session.flow!, "RateQuoteStep").quoteResult.decision, "eligible");
  assert.equal(stepState(session.flow!, "PresentQuoteStep").selectedOption.id, "ENHANCED");
  assert.deepEqual(stepState(session.flow!, "ContactStep").contact, {
    consentToContact: true,
    name: "Jamie Rivera",
    email: "jamie.rivera@example.com",
    phone: null,
    propertyAddress: null,
  });
}

function stepState(flow: { steps?: Array<{ name?: string; state?: Record<string, any> }> }, name: string): Record<string, any> {
  const step = flow.steps?.find((candidate) => candidate.name === name);
  assert.ok(step, `Expected ${name} in session`);
  return step.state ?? {};
}

function preview(message?: string, maxLength = 220): string {
  const compact = message?.replace(/\s+/g, " ").trim() ?? "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}
