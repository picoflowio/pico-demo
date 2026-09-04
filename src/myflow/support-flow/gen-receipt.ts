import type { RefundQuote } from "./backend/policy-engine.js";
export class GenReceipt {
  /**
   * Formats a numeric amount using the support flow's US currency convention ($0.00).
   *
   * @param amount - Number to format as currency.
   * @returns Formatted currency string.
   */
  static formatCurrency(amount: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount); }

  /**
   * Renders a refund quote as a compact Markdown table for customer-facing prompts and reviews.
   *
   * @param quote - RefundQuote containing itemized lines, restocking fees, and net total.
   * @returns Formatted Markdown table string.
   */
  static quoteTable(quote: RefundQuote): string {
    const rows = ["| Line | Amount |", "| --- | --- |", ...quote.lines.map((line) => `| ${line.name} x${line.quantity} | ${this.formatCurrency(line.amount)} |`), `| Items subtotal | ${this.formatCurrency(quote.itemsSubtotal)} |`];
    if (quote.restockingFee) rows.push(`| Restocking fee | -${this.formatCurrency(quote.restockingFee)} |`);
    if (quote.shippingRefund) rows.push(`| Shipping refunded | ${this.formatCurrency(quote.shippingRefund)} |`);
    rows.push(`| **Net refund to ${quote.refundTarget}** | **${this.formatCurrency(quote.netRefund)}** |`);
    return rows.join("\n");
  }
}
