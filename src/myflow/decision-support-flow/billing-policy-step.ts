import { LogicStep, go } from '@picoflow/core';
import { SUPPORT_EVIDENCE } from './support-evidence.js';
import { BillingAnswerStep } from './billing-answer-step.js';
import { DECISION_SUPPORT_MEMORY } from './decision-support-memory.js';

export class BillingPolicyStep extends LogicStep {
  async runLogic() {
    const request = this.flow.getConversation(DECISION_SUPPORT_MEMORY).request;
    const invoiceId = request.match(/\bINV-\d+\b/i)?.[0].toUpperCase();
    const invoice = invoiceId ? SUPPORT_EVIDENCE.invoices[invoiceId as keyof typeof SUPPORT_EVIDENCE.invoices] : undefined;
    this.saveState({ invoiceId: invoiceId ?? null, invoice: invoice ?? null, outcome: !invoice ? 'ask_for_valid_invoice' : invoice.duplicate ? 'human_review_required' : 'no_duplicate_recorded', refundIssued: false });
    return go(BillingAnswerStep);
  }
}
