/** Fictional, read-only support evidence. No refunds or operational changes occur. */
export const SUPPORT_EVIDENCE = {
  product: 'Northstar Cloud',
  docs: {
    apiKey: 'Create API keys in Settings > API keys. Never share a secret key in chat.',
    timeout: 'The API client default timeout is 30 seconds. Check request ID and service status before retrying. Retry only idempotent operations.',
    webhook: 'Webhook delivery is retried for 24 hours. A 401 response commonly indicates an invalid signing secret. Verify signatures on the receiving server.',
    exports: 'CSV exports are available in Reports > Export. Only workspace admins can export billing data.',
  },
  invoices: {
    'INV-100': { amount: 49, currency: 'USD', status: 'paid', duplicate: false },
    'INV-200': { amount: 98, currency: 'USD', status: 'paid', duplicate: true },
  },
  policy: 'This assistant can explain invoices and request human review. It cannot issue refunds, cancel subscriptions, change access, or claim an action was performed.',
};

export const HANDOFF = 'I could not verify a reliable answer. Please contact Northstar support with your request ID or invoice number. No account changes have been made.';
