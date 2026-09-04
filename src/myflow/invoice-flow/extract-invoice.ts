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

  /**
   * Initializes the ExtractInvoiceStep instance.
   *
   * @param flow - The parent Flow orchestrating invoice extraction.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Deletes remote or temporary uploaded files associated with this step run.
   */
  private async cleanupUploadedFile(): Promise<void> {
    const cleanup = this.uploadedFileCleanup;
    this.uploadedFileCleanup = undefined;
    if (cleanup) {
      await cleanup();
    }
  }

  /**
   * Formats the extraction prompt template with target file metadata from flow config.
   *
   * @returns Rendered system prompt text.
   */
  public override getPrompt(): string {
    const fileName = this.getContext<string>("config.fileName");
    const prompt = Prompt.replace(InvoicePrompt.ExtractInvoicePrompt, {
      FileName: fileName,
    });

    // './data/evergreen.png',
    return prompt;
  }

  /**
   * Supplies a synthetic human message triggering invoice extraction if entering without prior user input.
   *
   * @param langMessage - Inbound message.
   * @param _priorStep - Prior step identifier.
   * @returns User message triggering extraction.
   */
  public override onCrossing(
    langMessage: MessageTypes,
    _priorStep?: string,
  ): MessageTypes {
    if (!langMessage) {
      return new HumanMessageEx(this, "Hi, extract invoice");
    }
    return langMessage;
  }

  /**
   * Declares tool schemas for uploading invoice image files and capturing extracted JSON structures.
   *
   * @returns Array of tool specifications.
   */
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

  /**
   * Reads a local invoice file from disk, uploads it to the model provider's file storage,
   * and attaches the image part to a synthetic message to re-enter this step for multimodal parsing.
   *
   * @param args - Tool invocation arguments containing relative `name`.
   * @returns Re-entrant tool response carrying the file content part.
   */
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

  /**
   * Persists the model's parsed invoice JSON into state, marks the flow complete,
   * cleans up remote files, and returns the structured JSON directly to the client.
   *
   * @param args - Tool invocation arguments containing extracted `json` payload.
   * @returns Direct JSON tool response.
   */
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
