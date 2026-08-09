import { readFileSync } from "node:fs";

export type LineItemCategory = "apparel" | "footwear" | "gear" | "electronics";
export type OrderLineItem = { lineId: string; sku: string; name: string; category: LineItemCategory; quantity: number; unitPrice: number; opened: boolean; finalSale: boolean; returned: boolean };
export type OrderCharge = { chargeId: string; postedAt: string; amount: number; descriptor: string };
export type Order = { orderId: string; email: string; postalCode: string; customerName: string; placedAt: string; deliveredAt: string | null; paymentMethod: { brand: string; last4: string }; shipping: { carrier: string; tracking: string; status: "in_transit" | "delivered" | "returned"; paid: number }; lineItems: OrderLineItem[]; charges: OrderCharge[] };

const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8")) as Order[];

/** Immutable order catalogue; all customer outcomes stay in session state. */
export class OrderBook {
  static verify(orderId: string, secret: string): Order | undefined {
    const order = this.find(orderId);
    if (!order) return undefined;
    const candidate = secret.trim().toLowerCase();
    return candidate === order.email.toLowerCase() || candidate === order.postalCode.toLowerCase() ? order : undefined;
  }
  static find(orderId: string): Order | undefined { return orders.find((order) => order.orderId.toUpperCase() === orderId.trim().toUpperCase()); }
  static lineItems(order: Order, lineIds: readonly string[]): OrderLineItem[] {
    const byId = new Map(order.lineItems.map((item) => [item.lineId.toUpperCase(), item]));
    return lineIds.flatMap((lineId) => { const item = byId.get(lineId.trim().toUpperCase()); return item ? [item] : []; });
  }
  static duplicateCharges(order: Order): OrderCharge[] { return order.charges.filter((charge, _i, all) => all.filter((other) => other.amount === charge.amount).length > 1); }
}
