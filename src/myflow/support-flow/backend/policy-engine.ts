import { OrderBook, type LineItemCategory, type Order, type OrderLineItem } from "./order-book.js";

export type ReturnReason = "damaged" | "wrong_item" | "too_small" | "too_large" | "not_as_described" | "no_longer_needed";
export type RefundQuote = { lines: { lineId: string; name: string; quantity: number; amount: number }[]; itemsSubtotal: number; restockingFee: number; shippingRefund: number; netRefund: number; refundTarget: string };
export type Adjudication = { decision: "auto" | "review" | "deny"; reasons: string[]; quote?: RefundQuote };
const windows: Readonly<Record<LineItemCategory, number>> = { apparel: 60, footwear: 60, gear: 45, electronics: 30 };
const round = (amount: number) => Math.round(amount * 100) / 100;

export class PolicyEngine {
  /**
   * Returns the maximum monetary refund limit ($250) an agent may approve without supervisor or customer hold.
   */
  static get autoApprovalLimit() { return 250; }

  /**
   * Returns the allowable return window duration in days for a specific product category.
   *
   * @param category - The product category (apparel, footwear, gear, electronics).
   * @returns Maximum return window in days.
   */
  static returnWindowDays(category: LineItemCategory): number { return windows[category]; }

  /**
   * Resolves the current policy date from environment overrides (for deterministic tests) or current clock.
   *
   * @returns Current Date instance.
   */
  static today(): Date { const value = process.env.SUPPORT_FLOW_CURRENT_DATE?.trim() ?? process.env.SUPPORT_GRAPH_CURRENT_DATE?.trim(); return value ? new Date(value) : new Date(); }

  /**
   * Calculates elapsed calendar days since order delivery.
   *
   * @param order - Order object with delivery metadata.
   * @param today - Current reference date.
   * @returns Elapsed days or -1 if undelivered.
   */
  static daysSinceDelivery(order: Order, today = this.today()): number { return order.deliveredAt ? Math.floor((today.getTime() - Date.parse(`${order.deliveredAt}T00:00:00.000Z`)) / 86_400_000) : -1; }

  /**
   * Evaluates business eligibility rules for candidate line items, calculating quotes and determining outcome.
   *
   * @param order - Order record being evaluated.
   * @param lineIds - Line IDs selected for return.
   * @param reason - Stated customer reason.
   * @param alreadyReturned - Line IDs already returned on this order.
   * @param today - Evaluation reference date.
   * @returns Adjudication decision ('auto', 'review', or 'deny') with reasons and optional quote.
   */
  static adjudicate(order: Order, lineIds: readonly string[], reason: ReturnReason, alreadyReturned: readonly string[] = [], today = this.today()): Adjudication {
    const items = OrderBook.lineItems(order, lineIds);
    if (items.length !== lineIds.length || !items.length) return { decision: "deny", reasons: ["One or more line items are not part of this order."] };
    const returned = new Set(alreadyReturned.map((id) => id.toUpperCase()));
    const denials: string[] = [];
    if (order.shipping.status !== "delivered") return { decision: "deny", reasons: [`Order ${order.orderId} has not been delivered yet, so it cannot be returned.`] };
    const age = this.daysSinceDelivery(order, today);
    for (const item of items) {
      if (item.finalSale) denials.push(`${item.name} was a final-sale item and is not returnable.`);
      if (item.returned || returned.has(item.lineId.toUpperCase())) denials.push(`${item.name} has already been returned on this order.`);
      if (age > windows[item.category]) denials.push(`${item.name} is ${age} days past delivery, beyond the ${windows[item.category]}-day ${item.category} return window.`);
    }
    if (denials.length) return { decision: "deny", reasons: denials };
    const quote = this.quote(order, items, reason);
    const reasons = [
      ...(quote.restockingFee > 0 ? [`Opened electronics carry a 15% restocking fee of ${quote.restockingFee.toFixed(2)}.`] : []),
      ...(quote.netRefund > this.autoApprovalLimit ? [`The net refund of ${quote.netRefund.toFixed(2)} exceeds the ${this.autoApprovalLimit} agent approval limit.`] : []),
    ];
    return reasons.length ? { decision: "review", reasons, quote } : { decision: "auto", reasons: ["Inside the standard return window and agent approval limit."], quote };
  }

  /**
   * Calculates subtotal, restocking deductions, shipping reimbursements, and net refund amount for eligible items.
   *
   * @param order - Order containing payment and shipping info.
   * @param items - Line items being returned.
   * @param reason - Stated return reason.
   * @returns Itemized RefundQuote.
   */
  static quote(order: Order, items: readonly OrderLineItem[], reason: ReturnReason): RefundQuote {
    const lines = items.map((item) => ({ lineId: item.lineId, name: item.name, quantity: item.quantity, amount: round(item.unitPrice * item.quantity) }));
    const restockingFee = round(items.reduce((sum, item) => sum + (item.category === "electronics" && item.opened ? item.unitPrice * item.quantity * .15 : 0), 0));
    const shippingRefund = reason === "damaged" || reason === "wrong_item" ? round(order.shipping.paid) : 0;
    return { lines, itemsSubtotal: round(lines.reduce((sum, line) => sum + line.amount, 0)), restockingFee, shippingRefund, netRefund: round(lines.reduce((sum, line) => sum + line.amount, 0) - restockingFee + shippingRefund), refundTarget: `${order.paymentMethod.brand} ending ${order.paymentMethod.last4}` };
  }
}
