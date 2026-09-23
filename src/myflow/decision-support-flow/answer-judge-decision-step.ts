import { DecisionStep, directTo, go, Prompt, type DecisionAnswers, type DecisionQuestionMap, type DecisionResponse } from '@picoflow/core';
import { SUPPORT_EVIDENCE, HANDOFF } from './support-evidence.js';
import { IntakeDecisionStep } from './intake-decision-step.js';
import { BillingPolicyStep } from './billing-policy-step.js';
import { ReviseAnswerStep } from './revise-answer-step.js';

const Instructions = Prompt.file('prompt/answer-judge-decision.md');

const REVIEW = {
  supported: { type: 'noul', instructions: 'Are all factual claims supported by the trusted evidence, with uncertainty stated where needed?' },
  contradiction: { type: 'noul', instructions: 'Does the draft contradict trusted evidence, claim an unperformed action, or reveal a secret?' },
  completeness: { type: 'score', criteria: ['Does not answer', 'Partially answers', 'Answers the request or clearly asks for indispensable missing information'] },
  clarity: { type: 'score', criteria: ['Confusing', 'Understandable', 'Clear answer and actionable next step'] },
} as const satisfies DecisionQuestionMap;

export class AnswerJudgeDecisionStep extends DecisionStep<typeof REVIEW> {
  defineQuestions() { return REVIEW; }
  override getPrompt() { return Instructions; }
  protected override getDecisionData() {
    return {
      draft: this.getState<string>('draft'),
      evidence: SUPPORT_EVIDENCE,
      billing: {
        outcome: this.getStepState(BillingPolicyStep, 'outcome') ?? null,
        invoice: this.getStepState(BillingPolicyStep, 'invoice') ?? null,
        refundIssued: false,
      },
    };
  }
  async onDecision(answers: DecisionAnswers<typeof REVIEW>): Promise<DecisionResponse> {
    const feedback = [];
    // Live Jev calibration: a fully evidence-backed API-key answer scored
    // 0.80, so 0.75 preserves a meaningful support threshold without
    // rejecting clear supported answers solely for model uncertainty.
    if (answers.supported.noul < 0.75)
      feedback.push('Remove unsupported claims or explicitly state what is unknown.');
    if (answers.contradiction.noul > 0.1)
      feedback.push('Correct contradictions and remove claims of unperformed account changes.');
    if (answers.completeness.score < 1.5 || answers.completeness.confidence < 0.75)
      feedback.push('Answer the request or ask for the specific missing information.');
    if (answers.clarity.score < 1.5 || answers.clarity.confidence < 0.75)
      feedback.push('Give a clear, concrete next step.');
    this.saveState({ feedback });
    this.saveState({ review: answers, accepted: feedback.length === 0, unavailable: false });
    if (feedback.length === 0) {
      const draft = this.getState<string>('draft');
      return directTo(IntakeDecisionStep, draft);
    }
    if (this.getState<number>('revision') === 0)
      return go(ReviseAnswerStep);
    return directTo(IntakeDecisionStep, HANDOFF);
  }
}
