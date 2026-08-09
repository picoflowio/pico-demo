import type { RefundQuote, ReturnReason } from "./backend/policy-engine.js";

export type VerifiedOrder = {
  orderId: string; customerName: string; email: string; placedAt: string;
  deliveredAt: string | null; shippingStatus: string; carrier: string; tracking: string;
  paymentMethod: string;
  lineItems: { lineId: string; name: string; category: string; quantity: number; unitPrice: number; opened: boolean; finalSale: boolean; returnable: boolean }[];
};

export type ReturnRequest = { orderId: string; lineIds: string[]; reason: ReturnReason; note?: string };
export type PendingRefund = { request: ReturnRequest; quote: RefundQuote; reasons: string[] };
export type RefundRecord = { rma: string; orderId: string; lineIds: string[]; netRefund: number; refundTarget: string; authority: "agent" | "customer_confirmed" };
export type BillingDispute = { orderId: string; chargeIds: string[]; description: string; amountInDispute: number };
export type EscalationTicket = {
  ticketId: string;
  category: "duplicate_charge" | "wrong_amount" | "missing_refund" | "payment_method" | "other";
  summary: string; customerImpact: "low" | "medium" | "high"; requestedRemedy: string;
  amountInDispute: number; openedAt: string;
};
