import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType } from "@picoflow/core";
import { z } from "zod";
import { GenReceipt } from "./gen-receipt.js";
import { OrderBook } from "./backend/order-book.js";
import { billingInstructions, supportRole } from "./prompt/support-prompt.js";
import type { BillingDispute, VerifiedOrder } from "./support-types.js";
import { EscalateStep } from "./escalate-step.js";
import { TriageStep } from "./triage-step.js";

export class BillingStep extends Step {
  constructor(flow: Flow) { super(flow); }
  override getPrompt(): string {
    const order = requireOrder(this.flow);
    return `${supportRole}\n\n${billingInstructions.replace("{{ORDER}}", JSON.stringify({ orderId: order.orderId, placedAt: order.placedAt, paymentMethod: order.paymentMethod })).replace("{{CHARGES}}", JSON.stringify(OrderBook.find(order.orderId)?.charges ?? [])).replace("{{DUPLICATES}}", JSON.stringify(OrderBook.duplicateCharges(OrderBook.find(order.orderId)!)))}`;
  }
  override defineTool(): ToolType[] {
    return [
      { name: "open_dispute", description: "Record validated disputed charges and open a billing ticket.", schema: z.object({ chargeIds: z.array(z.string().min(1)).min(1), description: z.string().min(1), amountInDispute: z.number() }) },
      { name: "end_billing_request", description: "Return to the main support agent.", schema: z.object({ done: z.boolean() }) },
    ];
  }
  public override async onResponse(llmResult: string | object) {
    const dispute = this.inferDispute();
    if (dispute) return this.routeToEscalation(dispute);
    return super.onResponse(llmResult);
  }
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
  @Tool
  protected async end_billing_request(args: { done: boolean }): Promise<ToolResponseType> {
    const dispute = this.inferDispute();
    if (dispute) return this.routeToEscalation(dispute);
    return args.done ? go(TriageStep) : stay();
  }

  private routeToEscalation(dispute: BillingDispute) {
    this.saveState({ dispute });
    return go(EscalateStep).withState({ dispute });
  }

  private inferDispute(): BillingDispute | undefined {
    const text = this.latestCustomerText();
    const order = OrderBook.find(requireOrder(this.flow).orderId)!;
    const ledger = new Map(order.charges.map((charge) => [charge.chargeId.toUpperCase(), charge]));
    const chargeIds = [...new Set((text.match(/\bCH-\d+\b/gi) ?? []).map((id) => id.toUpperCase()))];
    if (chargeIds.length === 0 || chargeIds.some((id) => !ledger.has(id))) return undefined;
    const amountInDispute = round(chargeIds.reduce((sum, id) => sum + (ledger.get(id)?.amount ?? 0), 0));
    return { orderId: order.orderId, chargeIds, description: text.trim(), amountInDispute };
  }

  private latestCustomerText(): string {
    const content = this.getLastMessage()?.content;
    return typeof content === "string" ? content : "";
  }
}
function requireOrder(flow: Flow): VerifiedOrder { const order = flow.getStepState<VerifiedOrder>(TriageStep, "order"); if (!order) throw new Error("BillingStep requires a verified order from TriageStep."); return order; }
function round(value: number) { return Math.round(value * 100) / 100; }
