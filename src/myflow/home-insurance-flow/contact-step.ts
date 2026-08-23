import {
  Flow,
  HumanMessageEx,
  Prompt,
  Step,
  TerminateSessionStep,
  Tool,
  go,
  stay,
  type MessageTypes,
  type ToolResponseType,
  type ToolType,
} from "@picoflow/core";
import { z } from "zod";
import { ContactRequestSchema, type ContactRequest, type QuoteOption, type QuoteResult } from "./home-insurance-types.js";
import { durableJson, terminalPrompt } from "./home-insurance-utils.js";
import { HomeInsurancePrompt } from "./prompt/home-insurance-prompt.js";
import { PresentQuoteStep } from "./present-quote-step.js";
import { RateQuoteStep } from "./rate-quote-step.js";

const Instructions = Prompt.file("prompt/contact.md");

export class ContactStep extends Step {
  constructor(flow: Flow) { super(flow); }

  protected async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  public onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the non-binding selection and ask for optional agent follow-up consent.");
  }

  public getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      SELECTED_OPTION: JSON.stringify(this.selectedOption()),
      QUOTE_RESULT: JSON.stringify(this.quoteResult()),
    })}`;
  }

  public defineTool(): ToolType[] {
    return [
      { name: "capture_home_quote_contact", description: "Save explicit contact consent and allowed optional contact fields.", schema: ContactRequestSchema },
      { name: "end_contact_quote", description: "End without recording agent follow-up contact details.", schema: z.object({}) },
    ];
  }

  @Tool
  protected async capture_home_quote_contact(args: unknown): Promise<ToolResponseType> {
    const parsed = ContactRequestSchema.safeParse(args);
    if (!parsed.success) return stay("Collect explicit consent, a valid name and email when consent is yes, and nullable optional fields.");
    let contact: ContactRequest;
    if (parsed.data.consentToContact) {
      if (!parsed.data.name || !parsed.data.email) return stay("When contact consent is yes, collect both name and a valid email address.");
      contact = parsed.data;
    } else {
      contact = { consentToContact: false, name: null, email: null, phone: null, propertyAddress: null };
    }
    this.saveState({ contact: durableJson(contact) });
    const result = this.quoteResult();
    const option = this.selectedOption();
    const followUp = contact.consentToContact
      ? `Confirm that an agent follow-up was requested for ${contact.name} at ${contact.email}.`
      : "Confirm that no agent follow-up details were retained.";
    return go(TerminateSessionStep).withPrompt(terminalPrompt(`${followUp} Provide quote ${result.quoteId} and selected ${option.name} (${option.id}), valid through ${result.validThrough}.`));
  }

  @Tool
  protected async end_contact_quote(): Promise<ToolResponseType> {
    this.saveState({ contact: { consentToContact: false, name: null, email: null, phone: null, propertyAddress: null } });
    const result = this.quoteResult();
    return go(TerminateSessionStep).withPrompt(terminalPrompt(`Confirm that no contact details were retained and provide quote reference ${result.quoteId}.`));
  }

  private quoteResult(): QuoteResult {
    const result = this.flow.getStepState<QuoteResult>(RateQuoteStep, "quoteResult");
    if (!result) throw new Error("ContactStep requires RateQuoteStep.quoteResult.");
    return result;
  }

  private selectedOption(): QuoteOption {
    const option = this.flow.getStepState<QuoteOption>(PresentQuoteStep, "selectedOption");
    if (!option) throw new Error("ContactStep requires PresentQuoteStep.selectedOption.");
    return option;
  }
}
