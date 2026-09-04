import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType } from "@picoflow/core";
import { z } from "zod";
import { GenReceipt } from "./gen-receipt.js";
import { OrderBook } from "./backend/order-book.js";
import { billingInstructions, supportRole } from "./prompt/support-prompt.js";
import type { BillingDispute, VerifiedOrder } from "./support-types.js";
import { EscalateStep } from "./escalate-step.js";
import { TriageStep } from "./triage-step.js";

export class BillingStep extends Step {
  /**
   * Creates the billing specialist step attached to the current support flow.
   *
   * @param flow - The parent SupportFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Builds the billing prompt with the verified order, charge ledger, and detected duplicate charges.
   *
   * @returns Formatted billing system prompt string.
   */
  override getPrompt(): string {
    const order = requireOrder(this.flow);
    return `${supportRole}\n\n${billingInstructions.replace("{{ORDER}}", JSON.stringify({ orderId: order.orderId, placedAt: order.placedAt, paymentMethod: order.paymentMethod })).replace("{{CHARGES}}", JSON.stringify(OrderBook.find(order.orderId)?.charges ?? [])).replace("{{DUPLICATES}}", JSON.stringify(OrderBook.duplicateCharges(OrderBook.find(order.orderId)!)))}`;
  }

  /**
   * Declares actions for opening a validated dispute or leaving billing support.
   *
   * @returns Array of tool specifications.
   */
  override defineTool(): ToolType[] {
    return [
      { name: "open_dispute", description: "Record validated disputed charges and open a billing ticket.", schema: z.object({ chargeIds: z.array(z.string().min(1)).min(1), description: z.string().min(1), amountInDispute: z.number() }) },
      { name: "end_billing_request", description: "Return to the main support agent.", schema: z.object({ done: z.boolean() }) },
    ];
  }

  /**
   * Detects a complete dispute in natural language before falling back to normal model handling.
   *
   * @param llmResult - Model generation output.
   * @returns Escalation navigation or default response handling.
   */
  public override async onResponse(llmResult: string | object) {
    const dispute = this.inferDispute();
    if (dispute) return this.routeToEscalation(dispute);
    return super.onResponse(llmResult);
  }

  /**
   * Validates disputed charge IDs against order charges, recalculates disputed total, and routes to escalation.
   *
   * @param args - Tool invocation arguments containing charge IDs, dispute description, and disputed amount.
   * @returns Navigation response advancing to EscalateStep.
   */
  @Tool
  protected async open_dispute(args: { chargeIds: string[]; description: string; amountInDispute: number }): Promise<ToolResponseType> {
    const order = OrderBook.find(requireOrder(this.flow).orderId)!;
    const ledger = new Map(order.charges.map((charge) => [charge.chargeId.toUpperCase(), charge]));
    const ids = [...new Set(args.chargeIds.map((id) => id.trim().toUpperCase()))];
    const unknown = ids.filter((id) => !ledger.has(id));
    if (unknown.length) return stay(`These charges are not on order ${order.orderId}: ${unknown.join(", ")}.`);
    const amountInDispute = round(ids.reduce((sum, id) => sum + (ledger.get(id)?.amount ?? 0), 0));
    const dispute: BillingDispute = { orderId: order.orderId, chargeIds: ids, description: args.description.trim(), amountInDispute };
    const response = this.routeToEscalation(dispute);
    return round(args.amountInDispute) === amountInDispute
      ? response.withToolFeedback("Dispute accepted.")
      : response.withToolFeedback(`The disputed total was corrected to ${GenReceipt.formatCurrency(amountInDispute)} from the order ledger.`);
  }

  /**
   * Returns to triage when billing is complete, unless a pending dispute was detected.
   *
   * @param args - Object with `done` boolean flag.
   * @returns Tool response navigating to TriageStep or staying.
   */
  @Tool
  protected async end_billing_request(args: { done: boolean }): Promise<ToolResponseType> {
    const dispute = this.inferDispute();
    if (dispute) return this.routeToEscalation(dispute);
    return args.done ? go(TriageStep) : stay();
  }

  /**
   * Saves the dispute in state and transfers control to the deterministic escalation worker.
   *
   * @param dispute - BillingDispute details.
   * @returns Navigation response to EscalateStep.
   */
  private routeToEscalation(dispute: BillingDispute) {
    this.saveState({ dispute });
    return go(EscalateStep).withState({ dispute });
  }

  /**
   * Extracts charge IDs and computes the disputed amount from customer text and the order ledger.
   *
   * @returns BillingDispute object or undefined if not detected.
   */
  private inferDispute(): BillingDispute | undefined {
    const text = this.latestCustomerText();
    const order = OrderBook.find(requireOrder(this.flow).orderId)!;
    const ledger = new Map(order.charges.map((charge) => [charge.chargeId.toUpperCase(), charge]));
    const chargeIds = [...new Set((text.match(/\bCH-\d+\b/gi) ?? []).map((id) => id.toUpperCase()))];
    if (chargeIds.length === 0 || chargeIds.some((id) => !ledger.has(id))) return undefined;
    const amountInDispute = round(chargeIds.reduce((sum, id) => sum + (ledger.get(id)?.amount ?? 0), 0));
    return { orderId: order.orderId, chargeIds, description: text.trim(), amountInDispute };
  }

  /**
   * Returns the latest customer message as plain text for deterministic parsing.
   *
   * @returns Plain string message text.
   */
  private latestCustomerText(): string {
    const content = this.getLastMessage()?.content;
    return typeof content === "string" ? content : "";
  }
}

/**
 * Loads the verified order shared by the triage and specialist steps.
 *
 * @param flow - Flow instance containing step state.
 * @returns VerifiedOrder object.
 * @throws Error if order has not been verified yet.
 */
function requireOrder(flow: Flow): VerifiedOrder { const order = flow.getStepState<VerifiedOrder>(TriageStep, "order"); if (!order) throw new Error("BillingStep requires a verified order from TriageStep."); return order; }

/**
 * Rounds a numeric currency amount to two decimal places (cents).
 *
 * @param value - Floating point number.
 * @returns Rounded number.
 */
function round(value: number): number { return Math.round(value * 100) / 100; }
