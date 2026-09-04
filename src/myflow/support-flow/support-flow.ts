import { Flow, Step, TerminateSessionStep, type SessionType } from "@picoflow/core";
import { ApprovalStep } from "./approval-step.js";
import { AdjudicateStep } from "./adjudicate-step.js";
import { BillingStep } from "./billing-step.js";
import { EscalateStep } from "./escalate-step.js";
import { ReturnsStep } from "./returns-step.js";
import { TriageStep } from "./triage-step.js";

const DEFAULT_IDLE_MS = 30 * 60_000;
const DEFAULT_APPROVAL_HOLD_MS = 10 * 60_000;

/** Northwind Outfitters post-purchase support, ported from SupportGraph. */
export class SupportFlow extends Flow {
  constructor() {
    super();
    this.getMemory().setSummaryModel({ provider: "openai", name: "gpt-4o", retryAttempts: 3 }).setSummaryConfig({ minMessages: 8, recentMessages: 4 }).enableSummary("support-triage");
  }
  protected override configModel() { return { provider: "openai", name: "gpt-4o", retryAttempts: 3 } as const; }
  protected override defineSteps(): Step[] {
    return [
      new TriageStep(this).useMemory("support-triage").useModel({ provider: "openai", name: "gpt-4o", params: { temperature: 0.3 } }),
      new ReturnsStep(this).useMemory("support-returns").useModel({ provider: "openai", name: "gpt-5.1", params: { reasoning: { effort: "low" } } }),
      new AdjudicateStep(this),
      new ApprovalStep(this).useMemory("support-approval").useModel({ provider: "openai", name: "gpt-5.1", params: { reasoning: { effort: "low" } } }),
      new BillingStep(this).useMemory("support-billing"),
      new EscalateStep(this).useMemory("support-billing"),
      new TerminateSessionStep(this).useMemory("support-terminal"),
    ];
  }
  protected async onRestoreSessionDoc(session: SessionType): Promise<SessionType | null> {
    const restored = await super.onRestoreSessionDoc(session);
    if (!restored) return null;
    const idleMs = this.sessionIdleMs(restored);
    if (idleMs >= DEFAULT_IDLE_MS) return null;
    if (restored.flow.currentStep !== ApprovalStep.id || idleMs < DEFAULT_APPROVAL_HOLD_MS) return restored;
    const approval = restored.flow.steps.find((step) => step.name === ApprovalStep.id);
    if (approval) {
      const state = approval.state as Record<string, unknown>;
      const { pending: _pending, ...released } = state;
      approval.state = released;
    }
    restored.flow.currentStep = TriageStep.id;
    return restored;
  }
}
