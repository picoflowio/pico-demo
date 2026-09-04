import { Flow, Step, Tool, go, stay, type ToolResponseType, type ToolType } from "@picoflow/core";
import { z } from "zod";
import { PolicyEngine, type ReturnReason } from "./backend/policy-engine.js";
import { supportRole, returnsInstructions } from "./prompt/support-prompt.js";
import type { ReturnRequest, VerifiedOrder } from "./support-types.js";
import { AdjudicateStep } from "./adjudicate-step.js";
import { TriageStep } from "./triage-step.js";

export class ReturnsStep extends Step {
  /**
   * Creates the returns specialist step attached to the current support flow.
   *
   * @param flow - The parent SupportFlow instance.
   */
  constructor(flow: Flow) { super(flow); }

  /**
   * Builds a return prompt containing available items, policy windows, and prior denials.
   *
   * @returns Formatted prompt text for returns intake.
   */
  override getPrompt(): string {
    const order = requireOrder(this.flow);
    const returned = this.getState<string[]>("returnedLineIds") ?? [];
    const available = { ...order, lineItems: order.lineItems.filter((item) => item.returnable && !returned.includes(item.lineId)) };
    return `${supportRole}\n\n${returnsInstructions.replace("{{ORDER}}", JSON.stringify(available)).replace("{{RETURN_POLICY}}", JSON.stringify({ apparel: PolicyEngine.returnWindowDays("apparel"), footwear: PolicyEngine.returnWindowDays("footwear"), gear: PolicyEngine.returnWindowDays("gear"), electronics: PolicyEngine.returnWindowDays("electronics") })).replace("{{RETURNED}}", JSON.stringify(returned)).replace("{{LAST_DENIAL}}", JSON.stringify(this.getState<string[]>("lastDenial") ?? []))}`;
  }

  /**
   * Declares actions for submitting a return or leaving returns support.
   *
   * @returns Array of tool schemas for return operations.
   */
  override defineTool(): ToolType[] {
    return [
      { name: "request_return", description: "Submit selected order line IDs and a return reason for deterministic adjudication.", schema: z.object({ lineIds: z.array(z.string().min(1)).min(1), reason: z.enum(["damaged", "wrong_item", "too_small", "too_large", "not_as_described", "no_longer_needed"]), note: z.string().optional() }) },
      { name: "end_return_request", description: "Return to the main support agent.", schema: z.object({ done: z.boolean() }) },
    ];
  }

  /**
   * Detects complete return requests from natural language before delegating to ordinary model response handling.
   *
   * @param llmResult - Raw model result text or object.
   * @returns Adjudication navigation or super onResponse result.
   */
  public override async onResponse(llmResult: string | object) {
    const request = this.inferReturnRequest();
    if (request) return this.routeToAdjudication(request);

    const selected = this.inferSelectedLineIds();
    if (selected.length > 0) this.saveState({ pendingLineIds: selected });
    return super.onResponse(llmResult);
  }

  /**
   * Validates selected line items against order history and starts deterministic return adjudication.
   *
   * @param args - Return request payload containing line IDs, reason, and optional note.
   * @returns Route response to AdjudicateStep or corrective feedback if items are invalid.
   */
  @Tool
  protected async request_return(args: { lineIds: string[]; reason: ReturnReason; note?: string }): Promise<ToolResponseType> {
    const order = requireOrder(this.flow); const returned = this.getState<string[]>("returnedLineIds") ?? [];
    const selected = [...new Set(args.lineIds.map((id) => id.trim().toUpperCase()))];
    const known = new Set(order.lineItems.map((item) => item.lineId.toUpperCase()));
    const unknown = selected.filter((id) => !known.has(id));
    if (unknown.length) return stay(`These line items are not on order ${order.orderId}: ${unknown.join(", ")}.`);
    const repeated = selected.filter((id) => returned.map((value) => value.toUpperCase()).includes(id));
    if (repeated.length) return stay(`These line items were already returned during this conversation: ${repeated.join(", ")}.`);
    const request: ReturnRequest = { orderId: order.orderId, lineIds: selected, reason: args.reason, ...(args.note?.trim() ? { note: args.note.trim() } : {}) };
    return this.routeToAdjudication(request);
  }

