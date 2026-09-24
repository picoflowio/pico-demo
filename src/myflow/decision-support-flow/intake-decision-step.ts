import { DecisionStep, finish, go, Prompt, type DecisionAnswers, type DecisionQuestionMap, type DecisionResponse } from '@picoflow/core';
import { ClarifyStep } from './clarify-step.js';
import { BillingPolicyStep } from './billing-policy-step.js';
import { TechnicalSpecialistStep } from './technical-specialist-step.js';
import { QuickAnswerStep } from './quick-answer-step.js';

const Instructions = Prompt.file('prompt/intake-decision.md');

const TRIAGE = {
  route: {
    type: 'choice', criteria: {
      billing: 'Invoice, charge, subscription, or refund question',
      technical: 'An error, failed integration, webhook problem, timeout, or blocked operation that requires diagnosis',
      documentation: 'A straightforward how-to or location question about product settings, API keys, or reports',
      unclear: 'Insufficient detail or a request outside the supplied product evidence',
      complete: 'Customer explicitly says the conversation is finished and asks no new question',
    }, instructions: 'Classify the latest request using prior requests only for follow-up context.'
  },
  complexity: { type: 'score', criteria: ['Direct documented answer', 'Combine several facts', 'Diagnosis requiring specialist reasoning'] },
  urgent: { type: 'noul', instructions: 'Does the request describe a currently blocked production operation?' },
} as const satisfies DecisionQuestionMap;

export class IntakeDecisionStep extends DecisionStep<typeof TRIAGE> {
  defineQuestions() { return TRIAGE; }

  override getPrompt() { return Instructions; }

  async onDecision(answers: DecisionAnswers<typeof TRIAGE>): Promise<DecisionResponse> {
    this.saveState({ route: answers.route.choice, triage: answers });
    if (answers.route.choice === 'complete' && answers.route.confidence >= 0.8) {
      return finish('Thanks for contacting Northstar support. This conversation is complete.');
    }
    if (answers.route.confidence < 0.75 || ['unclear', 'complete'].includes(answers.route.choice))
      return go(ClarifyStep);
    if (answers.route.choice === 'billing')
      return go(BillingPolicyStep);
    if (answers.complexity.score >= 1.5 || answers.urgent.noul >= 0.9)
      return go(TechnicalSpecialistStep);
    return go(QuickAnswerStep);
  }
}
