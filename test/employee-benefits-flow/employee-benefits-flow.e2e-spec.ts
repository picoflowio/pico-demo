import "dotenv/config";

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, test } from "node:test";
import { Test as NestTest } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { FlowEngine } from "@picoflow/core";
import { AppModule } from "../../src/app.module.js";
import { BenefitsPolicy } from "../../src/myflow/employee-benefits-flow/backend/benefits-policy.js";
import { BenefitsPresenter } from "../../src/myflow/employee-benefits-flow/backend/benefits-presenter.js";
import type {
  AncillaryElection,
  CarePreferences,
  EnrollmentApplication,
  EnrollmentRequest,
  Household,
} from "../../src/myflow/employee-benefits-flow/employee-benefits-types.js";

type RunResponse = { success?: boolean; completed?: boolean; message?: string; session?: string };
type ScenarioTurn = { label: string; input: string; expectedResponse: string; completed: boolean; minScore?: number };
type Scenario = { flowName: string; judgeModel?: string; judgeMinScore?: number; turns: ScenarioTurn[] };
type JudgeResult = { pass: boolean; score: number; reason: string; missing?: string[]; contradictions?: string[] };
type TranscriptTurn = ScenarioTurn & { actualResponse?: string; judge?: JudgeResult };

const testDate = new Date("2026-11-05T00:00:00.000Z");
process.env.EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE ??= testDate.toISOString();

const request: EnrollmentRequest = { employeeId: "E-1042", planYear: 2027, eventType: "open_enrollment", eventDate: null };
const household: Household = {
  coverageTier: "family",
  dependents: [
    { name: "Morgan Rivera", relationship: "spouse", birthDate: "1987-03-12" },
    { name: "Sam Rivera", relationship: "child", birthDate: "2018-04-10" },
    { name: "Riley Rivera", relationship: "child", birthDate: "2010-09-03" },
  ],
  spouseHasOtherMedicalCoverage: true,
};
const preferences: CarePreferences = {
  anticipatedUse: "moderate",
  prescriptionUse: "regular",
  networkPreference: "out_of_network_flexibility",
  priorities: ["hsa_savings", "prescription_coverage", "out_of_network_access"],
};
const ancillaryElection: AncillaryElection = {
  dentalPlan: "premium",
  visionPlan: "standard",
  supplementalLifeMultiple: 3,
  shortTermDisability: true,
  longTermDisability: true,
};

