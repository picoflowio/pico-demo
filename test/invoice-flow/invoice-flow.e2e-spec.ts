/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import "dotenv/config";

import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Test as NestTest } from "@nestjs/testing";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { FlowEngine } from "@picoflow/core";
import { AppModule } from "../../src/app.module.js";
import { InvoiceFlow } from "../../src/myflow/invoice-flow/invoice-flow.js";

type InvoiceDocument = Record<string, any>;

const sqlitePath = join(
  process.cwd(),
  "test",
  ".tmp",
  "invoice-flow-session.sqlite",
);
const expectedInvoice = JSON.parse(
  readFileSync(
    new URL(
      "../../src/myflow/invoice-flow/prompt/invoice-example.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as InvoiceDocument;
const missingLiveConfig = ["GEMINI_API_KEY", "PICOFLOW_KEY"].filter(
  (key) => !process.env[key]?.trim(),
);

const useEnvDocumentDb = process.env.USE_ENV === "1";
if (!useEnvDocumentDb) {
  process.env.SESSION_STORE =
    process.env.INVOICE_FLOW_TEST_SESSION_STORE ?? "SQLITE";
  process.env.SQLITE_PATH =
    process.env.INVOICE_FLOW_TEST_SQLITE_PATH ?? sqlitePath;
  process.env.OPENAI_API_KEY ??= "unused-in-invoice-flow-test";
  process.env.ANTHROPIC_API_KEY ??= "unused-in-invoice-flow-test";
  process.env.GEMINI_API_KEY ??= "unused-in-invoice-flow-test";
  process.env.PICOFLOW_KEY ??= "unused-in-invoice-flow-test";
  process.env.MONGODB_NAME ??= "unused-in-invoice-flow-test";
  process.env.MONGODB_COLLECTION ??= "unused-in-invoice-flow-test";
  process.env.MONGODB_URL ??= "mongodb://unused-in-invoice-flow-test";
}

if ((process.env.SESSION_STORE ?? "SQLITE").toUpperCase() === "SQLITE") {
  process.env.SQLITE_PATH ??= sqlitePath;
  mkdirSync(dirname(process.env.SQLITE_PATH), { recursive: true });
}

const testTimeoutMs = Number(
  process.env.INVOICE_FLOW_TEST_TIMEOUT_MS ?? 300_000,
);
const shouldRunLiveTest = missingLiveConfig.length === 0;
const skipReason = `Missing live InvoiceFlow config: ${missingLiveConfig.join(", ")}`;

test("InvoiceFlow usage and fixture remain in the demo project", () => {
  assert.equal(InvoiceFlow.name, "InvoiceFlow");
  assert.equal(expectedInvoice.vendor_name, "ACME Inc");
  assert.equal(expectedInvoice.bill_number, "INV-2025-019");
  assert.ok(Array.isArray(expectedInvoice.invoice_items));
  assert.equal(expectedInvoice.invoice_items.length, 3);

  readFileSync(
    new URL("../../src/myflow/invoice-flow/data/ACME.png", import.meta.url),
  );
});

test("the demo application boots and registers InvoiceFlow", async () => {
  const app = await createApp();
  try {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/healthcheck",
    });
    assert.equal(response.statusCode, 200, response.payload);
    assert.ok(app.get(FlowEngine).getFlowNames().includes("InvoiceFlow"));
  } finally {
    await app.close();
  }
});

test(
  "InvoiceFlow extracts ACME invoice JSON through the NestJS application",
  { timeout: testTimeoutMs, skip: shouldRunLiveTest ? false : skipReason },
  async () => {
    const app = await createApp();
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: "POST",
          url: "/ai/run",
          headers: {
            "content-type": "application/json",
          },
          payload: JSON.stringify({
            message: "Extract the configured invoice into JSON.",
            flowName: "InvoiceFlow",
            config: {
              fileName: process.env.INVOICE_FLOW_TEST_FILE ?? "data/ACME.png",
            },
          }),
        });

      assert.equal(
        response.statusCode,
        200,
        `POST /ai/run failed: ${response.payload}`,
      );
      assert.equal(
        response.headers["content-type"]?.split(";")[0],
        "application/json",
      );

      const invoice = response.json() as InvoiceDocument;
      expectInvoiceContract(invoice);

      const sessionId = readSessionHeader(response.headers);
      assert.ok(sessionId, "Expected CHAT_SESSION_ID response header");

      const sessionDoc = await app
        .get(FlowEngine)
        .getFlowSession()
        .fetchAll(sessionId);
      assert.equal(sessionDoc.runStatus, "completed");

      assert.equal(sessionDoc.flow?.name, "InvoiceFlow");
      const invoiceFlow = sessionDoc.flow;
      assert.ok(invoiceFlow, "Expected InvoiceFlow session document");
      const extractionStep = invoiceFlow.steps?.find(
        (step) => step.name === "ExtractInvoiceStep",
      );
      assert.ok(extractionStep, "Expected ExtractInvoiceStep session state");
      const extractionJson =
        extractionStep.state && "json" in extractionStep.state
          ? extractionStep.state.json
          : undefined;
      assert.deepEqual(extractionJson, invoice);
    } finally {
      await app.close();
    }
  },
);

async function createApp(): Promise<NestFastifyApplication> {
  const moduleRef = await NestTest.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function expectInvoiceContract(invoice: InvoiceDocument): void {
  assert.equal(invoice.vendor_name, expectedInvoice.vendor_name);
  assert.equal(invoice.bill_number, expectedInvoice.bill_number);
  assert.equal(invoice.currency, expectedInvoice.currency);
  assert.equal(invoice.total, expectedInvoice.total);
  assert.equal(invoice.balance_due, expectedInvoice.balance_due);
  assert.ok(Array.isArray(invoice.invoice_items));
  assert.equal(
    invoice.invoice_items.length,
    expectedInvoice.invoice_items.length,
  );
}

function readSessionHeader(
  headers: Record<string, number | string | string[] | undefined>,
): string | undefined {
  const header = headers.chat_session_id ?? headers.CHAT_SESSION_ID;
  return Array.isArray(header) ? header[0] : header?.toString();
}
