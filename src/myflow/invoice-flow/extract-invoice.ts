/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { HumanMessage } from "@langchain/core/messages";
import { direct, Flow, Tool, go } from "@picoflow/core";
import { ToolResponseType, ToolType } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { z } from "zod";
import { MessageTypes } from "@picoflow/core";
import { Prompt } from "@picoflow/core";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { InvoicePrompt } from "./prompt/invoice-prompt.js";
import { HumanMessageEx } from "@picoflow/core";
import { LLMFileManager } from "@picoflow/core";
import { HttpContentType } from "@picoflow/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ExtractInvoiceStep extends Step {
  private uploadedFileCleanup?: () => Promise<void>;

  constructor(flow: Flow) {
    super(flow);
  }

  private async cleanupUploadedFile(): Promise<void> {
    const cleanup = this.uploadedFileCleanup;
    this.uploadedFileCleanup = undefined;
    if (cleanup) {
      await cleanup();
    }
  }

  public override getPrompt(): string {
    const fileName = this.getContext<string>("config.fileName");
    const prompt = Prompt.replace(InvoicePrompt.ExtractInvoicePrompt, {
      FileName: fileName,
    });

    // './data/evergreen.png',
    return prompt;
  }

  public override onCrossing(
    langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    if (!langMessage) {
      return new HumanMessageEx(this, "Hi, extract invoice");
    }
    return langMessage;
  }

  public override defineTool(): ToolType[] {
    return [
      {
        name: "fetch_file",
        description: "Capture name of file",
        schema: z.object({
          name: z.string().describe("Name of file"),
        }),
      },
      {
        name: "capture_json",
        description: "Capture json structure",
        schema: z.object({
          json: z.object({}).describe("The json structure captured"),
        }),
      },
    ];
  }
  @Tool
  protected async fetch_file(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    const fileName = args?.name;
    const localPath = path.join(__dirname, fileName);
    this.saveState({ fileName: localPath });
    try {
      await this.cleanupUploadedFile();
      const fileMgr = new LLMFileManager(this.getLLMType());
      const result = await fileMgr.uploadFile(localPath);
      this.uploadedFileCleanup = result.cleanup;
      const id = fileMgr.getFileId(result);
      const userMsg = new HumanMessage({
        content: [
          {
            type: "text",
            text:
              `The requested invoice file has been uploaded and attached to this message as file id ${id}. ` +
              "Use the attached image content for extraction. Do not try to access the local path or filename again. " +
              "Extract the invoice JSON and call capture_json.",
          },
          result.contentPart as any,
        ],
        id: this.genMessageId(),
      });

      // go(...) re-enters this step so the model can read the attached invoice file.
      return go(ExtractInvoiceStep).withMessage(userMsg);
      // return null;
    } catch (_error) {
      await this.cleanupUploadedFile();
      throw new Error(`read file ${fileName} failed`);
    }
  }

  @Tool
  protected async capture_json(
    args: Record<string, any>,
  ): Promise<ToolResponseType> {
    try {
      this.saveState({ json: args?.json });
      // this.sessionCompleted();

      // direct(...) returns JSON immediately, without another model call, and keeps this step active.
      this.flow.markCompleted();
      return direct(args?.json).withContentType(HttpContentType.Json);
    } finally {
      await this.cleanupUploadedFile();
    }
  }
}
