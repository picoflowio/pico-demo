import { Flow, LogicStep, go, type LogicResponseType } from "@picoflow/core";
import { RatingEngine, type QuoteApplication } from "./backend/rating-engine.js";
import type { CoveragePreferences, PropertyProfile, Qualification, RiskProfile } from "./home-insurance-types.js";
import { durableJson, homeInsuranceCurrentDate } from "./home-insurance-utils.js";
import { QualificationStep } from "./qualification-step.js";
import { PropertyStep } from "./property-step.js";
import { RiskStep } from "./risk-step.js";
import { CoverageStep } from "./coverage-step.js";
import { PresentQuoteStep } from "./present-quote-step.js";
import { ReferralStep } from "./referral-step.js";

export class RateQuoteStep extends LogicStep {
  constructor(flow: Flow) { super(flow); }

  public async runLogic(): Promise<LogicResponseType> {
    const application: QuoteApplication = {
      qualification: this.requireState<Qualification>(QualificationStep, "qualification"),
      property: this.requireState<PropertyProfile>(PropertyStep, "property"),
      risk: this.requireState<RiskProfile>(RiskStep, "risk"),
      coverage: this.requireState<CoveragePreferences>(CoverageStep, "coverage"),
    };
    const quoteResult = RatingEngine.quote(application, homeInsuranceCurrentDate());
    this.saveState({ quoteResult: durableJson(quoteResult) });
    if (quoteResult.decision === "eligible") return go(PresentQuoteStep).withState({ needsPresentation: true });
    return go(ReferralStep).withState({ decision: quoteResult.decision, reasonCodes: quoteResult.reasonCodes });
  }

  private requireState<T>(step: new (flow: Flow) => StepLike, key: string): T {
    const value = this.flow.getStepState<T>(step as never, key);
    if (!value) throw new Error(`RateQuoteStep requires ${step.name}.${key}.`);
    return value;
  }
}

type StepLike = { getPrompt(): string };
