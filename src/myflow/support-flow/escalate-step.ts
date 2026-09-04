import { Flow, LogicStep, go, type LogicResponseType } from "@picoflow/core";
import { OrderBook } from "./backend/order-book.js";
import type { BillingDispute, EscalationTicket } from "./support-types.js";
import { TriageStep } from "./triage-step.js";

/**
 * Writes the billing ticket as an in-turn worker.
 *
 * Billing has already validated the charge IDs and recomputed the amount from
 * the ledger. Ticket creation must therefore not depend on a second model
 * tool call being emitted: every accepted dispute gets a durable ticket before
 * control returns to the hub.
 */
export class EscalateStep extends LogicStep {
  constructor(flow: Flow) { super(flow); }

  override async runLogic(): Promise<LogicResponseType> {
    const dispute = this.getState<BillingDispute>("dispute");
    if (!dispute) throw new Error("EscalateStep requires a captured dispute.");
    const order = OrderBook.find(dispute.orderId);
    if (!order) throw new Error(`EscalateStep cannot load order '${dispute.orderId}'.`);

    const charges = order.charges.filter((charge) => dispute.chargeIds.includes(charge.chargeId.toUpperCase()));
    const duplicate = charges.length > 1 && new Set(charges.map((charge) => charge.amount)).size < charges.length;
    const category: EscalationTicket["category"] = duplicate ? "duplicate_charge" : "wrong_amount";
    const customerImpact: EscalationTicket["customerImpact"] = dispute.amountInDispute > 250 ? "high" : dispute.amountInDispute >= 50 ? "medium" : "low";
    const chargeFacts = charges.map((charge) => `${charge.chargeId} on ${charge.postedAt} for ${charge.amount.toFixed(2)}`).join(", ");
    const ticket: EscalationTicket = {
      ticketId: `ESC-${Math.floor(10000 + Math.random() * 90000)}`,
      category,
      summary: `Order ${order.orderId} has a billing dispute for ${chargeFacts}. Customer reported: ${dispute.description}`,
      customerImpact,
      requestedRemedy: `Review the disputed charge(s) and determine the appropriate billing correction for order ${order.orderId}.`,
      amountInDispute: dispute.amountInDispute,
      openedAt: new Date().toISOString(),
    };
    this.saveState({ ticket });
    const tickets = this.flow.getStepState<EscalationTicket[]>(TriageStep, "tickets") ?? [];
    return go(TriageStep).withState({ tickets: [...tickets, ticket] });
  }
}
