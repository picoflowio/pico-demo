import { Flow, Step, TerminateSessionStep, type SessionType } from "@picoflow/core";
import { QualificationStep } from "./qualification-step.js";
import { PropertyStep } from "./property-step.js";
import { RiskStep } from "./risk-step.js";
import { CoverageStep } from "./coverage-step.js";
import { ReviewStep } from "./review-step.js";
import { RateQuoteStep } from "./rate-quote-step.js";
import { PresentQuoteStep } from "./present-quote-step.js";
import { ContactStep } from "./contact-step.js";
import { ReferralStep } from "./referral-step.js";

const SESSION_IDLE_MS = 30 * 60_000;

export class HomeInsuranceQuoteFlow extends Flow {
  constructor() {
    super();
    this.getMemory()
      .setSummaryModel({ provider: "openai", name: "gpt-4o", retryAttempts: 3 })
      .setSummaryConfig({ minMessages: 12, recentMessages: 6 })
      .enableSummary("home-quote-intake");
  }

  protected override configModel() {
    return { provider: "openai", name: "gpt-4o", retryAttempts: 3 } as const;
  }

  protected override configLlmCallPolicy() {
    return { timeoutMs: 120_000 };
  }

  protected override defineSteps(): Step[] {
    return [
      new QualificationStep(this).useMemory("home-quote-intake"),
      new PropertyStep(this).useMemory("home-quote-intake"),
      new RiskStep(this).useMemory("home-quote-intake"),
      new CoverageStep(this).useMemory("home-quote-coverage"),
      new ReviewStep(this).useMemory("home-quote-review"),
      new RateQuoteStep(this),
      new PresentQuoteStep(this).useMemory("home-quote-options"),
      new ContactStep(this).useMemory("home-quote-contact"),
      new ReferralStep(this).useMemory("home-quote-referral"),
      new TerminateSessionStep(this).useMemory("home-quote-terminal"),
    ];
  }

  protected async onRestoreSessionDoc(session: SessionType): Promise<SessionType | null> {
    const restored = await super.onRestoreSessionDoc(session);
    if (!restored) return null;
    return this.sessionIdleMs(restored) >= SESSION_IDLE_MS ? null : restored;
  }
}
