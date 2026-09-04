import {
  Flow,
  JsonValue,
  LastResponseType,
  Prompt,
  Step,
  StringUtil,
  go,
} from "@picoflow/core";
import { ExtractInvoiceStep } from "./extract-invoice.js";

const PromptTemplate = Prompt.file("prompt/nt-prompt.md");
export class NoToolStep extends Step {
  constructor(flow: Flow) {
    super(flow);
  }

  public override getPrompt(): string {
    const randomZip = (): string => {
      return Math.random() < 0.5 ? "97006" : "97005";
    };
    const prompt = Prompt.replace2(PromptTemplate, {
      internal_address: {
        street: "123 Main St",
        city: "Beaverton",
        state: "OR",
        zip: randomZip(),
      },
    });

    return prompt;
  }

  public async onResponse(
    llmResult: string | object,
  ): Promise<LastResponseType> {
    const parsedResult = StringUtil.parseJson<JsonValue>(llmResult as string);
    this.saveState({ current_date: parsedResult });

    return go(ExtractInvoiceStep).withState({
      from_previous: parsedResult as JsonValue,
    });
  }
}