describe("EmployeeBenefitsFlow deterministic policy", () => {
  it("owns employee eligibility and enrollment windows in code", () => {
    const eligible = BenefitsPolicy.evaluateEligibility(request, testDate);
    assert.equal(eligible.eligible, true);
    assert.equal(eligible.employee?.name, "Alex Rivera");
    assert.equal(eligible.enrollmentDeadline, "2026-11-20");

    const lowHours = BenefitsPolicy.evaluateEligibility({ ...request, employeeId: "E-2040" }, testDate);
    assert.equal(lowHours.eligible, false);
    assert.ok(lowHours.reasonCodes.includes("MINIMUM_HOURS_NOT_MET"));

    const closed = BenefitsPolicy.evaluateEligibility(request, new Date("2026-12-01T00:00:00.000Z"));
    assert.equal(closed.eligible, false);
    assert.ok(closed.reasonCodes.includes("OPEN_ENROLLMENT_CLOSED"));
  });

  it("calculates exact medical options and provider status without an LLM", () => {
    const decision = BenefitsPolicy.evaluateEligibility(request, testDate);
    assert.equal(BenefitsPolicy.validateHousehold(household, 2027), null);
    const evaluation = BenefitsPolicy.evaluateMedicalPlans(household, preferences, decision.employee!, 2027);
    assert.deepEqual(evaluation.options.map((option) => option.id), ["EPO_VALUE", "HDHP_HSA", "PPO_STANDARD"]);
    assert.deepEqual(evaluation.options.map((option) => option.employeePremiumPerPayPeriod), [155, 125, 220]);
    assert.equal(evaluation.recommendedPlanId, "HDHP_HSA");
    const valueEpo = evaluation.options.find((option) => option.id === "EPO_VALUE")!;
    const hdhp = evaluation.options.find((option) => option.id === "HDHP_HSA")!;
    const providerResult = BenefitsPolicy.providerNetwork(valueEpo, "Dr. Maya Chen");
    assert.equal(providerResult.inNetwork, false);
    assert.match(providerResult.message, /Value EPO/);
    assert.doesNotMatch(providerResult.message, /EPO_VALUE/);
    assert.equal(BenefitsPolicy.providerNetwork(hdhp, "Dr. Maya Chen").inNetwork, true);
    assert.match(BenefitsPresenter.medicalPlans(evaluation), /fictional demo terms/i);
    const comparison = BenefitsPresenter.compareMedicalPlans(evaluation.options.filter((option) => option.id !== "EPO_VALUE"));
    assert.match(comparison, /HSA \/ employer funding/);
    assert.match(comparison, /Yes \/ \$1,500\.00/);
    const dependentCareExplanation = BenefitsPresenter.dependentCareExplanation();
    assert.match(dependentCareExplanation, /separate from a healthcare FSA/i);
    assert.match(dependentCareExplanation, /\$5,000 annual demo limit/i);
    assert.match(dependentCareExplanation, /elect an annual contribution amount or waive/i);
  });

  it("rejects limit violations and records pending coverage deterministically", () => {
    const eligibility = BenefitsPolicy.evaluateEligibility(request, testDate);
    const planEvaluation = BenefitsPolicy.evaluateMedicalPlans(household, preferences, eligibility.employee!, 2027);
    const selectedMedicalPlan = planEvaluation.options.find((option) => option.id === "HDHP_HSA")!;
    const excessiveHsa = BenefitsPolicy.evaluateHealthAccount(selectedMedicalPlan, household.coverageTier, { accountType: "hsa", employeeAnnualContribution: 8000 });
    assert.equal(excessiveHsa.accepted, false);
    assert.equal(excessiveHsa.combinedContribution, 9500);
    const healthAccount = { accountType: "hsa", employeeAnnualContribution: 5500 } as const;
    const healthAccountResult = BenefitsPolicy.evaluateHealthAccount(selectedMedicalPlan, household.coverageTier, healthAccount);
    assert.equal(healthAccountResult.accepted, true);

    const ancillary = BenefitsPolicy.quoteAncillary(ancillaryElection, eligibility.employee!, household.coverageTier);
    assert.equal(ancillary.employeePremiumPerPayPeriod, 86.86);
    assert.deepEqual(ancillary.pendingRequirements, ["EVIDENCE_OF_INSURABILITY"]);

    const excessiveDependentCare = BenefitsPolicy.evaluateDependentCare(household, { annualContribution: 6000 }, 2027);
    assert.equal(excessiveDependentCare.accepted, false);
    const dependentCare = { annualContribution: 3000 };
    const dependentCareResult = BenefitsPolicy.evaluateDependentCare(household, dependentCare, 2027);
    assert.equal(dependentCareResult.accepted, true);
    assert.deepEqual(dependentCareResult.eligibleDependentNames, ["Sam Rivera"]);

    const application: EnrollmentApplication = {
      request,
      eligibility,
      household,
      preferences,
      planEvaluation,
      selectedMedicalPlan,
      healthAccount,
      healthAccountResult,
      ancillary,
      beneficiaries: { beneficiaries: [
        { name: "Morgan Rivera", relationship: "spouse", percentage: 70 },
        { name: "Sam Rivera", relationship: "child", percentage: 30 },
      ] },
      dependentCare,
      dependentCareResult,
    };
    const record = BenefitsPolicy.createEnrollment(application, testDate);
    assert.match(record.enrollmentId, /^BEN-2027-[A-F0-9]{10}$/);
    assert.equal(record.status, "submitted_with_pending_requirements");
    assert.equal(record.totalPayrollDeductionPerPayPeriod, 566.03);
    assert.deepEqual(BenefitsPolicy.createEnrollment(application, testDate), record);
  });
});

const sqlitePath = join(process.cwd(), "test", ".tmp", "employee-benefits-flow-session.sqlite");
const useEnvironmentDocumentStore = process.env.EMPLOYEE_BENEFITS_FLOW_TEST_USE_ENV === "1";
if (!useEnvironmentDocumentStore) {
  process.env.DOCUMENT_DB = "SQLITE";
  process.env.SESSION_STORE = "SQLITE";
  process.env.SQLITE_PATH = process.env.EMPLOYEE_BENEFITS_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
}
if ((process.env.DOCUMENT_DB ?? "SQLITE").toUpperCase() === "SQLITE") {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}
process.env.GEMINI_API_KEY ??= "unused-in-employee-benefits-flow-test";
process.env.ANTHROPIC_API_KEY ??= "unused-in-employee-benefits-flow-test";
process.env.MONGODB_NAME ??= "unused-in-employee-benefits-flow-test";
process.env.MONGODB_COLLECTION ??= "unused-in-employee-benefits-flow-test";
process.env.MONGODB_URL ??= "mongodb://unused-in-employee-benefits-flow-test";

const scenarioPath = join(process.cwd(), "test", "employee-benefits-flow", "employee-benefits-flow.scenario.json");
const failureArtifactPath = join(process.cwd(), "test", ".tmp", "employee-benefits-flow-semantic-failure.json");
const liveTranscriptPath = join(process.cwd(), "test", ".tmp", "employee-benefits-flow-live-transcript.json");
const scenario = loadScenario();
const judgeModel = process.env.EMPLOYEE_BENEFITS_FLOW_JUDGE_MODEL ?? scenario.judgeModel ?? "gpt-4o";
const timeoutMs = Number(process.env.EMPLOYEE_BENEFITS_FLOW_TEST_TIMEOUT_MS ?? 1_200_000);
const missingLiveConfig = ["OPENAI_API_KEY", "PICOFLOW_KEY"].filter((key) => !process.env[key]?.trim());
const shouldRunLive = process.env.RUN_LIVE_EMPLOYEE_BENEFITS_FLOW_TEST !== "0" && missingLiveConfig.length === 0;
const skipReason = process.env.RUN_LIVE_EMPLOYEE_BENEFITS_FLOW_TEST === "0"
  ? "RUN_LIVE_EMPLOYEE_BENEFITS_FLOW_TEST=0"
  : `Missing live EmployeeBenefitsFlow config: ${missingLiveConfig.join(", ")}`;

