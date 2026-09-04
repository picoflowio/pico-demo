import { Flow, LogicStep, go, type LogicResponseType } from "@picoflow/core";
import { OrderBook } from "./backend/order-book.js";
import { PolicyEngine } from "./backend/policy-engine.js";
import type { RefundRecord, ReturnRequest } from "./support-types.js";
import { ApprovalStep } from "./approval-step.js";
import { ReturnsStep } from "./returns-step.js";
import { TriageStep } from "./triage-step.js";

/** Applies policy and refund arithmetic without an LLM turn. */
export class AdjudicateStep extends LogicStep {
  constructor(flow: Flow) { super(flow); }
  override async runLogic(): Promise<LogicResponseType> {
    const request = this.getState<ReturnRequest>("request");
    if (!request) throw new Error("AdjudicateStep requires a return request.");
    const order = OrderBook.find(request.orderId);
    if (!order) throw new Error(`AdjudicateStep cannot load order '${request.orderId}'.`);
    const returned = this.flow.getStepState<string[]>(ReturnsStep, "returnedLineIds") ?? [];
    const adjudication = PolicyEngine.adjudicate(order, request.lineIds, request.reason, returned);
    this.saveState({ decision: adjudication.decision, adjudication });
    if (adjudication.decision === "deny") return go(ReturnsStep).withState({ lastDenial: adjudication.reasons });
    if (!adjudication.quote) throw new Error("Eligible adjudication requires a refund quote.");
    if (adjudication.decision === "review") return go(ApprovalStep).withState({ pending: { request, quote: adjudication.quote, reasons: adjudication.reasons } });
    const refund: RefundRecord = { rma: generateRma(), orderId: order.orderId, lineIds: request.lineIds, netRefund: adjudication.quote.netRefund, refundTarget: adjudication.quote.refundTarget, authority: "agent" };
    const refunds = this.flow.getStepState<RefundRecord[]>(TriageStep, "refunds") ?? [];
    this.flow.saveStepState(ReturnsStep, { returnedLineIds: [...returned, ...request.lineIds] });
    return go(TriageStep).withState({ refunds: [...refunds, refund] });
  }
}
function generateRma() { return `RMA-${Math.floor(100000 + Math.random() * 900000)}`; }
