import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType, TerminateSessionStep } from "@picoflow/core";
import { z } from "zod";
import { OrderBook, type Order } from "./backend/order-book.js";
import { GenReceipt } from "./gen-receipt.js";
import { supportRole, triageInstructions } from "./prompt/support-prompt.js";
import type { EscalationTicket, RefundRecord, VerifiedOrder } from "./support-types.js";
import { ReturnsStep } from "./returns-step.js";
import { BillingStep } from "./billing-step.js";

export class TriageStep extends Step {
  /**
   * Creates the support hub that verifies orders and routes customer requests.
   *
   * @param flow - The parent SupportFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Builds the hub prompt from the verified order and committed case outcomes.
   *
   * @returns Formatted triage system prompt.
   */
  override getPrompt(): string {
    const order = this.getState<VerifiedOrder>("order") ?? null;
    return `${supportRole}\n\n${triageInstructions.replace("{{TODAY}}", new Date().toISOString().slice(0, 10)).replace("{{ORDER}}", JSON.stringify(order)).replace("{{CASE}}", JSON.stringify({ refunds: this.getState<RefundRecord[]>("refunds") ?? [], tickets: this.getState<EscalationTicket[]>("tickets") ?? [] }))}`;
  }

  /**
   * Declares order verification, specialist routing, and case-closing actions.
   *
   * @returns Array of tool definitions for triage.
   */
  override defineTool(): ToolType[] {
    return [
      { name: "verify_order", description: "Verify an order with its email address or ZIP code.", schema: z.object({ orderId: z.string().min(1), secret: z.string().min(1) }) },
      { name: "route_request", description: "Route a verified request to a support specialist.", schema: z.object({ department: z.enum(["returns", "billing"]) }) },
      { name: "close_case", description: "Close a case with committed outcomes.", schema: z.object({ summary: z.string().min(1) }) },
    ];
  }

  /**
   * Verifies the customer secret and stores a safe summary for downstream steps.
   *
   * @param args - Object containing `orderId` and verification `secret`.
   * @returns Tool response staying in triage with verified order summary or error notice.
   */
  @Tool
  protected async verify_order(args: { orderId: string; secret: string }): Promise<ToolResponseType> {
    const order = OrderBook.verify(args.orderId, args.secret);
    if (!order) { this.saveState({ verifyAttempts: (this.getState<number>("verifyAttempts") ?? 0) + 1 }); return stay("That order number and email or ZIP code do not match. Ask the customer to check both."); }
    const verified = summarizeOrder(order);
    this.saveState({ order: verified, verifyAttempts: 0 });
    return stay(JSON.stringify({ accepted: true, order: verified }));
  }

  /**
   * Routes a verified request while preserving the message that initiated the route.
   *
   * @param args - Object specifying destination department ('returns' or 'billing').
   * @returns Navigation response to ReturnsStep or BillingStep.
   */
  @Tool
  protected async route_request(args: { department: "returns" | "billing" }): Promise<ToolResponseType> {
    if (!this.getState<VerifiedOrder>("order")) return stay("Verify the order before routing the request.");
    // Each specialist has its own memory space. Preserve the customer request
    // that caused routing so it can collect only the missing detail instead of
    // asking them to repeat the item or charge.
    const request = this.getLastMessage();
    const target = args.department === "returns" ? go(ReturnsStep) : go(BillingStep);
    return request ? target.withMessage(request) : target;
  }

  /**
   * Closes the case only when at least one refund or escalation outcome is committed.
   *
   * @param args - Case closure summary text.
   * @returns Navigation response transitioning to TerminateSessionStep with case recap.
   */
  @Tool
  protected async close_case(args: { summary: string }): Promise<ToolResponseType> {
    const refunds = this.getState<RefundRecord[]>("refunds") ?? [];
    const tickets = this.getState<EscalationTicket[]>("tickets") ?? [];
    if (!refunds.length && !tickets.length) return stay("Nothing has been committed on this case yet.");
    const outcomes = [...refunds.map((refund) => `- RMA ${refund.rma}: ${GenReceipt.formatCurrency(refund.netRefund)} refunded to ${refund.refundTarget}.`), ...tickets.map((ticket) => `- Ticket ${ticket.ticketId} (${ticket.category}) is with the billing team.`)];
    return go(TerminateSessionStep).withPrompt(`${args.summary.trim()}\n${outcomes.join("\n")}\nThank you for shopping with Northwind Outfitters.`);
  }

  /**
   * Ends the support session immediately when the customer explicitly requests it.
   *
   * @returns Navigation response to TerminateSessionStep.
   */
  @Tool
  protected async terminate_session(): Promise<ToolResponseType> { return go(TerminateSessionStep); }
}

/**
 * Reduces a full order to the customer-safe fields needed by support specialists.
 *
 * @param order - Full Order record from order book.
 * @returns Sanitized VerifiedOrder summary.
 */
function summarizeOrder(order: Order): VerifiedOrder {
  return { orderId: order.orderId, customerName: order.customerName, email: order.email, placedAt: order.placedAt, deliveredAt: order.deliveredAt, shippingStatus: order.shipping.status, carrier: order.shipping.carrier, tracking: order.shipping.tracking, paymentMethod: `${order.paymentMethod.brand} ending ${order.paymentMethod.last4}`, lineItems: order.lineItems.map((item) => ({ lineId: item.lineId, name: item.name, category: item.category, quantity: item.quantity, unitPrice: item.unitPrice, opened: item.opened, finalSale: item.finalSale, returnable: !item.finalSale && !item.returned })) };
}
