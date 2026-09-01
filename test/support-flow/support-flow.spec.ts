import "dotenv/config";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FlowEngine, MemorySessionStore, ModelProvider } from "@picoflow/core";
import { OrderBook } from "../../src/myflow/support-flow/backend/order-book.js";
import { PolicyEngine } from "../../src/myflow/support-flow/backend/policy-engine.js";
import { GenReceipt } from "../../src/myflow/support-flow/gen-receipt.js";
import { SupportFlow } from "../../src/myflow/support-flow/support-flow.js";

process.env.SUPPORT_FLOW_CURRENT_DATE ??= "2027-07-15T00:00:00.000Z";

describe("SupportFlow deterministic services", () => {
  it("loads the complete PicoFlow definition", () => {
    assert.ok(new SupportFlow() instanceof SupportFlow);
  });
  it("requires confirmation for a refund over the agent authority limit", () => {
    const order = OrderBook.find("NW-100412")!;
    const result = PolicyEngine.adjudicate(order, ["L1"], "too_large");
    assert.equal(result.decision, "review");
    assert.equal(result.quote?.netRefund, 289);
    assert.match(GenReceipt.quoteTable(result.quote!), /\$289\.00/);
  });
  it("auto-approves an eligible refund within authority", () => {
    const order = OrderBook.find("NW-100412")!;
    const result = PolicyEngine.adjudicate(order, ["L2"], "no_longer_needed");
    assert.equal(result.decision, "auto");
    assert.equal(result.quote?.netRefund, 136);
  });
  it("denies an out-of-window return and derives duplicate charge totals from the ledger", () => {
    const expired = PolicyEngine.adjudicate(OrderBook.find("NW-100236")!, ["L1"], "no_longer_needed");
    assert.equal(expired.decision, "deny");
    assert.match(expired.reasons[0]!, /60-day apparel return window/);
    const duplicateOrder = OrderBook.find("NW-100517")!;
    assert.deepEqual(OrderBook.duplicateCharges(duplicateOrder).map((charge) => charge.chargeId), ["CH-88422", "CH-88423"]);
    assert.equal(duplicateOrder.charges.reduce((total, charge) => total + charge.amount, 0), 858);
  });
});

const missingLiveConfig = ["OPENAI_API_KEY", "PICOFLOW_KEY"].filter(
  (key) => !process.env[key]?.trim(),
);
const runLive = missingLiveConfig.length === 0;
const liveSkipReason = `Missing live SupportFlow config: ${missingLiveConfig.join(", ")}`;

type Scenario = {
  flowName: string;
  turns: { label: string; input: string; expectedResponse: string; completed: boolean; minScore?: number }[];
};
const scenario = JSON.parse(readFileSync(join(process.cwd(), "test", "support-flow", "support-flow.scenario.json"), "utf8")) as Scenario;
assert.equal(scenario.flowName, "SupportFlow");
assert.equal(scenario.turns.length, 9);

it(
  "runs the full SupportFlow turn-by-turn scenario",
  { skip: runLive ? false : liveSkipReason },
  async () => {
    const engine = await FlowEngine.create({
      flows: [SupportFlow],
      sessionStore: new MemorySessionStore(),
      providers: ModelProvider.createBuiltinAdapters({
        openai: { apiKey: process.env.OPENAI_API_KEY },
      }),
    });
    let sessionId: string | undefined;
    try {
      const send = async (userMessage: string) => {
        const response = await engine.run({ flowName: "SupportFlow", userMessage, sessionId });
        assert.equal(response.success, true, response.message);
        sessionId = response.session;
        return response;
      };

      for (const [index, turn] of scenario.turns.entries()) {
        console.log(`[SupportFlow E2E] turn ${index + 1}/${scenario.turns.length}: ${turn.label}`);
        const response = await send(turn.input);
        assert.equal(response.completed, turn.completed, `${turn.label}: completed flag mismatch`);
        assert.ok(response.message?.trim(), `${turn.label}: expected a non-empty response`);
        console.log(`[SupportFlow E2E] response: ${response.message?.replace(/\s+/g, " ").slice(0, 180)}`);
      }

      const completed = await engine.getFlowSession().fetchAll(sessionId!);
      assert.equal(completed?.runStatus, "completed");
      assert.equal(completed?.flow.currentStep, "TerminateSessionStep");
      const triage = completed?.flow.steps.find((step) => step.name === "TriageStep");
      const returns = completed?.flow.steps.find((step) => step.name === "ReturnsStep");
      const billing = completed?.flow.steps.find((step) => step.name === "BillingStep");
      assert.equal((triage?.state as any)?.order?.orderId, "NW-100412");
      assert.equal((triage?.state as any)?.refunds?.length, 1);
      assert.equal((triage?.state as any)?.refunds?.[0]?.netRefund, 136);
      assert.match((triage?.state as any)?.refunds?.[0]?.rma ?? "", /^RMA-\d{6}$/);
      assert.deepEqual((returns?.state as any)?.returnedLineIds, ["L2"]);
      assert.equal((billing?.state as any)?.dispute?.amountInDispute, 439.95);
      const tickets = (triage?.state as any)?.tickets ?? [];
      assert.equal(tickets.length, 1);
      assert.match(tickets[0]?.ticketId ?? "", /^ESC-\d{5}$/);
      assert.equal(tickets[0]?.amountInDispute, 439.95);
    } finally {
      await engine.close();
    }
  },
);
