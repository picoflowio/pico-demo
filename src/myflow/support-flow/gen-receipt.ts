import type { RefundQuote } from "./backend/policy-engine.js";
export class GenReceipt {
  static formatCurrency(amount: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount); }
  static quoteTable(quote: RefundQuote) {
    const rows = ["| Line | Amount |", "| --- | --- |", ...quote.lines.map((line) => `| ${line.name} x${line.quantity} | ${this.formatCurrency(line.amount)} |`), `| Items subtotal | ${this.formatCurrency(quote.itemsSubtotal)} |`];
    if (quote.restockingFee) rows.push(`| Restocking fee | -${this.formatCurrency(quote.restockingFee)} |`);
    if (quote.shippingRefund) rows.push(`| Shipping refunded | ${this.formatCurrency(quote.shippingRefund)} |`);
    rows.push(`| **Net refund to ${quote.refundTarget}** | **${this.formatCurrency(quote.netRefund)}** |`);
    return rows.join("\n");
  }
}
