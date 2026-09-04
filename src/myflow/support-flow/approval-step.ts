import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType } from "@picoflow/core";
import { z } from "zod";
import { GenReceipt } from "./gen-receipt.js";
import { approvalInstructions, supportRole } from "./prompt/support-prompt.js";
import type { PendingRefund, RefundRecord } from "./support-types.js";
import { ReturnsStep } from "./returns-step.js";
import { TriageStep } from "./triage-step.js";

export class ApprovalStep extends Step {
  /**
   * Creates a conversational approval step for refunds that need customer confirmation.
   *
   * @param flow - The parent SupportFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Builds the prompt from the pending refund and its itemized quote table.
   *
   * @returns Formatted approval prompt text.
   */
  override getPrompt(): string {
    const pending = this.getState<PendingRefund>("pending");
    if (!pending) throw new Error("ApprovalStep requires a pending refund.");
    return `${supportRole}\n\n${approvalInstructions.replace("{{PENDING}}", JSON.stringify({ orderId: pending.request.orderId, lineIds: pending.request.lineIds, reason: pending.request.reason, reasons: pending.reasons })).replace("{{BREAKDOWN}}", GenReceipt.quoteTable(pending.quote))}`;
  }

  /**
   * Declares explicit confirmation and decline tool actions available to the model.
   *
   * @returns Array of tool specifications.
   */
  override defineTool(): ToolType[] {
    return [
      { name: "confirm_refund", description: "Commit the exact pending refund after clear customer confirmation.", schema: z.object({ confirmed: z.boolean() }) },
      { name: "decline_refund", description: "Abandon the pending refund and return to the returns specialist.", schema: z.object({ declined: z.boolean() }) },
    ];
  }

  /**
   * Commits a refund only after receiving an explicit customer confirmation, updating triage and returns state.
   *
   * @param args - Object with `confirmed` boolean flag.
   * @returns Tool response navigating to TriageStep on confirmation.
   */
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

  /**
   * Releases the pending refund hold and returns the conversation to the returns specialist.
   *
   * @param args - Object with `declined` boolean flag.
   * @returns Tool response navigating to ReturnsStep.
   */
  @Tool
  protected async decline_refund(args: { declined: boolean }): Promise<ToolResponseType> {
    if (!args.declined) return stay();
    this.removeState("pending"); this.saveState({ decidedAt: new Date().toISOString() });
    return go(ReturnsStep).withState({ lastDenial: [] });
  }
}

/**
 * Reads the pending refund from step state or throws an error if incomplete.
 *
 * @param step - Active ApprovalStep instance.
 * @returns PendingRefund data object.
 */
function requirePending(step: ApprovalStep): PendingRefund { const pending = step.getState<PendingRefund>("pending"); if (!pending) throw new Error("ApprovalStep requires a pending refund."); return pending; }

/**
 * Generates an RMA number for approved returns.
 *
 * @returns Formatted RMA string.
 */
function generateRma(): string { return `RMA-${Math.floor(100000 + Math.random() * 900000)}`; }
