/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { SessionLogger } from "@picoflow/core";
import { ExtractInvoiceStep } from "./extract-invoice.js";
import { NoToolStep } from "./no-tool-step.js";

export class InvoiceFlow extends Flow {
  protected override configModel() {
    return {
      provider: "google",
      name: "gemini-2.5-flash",
      retryAttempts: 3,
    } as const;
  }

  protected override defineSteps(): Step[] {
    return [
      new NoToolStep(this),
      new ExtractInvoiceStep(this).useMemory("invoice3").useModel({
        provider: "google",
        name: "gemini-3.1-pro-preview",
        params: { temperature: 0 },
      }),
      // new TerminateSessionStep(this)
      //   .useModel({ provider: "google", name: "gemini-2.5-pro" })
      //   .useMemory("temp"),
    ];
  }

  protected async spawnSteps(): Promise<string> {
    const fileNames = ["data/Evergreen.png", "data/ACME.png"];

    await this.concurrentSteps<string>({
      items: fileNames,
      batchSize: 10,
      onConfig: (item) => {
        return {
          fileName: item,
        };
      },
      onBotResponse(_item, response) {
        console.log(response);
      },
    });

    const msg = `Finished concurrent flow: ${this.id}`;
    new SessionLogger(this.getSessionDoc()).log(msg);
    // console.log(msg);
    return msg;
  }
}