test(
  "EmployeeBenefitsFlow completes all 22 live conversation turns",
  { timeout: timeoutMs, skip: shouldRunLive ? false : skipReason },
  async () => {
    const app = await createApp();
    const server = app.getHttpAdapter().getInstance();
    let sessionId: string | undefined;
    const transcript: TranscriptTurn[] = [];
    try {
      for (const [index, turn] of scenario.turns.entries()) {
        console.log(`[EmployeeBenefitsFlow live] turn ${index + 1}/${scenario.turns.length}: ${turn.label}`);
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
        console.log(`[EmployeeBenefitsFlow live] response: ${preview(body.message)}`);
      }
      assert.ok(sessionId, "Expected a session id");
      await expectSessionState(app, sessionId);
      writeFileSync(liveTranscriptPath, JSON.stringify({
        flowName: scenario.flowName,
        testDate: testDate.toISOString(),
        judgeModel,
        turns: transcript,
      }, null, 2), "utf8");
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
  assert.ok(app.get(FlowEngine).getFlowNames().includes("EmployeeBenefitsFlow"));
  return app;
}

function loadScenario(): Scenario {
  const parsed = JSON.parse(readFileSync(scenarioPath, "utf8")) as Scenario;
  assert.equal(parsed.flowName, "EmployeeBenefitsFlow");
  assert.equal(parsed.turns.length, 22, "Live scenario must contain exactly 22 turns");
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
            "You are a strict but fair evaluator for a fictional employee benefits enrollment flow.",
            "Compare the actual response with expected semantic behavior, ignoring wording and harmless formatting differences.",
            "The test date is November 5, 2026 and plan year is 2027.",
            "Eligibility, plan terms, network status, limits, prices, allocations, pending requirements, and submission are backend-owned.",
            "A response that asks for the correct next-stage information MUST pass even when it does not verbally repeat, confirm, acknowledge, or say it recorded facts that the preceding tool call already validated and saved.",
            "Never require a user-visible recording acknowledgement, including after an accepted HSA or dependent-care contribution, beneficiary allocation, plan selection, or other successful tool transition.",
            "When beneficiary allocations total less than 100 percent, both recovery paths are valid: redistributing the existing beneficiaries or adding another beneficiary for the remainder. Do not require one specific correction strategy.",
            "Exact code-rendered tables can contain coherent deterministic detail beyond the expected summary.",
            "Fail if the assistant asks for diagnoses, medication names, government IDs, payment details, invents policy, loses elections, accepts invalid limits or beneficiary totals, marks pending life coverage approved, or claims submission before confirmation.",
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
  if (!passed) writeFileSync(failureArtifactPath, JSON.stringify({ failedTurn: turn.label, judgeModel, minScore, transcript }, null, 2), "utf8");
  assert.equal(passed, true, `${turn.label}: semantic judge failed\nscore=${judge.score}\nreason=${judge.reason}\nactual=${turn.actualResponse}\nartifact=${failureArtifactPath}`);
}

async function expectSessionState(app: NestFastifyApplication, sessionId: string): Promise<void> {
  const session = await app.get(FlowEngine).getFlowSession().fetchAll(sessionId);
  assert.equal(session.flow?.name, "EmployeeBenefitsFlow");
  assert.equal(session.runStatus, "completed");
  assert.equal(stepState(session.flow!, "EligibilityStep").request.employeeId, "E-1042");
  assert.equal(stepState(session.flow!, "HouseholdStep").household.coverageTier, "family");
  assert.equal(stepState(session.flow!, "PlanEvaluationStep").evaluation.recommendedPlanId, "HDHP_HSA");
  assert.equal(stepState(session.flow!, "MedicalPlanStep").selectedPlan.id, "HDHP_HSA");
  assert.equal(stepState(session.flow!, "HealthAccountStep").election.employeeAnnualContribution, 5500);
  assert.deepEqual(stepState(session.flow!, "AncillaryBenefitsStep").quote.pendingRequirements, ["EVIDENCE_OF_INSURABILITY"]);
  assert.deepEqual(stepState(session.flow!, "BeneficiaryStep").election.beneficiaries.map((item: { percentage: number }) => item.percentage), [70, 30]);
  assert.equal(stepState(session.flow!, "DependentCareStep").election.annualContribution, 3000);
  assert.equal(stepState(session.flow!, "CommitEnrollmentStep").enrollmentRecord.status, "submitted_with_pending_requirements");
  assert.equal(stepState(session.flow!, "CommitEnrollmentStep").enrollmentRecord.totalPayrollDeductionPerPayPeriod, 566.03);
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
