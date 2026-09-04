import { readFileSync } from "node:fs";

export type LineItemCategory = "apparel" | "footwear" | "gear" | "electronics";
export type OrderLineItem = { lineId: string; sku: string; name: string; category: LineItemCategory; quantity: number; unitPrice: number; opened: boolean; finalSale: boolean; returned: boolean };
export type OrderCharge = { chargeId: string; postedAt: string; amount: number; descriptor: string };
export type Order = { orderId: string; email: string; postalCode: string; customerName: string; placedAt: string; deliveredAt: string | null; paymentMethod: { brand: string; last4: string }; shipping: { carrier: string; tracking: string; status: "in_transit" | "delivered" | "returned"; paid: number }; lineItems: OrderLineItem[]; charges: OrderCharge[] };

const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8")) as Order[];

/** Immutable order catalogue; all customer outcomes stay in session state. */
export class OrderBook {
  /**
   * Verifies an order using either the customer's registered email address or postal code.
   *
   * @param orderId - Order identifier string.
   * @param secret - Customer verification secret (email address or ZIP code).
   * @returns Verified Order object, or undefined if verification fails.
   */
  static verify(orderId: string, secret: string): Order | undefined {
    const order = this.find(orderId);
    if (!order) return undefined;
    const candidate = secret.trim().toLowerCase();
    return candidate === order.email.toLowerCase() || candidate === order.postalCode.toLowerCase() ? order : undefined;
  }

  /**
   * Finds an order by ID using case-insensitive, whitespace-tolerant matching.
   *
   * @param orderId - Target order ID string.
   * @returns Matched Order record or undefined.
   */
  static find(orderId: string): Order | undefined { return orders.find((order) => order.orderId.toUpperCase() === orderId.trim().toUpperCase()); }

  /**
   * Returns requested line items belonging to the order, omitting unknown line IDs.
   *
   * @param order - Order containing candidate items.
   * @param lineIds - Array of line ID strings to find.
   * @returns Array of matched OrderLineItem objects.
   */
  static lineItems(order: Order, lineIds: readonly string[]): OrderLineItem[] {
    const byId = new Map(order.lineItems.map((item) => [item.lineId.toUpperCase(), item]));
    return lineIds.flatMap((lineId) => { const item = byId.get(lineId.trim().toUpperCase()); return item ? [item] : []; });
  }

  /**
   * Identifies charges sharing an identical amount within the order ledger (potential duplicates).
   *
   * @param order - Order containing charges to inspect.
   * @returns Array of charge entries with duplicate amounts.
   */
  static duplicateCharges(order: Order): OrderCharge[] { return order.charges.filter((charge, _i, all) => all.filter((other) => other.amount === charge.amount).length > 1); }
}