  /**
   * Leaves returns support and routes to TriageStep unless the message already contains a complete return request.
   *
   * @param args - Boolean indicating whether return intake is done.
   * @returns Route navigation response.
   */
  @Tool
  protected async end_return_request(args: { done: boolean }): Promise<ToolResponseType> {
    // A model may mistake “hold off” or a detailed return statement for an
    // instruction to leave this stage. If the message already contains a
    // selected item and a recognized reason, submit the request instead.
    const request = this.inferReturnRequest();
    if (request) return this.routeToAdjudication(request);
    return args.done ? go(TriageStep) : stay();
  }

  /**
   * Clears transient selection state and transfers the request to policy adjudication.
   *
   * @param request - Validated return request payload.
   * @returns Navigation response advancing to AdjudicateStep.
   */
  private routeToAdjudication(request: ReturnRequest): ToolResponseType {
    this.removeState("pendingLineIds");
    this.saveState({ lastDenial: [] });
    return go(AdjudicateStep).withState({ request });
  }

  /**
   * Combines an inferred reason and selected items into a complete return request.
   *
   * @returns ReturnRequest if both reason and lines were inferred, otherwise undefined.
   */
  private inferReturnRequest(): ReturnRequest | undefined {
    const reason = this.inferReason();
    const lineIds = this.inferSelectedLineIds();
    if (!reason || lineIds.length === 0) return undefined;
    return { orderId: requireOrder(this.flow).orderId, lineIds, reason };
  }

  /**
   * Finds line items by explicit IDs, matching keywords from customer text, or a prior pending selection.
   *
   * @returns Array of matched line item ID strings.
   */
  private inferSelectedLineIds(): string[] {
    const order = requireOrder(this.flow);
    const text = this.latestCustomerText();
    const explicit = order.lineItems
      .filter((item) => new RegExp(`\\b${item.lineId}\\b`, "i").test(text))
      .map((item) => item.lineId);
    if (explicit.length > 0) return explicit;

    const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const matches = order.lineItems
      .filter((item) => {
        const itemWords = item.name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        return itemWords.filter((word) => word.length >= 4 && words.has(word)).length >= 2;
      })
      .map((item) => item.lineId);
    if (matches.length > 0) return matches;

    return this.getState<string[]>("pendingLineIds") ?? [];
  }

  /**
   * Maps customer language keywords to supported return reasons (e.g. damaged, wrong_item, too_small).
   *
   * @returns ReturnReason enum value or undefined if not recognized.
   */
  private inferReason(): ReturnReason | undefined {
    const text = this.latestCustomerText().toLowerCase();
    if (/broken|torn|cracked|leaking|defect/.test(text)) return "damaged";
    if (/wrong (product|item|color|colour)|not what i ordered/.test(text)) return "wrong_item";
    if (/too small|too tight|runs small/.test(text)) return "too_small";
    if (/too big|too large|runs big/.test(text)) return "too_large";
    if (/not as described|misleading|not advertised/.test(text)) return "not_as_described";
    if (/no longer need|changed my mind|bought by mistake|better one/.test(text)) return "no_longer_needed";
    return undefined;
  }

  /**
   * Returns the latest customer message as plain text for deterministic parsing.
   *
   * @returns Plain string message text.
   */
  private latestCustomerText(): string {
    const content = this.getLastMessage()?.content;
    return typeof content === "string" ? content : "";
  }
}

/**
 * Loads the verified order shared by the triage and specialist steps.
 *
 * @param flow - Flow instance containing step state.
 * @returns VerifiedOrder object.
 * @throws Error if order has not been verified yet.
 */
function requireOrder(flow: Flow): VerifiedOrder { const order = flow.getStepState<VerifiedOrder>(TriageStep, "order"); if (!order) throw new Error("ReturnsStep requires a verified order from TriageStep."); return order; }
