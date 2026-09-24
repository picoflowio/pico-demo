import {
  DecisionStep,
  Prompt,
  directTo,
  go,
  type DecisionAnswers,
  type DecisionErrorContext,
  type DecisionQuestionMap,
  type DecisionResponse,
} from '@picoflow/core';
import { CriteriaHelper } from './criteria-helper.js';
import { RouterStep } from './router-step.js';
import { SearchHotelsStep } from './search-hotels-step.js';

const Instructions = Prompt.file('prompt/criteria-judge.md');

const REVIEW = {
  outcome: {
    type: 'choice',
    criteria: {
      ready: 'The saved criteria reflect the latest requests and are ready to search',
      dates: 'Dates are missing, ambiguous, or contradict the latest correction',
      budget: 'Budget is missing, ambiguous, or contradicts the latest correction',
      room_type: 'Room type is missing, ambiguous, or contradicts the latest correction',
      amenities: 'Amenities are missing, ambiguous, or contradict the latest correction',
      distance: 'Distance limits are missing, ambiguous, or contradict the latest correction',
      unclear: 'More than one criterion is unresolved or the conversation is ambiguous',
    },
  },
  faithful: {
    type: 'noul',
    criteria: {
      true: 'The normalized criteria faithfully reflect the latest corrections and explicit no-preference choices',
      false: 'One or more normalized criteria miss or contradict the latest user request',
    },
  },
} as const satisfies DecisionQuestionMap;

export class CriteriaReadinessJudgeStep extends DecisionStep<typeof REVIEW> {
  public defineQuestions() {
    return REVIEW;
  }

  public override getPrompt(): string {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    return Prompt.replace(Instructions, {
      NORMALIZED_CRITERIA: JSON.stringify(criteria, null, 2),
      DETERMINISTIC_ISSUES:
        issues.length === 0
          ? 'None. Application validation accepts every saved criterion.'
          : issues
            .map(
              (issue, index) =>
                `${index + 1}. ${issue.field}: ${issue.message}`,
            )
            .join('\n'),
    });
  }

  /** Supplies the structured subject Jev evaluates; getPrompt() supplies guidance. */
  protected override getDecisionData() {
    const criteria = CriteriaHelper.readCriteria(this);
    return {
      criteria,
      deterministicIssues: CriteriaHelper.validateCriteria(criteria),
    };
  }

  public override async onDecisionError(
    _context: DecisionErrorContext,
  ): Promise<DecisionResponse> {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    return issues.length > 0
      ? go(CriteriaHelper.nextStep(issues))
      : go(SearchHotelsStep);
  }

  public async onDecision(
    answers: DecisionAnswers<typeof REVIEW>,
  ): Promise<DecisionResponse> {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    const outcome = answers.outcome.choice;
    const accepted =
      issues.length === 0 &&
      outcome === 'ready' &&
      answers.faithful.noul >= 0.75;

    this.saveState({ review: answers, accepted });

    if (issues.length > 0) {
      return go(CriteriaHelper.nextStep(issues));
    }
    if (accepted) {
      return go(SearchHotelsStep);
    }
    if (outcome !== 'ready' && outcome !== 'unclear') {
      return go(CriteriaHelper.nextStep(outcome));
    }
    return directTo(
      RouterStep,
      `${CriteriaHelper.renderCriteriaSummary(criteria)}
      I could not verify one clear correction. Tell me which single criterion to update.`,
    );
  }
}
