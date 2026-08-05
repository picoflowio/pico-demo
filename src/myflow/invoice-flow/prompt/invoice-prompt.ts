/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class InvoicePrompt {
  public static AbruptEnd = `
   Nicely tell the user this is the end of conversation as they requested, you MUST NOT talk other things!
  `.trim();

  public static FromAddressEnd = `
  Tell the user you have collected the address and end the conversation.
 `.trim();

  private static InvoiceExample = readFileSync(
    path.join(__dirname, 'invoice-example.json'),
    'utf-8',
  );

  private static Invoice = readFileSync(
    path.join(__dirname, 'invoice.md'),
    'utf-8',
  );

  public static ExtractInvoicePrompt = `
  ${this.Invoice}
  ## Data Extraction JSON Example
  ${this.InvoiceExample}
  `;
}
