import { go, Prompt, Step, type Flow } from '@picoflow/core';
import { AnswerJudgeDecisionStep } from './answer-judge-decision-step.js';
import { BillingPolicyStep } from './billing-policy-step.js';
import { SUPPORT_EVIDENCE } from './support-evidence.js';
import { DECISION_SUPPORT_MEMORY } from './decision-support-memory.js';

const Instructions = Prompt.file('prompt/billing-answer.md');
const DraftPrompt = Prompt.file('prompt/draft.md');

export class BillingAnswerStep extends Step {
  constructor(flow: Flow) { super(flow); }

  override getPrompt() {
    return Prompt.replace(DraftPrompt, {
      MODE: Instructions,
      REQUEST: JSON.stringify(this.flow.getConversation(DECISION_SUPPORT_MEMORY)),
      EVIDENCE: JSON.stringify(SUPPORT_EVIDENCE),
      BILLING_POLICY_RESULT: JSON.stringify(this.getStepState(BillingPolicyStep)),
    });
  }

  override async onResponse(text: string | object) {
    const draft = typeof text === 'string' ? text : JSON.stringify(text);
    this.saveState({ draft });
    return go(AnswerJudgeDecisionStep).withState({
      draft,
      source: this.getName(),
      revision: 0,
    });
  }
}
