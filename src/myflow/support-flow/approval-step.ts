import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType } from "@picoflow/core";
import { z } from "zod";
import { GenReceipt } from "./gen-receipt.js";
import { approvalInstructions, supportRole } from "./prompt/support-prompt.js";
import type { PendingRefund, RefundRecord } from "./support-types.js";
import { ReturnsStep } from "./returns-step.js";
import { TriageStep } from "./triage-step.js";

export class ApprovalStep extends Step {
  constructor(flow: Flow) { super(flow); }
  override getPrompt(): string {
    const pending = this.getState<PendingRefund>("pending");
    if (!pending) throw new Error("ApprovalStep requires a pending refund.");
    return `${supportRole}\n\n${approvalInstructions.replace("{{PENDING}}", JSON.stringify({ orderId: pending.request.orderId, lineIds: pending.request.lineIds, reason: pending.request.reason, reasons: pending.reasons })).replace("{{BREAKDOWN}}", GenReceipt.quoteTable(pending.quote))}`;
  }
  override defineTool(): ToolType[] {
    return [
      { name: "confirm_refund", description: "Commit the exact pending refund after clear customer confirmation.", schema: z.object({ confirmed: z.boolean() }) },
      { name: "decline_refund", description: "Abandon the pending refund and return to the returns specialist.", schema: z.object({ declined: z.boolean() }) },
    ];
  }
  @Tool
  protected async confirm_refund(args: { confirmed: boolean }): Promise<ToolResponseType> {
    if (!args.confirmed) return stay("Only an explicit confirmation commits this refund.");
    const pending = requirePending(this);
    const refund: RefundRecord = { rma: generateRma(), orderId: pending.request.orderId, lineIds: pending.request.lineIds, netRefund: pending.quote.netRefund, refundTarget: pending.quote.refundTarget, authority: "customer_confirmed" };
    const triage = this.flow.getStepState<RefundRecord[]>(TriageStep, "refunds") ?? [];
    const returned = this.flow.getStepState<string[]>(ReturnsStep, "returnedLineIds") ?? [];
    this.flow.saveStepState(TriageStep, { refunds: [...triage, refund] });
    this.flow.saveStepState(ReturnsStep, { returnedLineIds: [...returned, ...pending.request.lineIds] });
    this.removeState("pending"); this.saveState({ decidedAt: new Date().toISOString() });
    return go(TriageStep);
  }
  @Tool
  protected async decline_refund(args: { declined: boolean }): Promise<ToolResponseType> {
    if (!args.declined) return stay();
    this.removeState("pending"); this.saveState({ decidedAt: new Date().toISOString() });
    return go(ReturnsStep).withState({ lastDenial: [] });
  }
}
function requirePending(step: ApprovalStep): PendingRefund { const pending = step.getState<PendingRefund>("pending"); if (!pending) throw new Error("ApprovalStep requires a pending refund."); return pending; }
function generateRma() { return `RMA-${Math.floor(100000 + Math.random() * 900000)}`; }
