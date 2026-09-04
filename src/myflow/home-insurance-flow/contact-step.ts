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
  /**
   * Initializes the ContactStep instance.
   *
   * @param flow - The parent HomeInsuranceQuoteFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Cleans up transient conversation memory upon step entry to focus on contact consent.
   */
  protected override async onEnter(): Promise<void> {
    this.eraseMemory();
  }

  /**
   * Generates a synthetic user prompt triggering the contact consent inquiry.
   *
   * @param _userMessage - Inbound user message.
   * @returns Synthetic message asking to explain non-binding selection and request consent.
   */
  public override onCrossing(_userMessage: MessageTypes): MessageTypes {
    return new HumanMessageEx(this, "Explain the non-binding selection and ask for optional agent follow-up consent.");
  }

  /**
   * Builds the prompt instructing the LLM to request optional agent follow-up contact info and consent.
   *
   * @returns Formatted contact prompt text.
   */
  public override getPrompt(): string {
    return `${HomeInsurancePrompt.Role}\n${Prompt.replace(Instructions, {
      SELECTED_OPTION: JSON.stringify(this.selectedOption()),
      QUOTE_RESULT: JSON.stringify(this.quoteResult()),
    })}`;
  }

  /**
   * Declares tool schemas for saving contact consent details or ending without follow-up.
   *
   * @returns Array of tool specifications.
   */
  public override defineTool(): ToolType[] {
    return [
      { name: "capture_home_quote_contact", description: "Save explicit contact consent and allowed optional contact fields.", schema: ContactRequestSchema },
      { name: "end_contact_quote", description: "End without recording agent follow-up contact details.", schema: z.object({}) },
    ];
  }

  /**
   * Validates contact consent and optional contact fields (requiring name & email if consent is true),
   * saving state and terminating the session with a summary confirmation.
   *
   * @param args - Raw tool arguments matching ContactRequestSchema.
   * @returns Navigation response to TerminateSessionStep or stay if validation fails.
   */
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

  /**
   * Ends the session without recording contact details while preserving the quote reference ID.
   *
   * @returns Navigation response to TerminateSessionStep.
   */
  @Tool
  protected async end_contact_quote(): Promise<ToolResponseType> {
    this.saveState({ contact: { consentToContact: false, name: null, email: null, phone: null, propertyAddress: null } });
    const result = this.quoteResult();
    return go(TerminateSessionStep).withPrompt(terminalPrompt(`Confirm that no contact details were retained and provide quote reference ${result.quoteId}.`));
  }

  /**
   * Retrieves the active QuoteResult from RateQuoteStep state.
   *
   * @returns Active QuoteResult object.
   */
  private quoteResult(): QuoteResult {
    const result = this.flow.getStepState<QuoteResult>(RateQuoteStep, "quoteResult");
    if (!result) throw new Error("ContactStep requires RateQuoteStep.quoteResult.");
    return result;
  }

  /**
   * Retrieves the selected quote package from PresentQuoteStep state.
   *
   * @returns Selected QuoteOption object.
   */
  private selectedOption(): QuoteOption {
    const option = this.flow.getStepState<QuoteOption>(PresentQuoteStep, "selectedOption");
    if (!option) throw new Error("ContactStep requires PresentQuoteStep.selectedOption.");
    return option;
  }
}
