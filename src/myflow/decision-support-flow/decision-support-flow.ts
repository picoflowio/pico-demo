import { directTo, Flow, type Step, type DecisionErrorContext, type DecisionResponse } from '@picoflow/core';
import { IntakeDecisionStep } from './intake-decision-step.js';
import { ClarifyStep } from './clarify-step.js';
import { BillingPolicyStep } from './billing-policy-step.js';
import { QuickAnswerStep } from './quick-answer-step.js';
import { TechnicalSpecialistStep } from './technical-specialist-step.js';
import { BillingAnswerStep } from './billing-answer-step.js';
import { AnswerJudgeDecisionStep } from './answer-judge-decision-step.js';
import { ReviseAnswerStep } from './revise-answer-step.js';
import { HANDOFF } from './support-evidence.js';
import { DECISION_SUPPORT_MEMORY } from './decision-support-memory.js';

export class DecisionSupportFlow extends Flow {
  protected override configModel() {
    return {
      provider: 'openai',
      name: 'gpt-5.6-luna',
      params: { reasoning: { effort: 'low' } },
      retryAttempts: 2,
    } as const;
  }
  protected override configLlmCallPolicy() { return { timeoutMs: 60000 }; }
  protected override configDecision() { return { provider: 'typesafe', model: 'jev-latest', timeoutMs: 15000, maxRetries: 1 }; }
  protected override defineSteps(): Step[] {
    return [
      new IntakeDecisionStep(this).useMemory(DECISION_SUPPORT_MEMORY),
      new ClarifyStep(this),
      new BillingPolicyStep(this),
      new QuickAnswerStep(this),
      new TechnicalSpecialistStep(this).useModel({ provider: 'openai', name: 'gpt-5.1', params: { reasoning: { effort: 'medium' } } }),
      new BillingAnswerStep(this),
      new AnswerJudgeDecisionStep(this).useMemory(DECISION_SUPPORT_MEMORY),
      new ReviseAnswerStep(this).useModel({ provider: 'openai', name: 'gpt-5.1', params: { reasoning: { effort: 'medium' } } }),
    ];
  }
  override async onDecisionError(_context: DecisionErrorContext): Promise<DecisionResponse> {
    // Both intake and judge outages have a deterministic, customer-safe outcome.
    this.getStep(AnswerJudgeDecisionStep.id)?.saveState({ accepted: false, unavailable: true });
    return directTo(IntakeDecisionStep, HANDOFF);
  }
}
