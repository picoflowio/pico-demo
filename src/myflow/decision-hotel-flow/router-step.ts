import {
  DecisionStep,
  HumanMessageEx,
  Prompt,
  directTo,
  finish,
  go,
  type DecisionAnswers,
  type DecisionContext,
  type DecisionErrorContext,
  type DecisionQuestionMap,
  type DecisionResponse,
} from '@picoflow/core';
import { CriteriaReadinessJudgeStep } from './criteria-readiness-judge-step.js';
import { CriteriaHelper } from './criteria-helper.js';

const Instructions = Prompt.file('prompt/router.md');

const ROUTING = {
  destination: {
    type: 'choice',
    criteria: {
      dates: 'Set or revise check-in and checkout dates',
      budget: 'Set or revise minimum or maximum nightly budget',
      room_type: 'Set or revise one bed, two beds, or suite',
      amenities: 'Set or revise hotel amenity preferences',
      distance: 'Set or revise airport or city-center distance limits',
      review:
        'Display the currently saved criteria only, without running a hotel search',
      search:
        'Execute a hotel search and show matching hotels; choose this for the exact request “search”',
      exit: 'End the hotel conversation without booking',
      unclear: 'The request is ambiguous or outside this hotel flow',
    },
  },
  request_delivery: {
    type: 'choice',
    criteria: {
      apply_request:
        'The selected criterion step must receive the latest request because it contains an unapplied value or revision for that criterion',
      prompt_next:
        'The selected criterion is the next unresolved field, so it should prompt without receiving the already handled latest request',
      none: 'The destination is not a criterion collection step',
    },
  },
} as const satisfies DecisionQuestionMap;

export class RouterStep extends DecisionStep<typeof ROUTING> {
  public defineQuestions() {
    return ROUTING;
  }

  public override getPrompt(): string {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    return Prompt.replace(Instructions, {
      COLLECTED_CRITERIA: JSON.stringify(criteria, null, 2),
      UNRESOLVED_CRITERIA:
        issues.length === 0
          ? 'None. Every criterion has a valid saved answer.'
          : issues
              .map(
                (issue, index) =>
                  `${index + 1}. ${issue.field}: ${issue.message}`,
              )
              .join('\n'),
    });
  }

  protected override getDecisionData() {
    const criteria = CriteriaHelper.readCriteria(this);
    return {
      criteria,
      unresolved: CriteriaHelper.validateCriteria(criteria).map(
        (issue) => issue.field,
      ),
      notice: this.getState<string | null>('notice') ?? null,
    };
  }

  public override async onDecisionError(
    _context: DecisionErrorContext,
  ): Promise<DecisionResponse> {
    const notice = this.getState<string | null>('notice');
    if (notice) {
      this.saveState({ notice: null });
      return directTo(RouterStep, notice);
    }

    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);

    // Keep a deterministic fallback only for an unavailable decision provider.
    if (issues.length > 0) {
      return go(CriteriaHelper.nextStep(issues));
    } else {
      return directTo(
        RouterStep,
        `${CriteriaHelper.renderCriteriaSummary(criteria)}
        Say “search” to find hotels, or tell me which criterion to revise.`,
      );
    }
  }

  public async onDecision(
    answers: DecisionAnswers<typeof ROUTING>,
    context: DecisionContext,
  ): Promise<DecisionResponse> {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    const route = answers.destination.choice;

    const notice = this.getState<string | null>('notice');
    if (notice) {
      this.saveState({ notice: null });
      return directTo(RouterStep, notice);
    }

    this.saveState({
      lastRoute: route,
      lastDecision: answers,
    });

    switch (route) {
      case 'unclear':
        return directTo(
          RouterStep,
          'I can update dates, nightly budget, room type, amenities, or distance. You can also ask to review or search the current criteria.',
        );
      case 'exit':
        return finish('Thanks for considering Hilton hotels in Portland.');
      case 'review':
        return directTo(
          RouterStep,
          `${CriteriaHelper.renderCriteriaSummary(criteria)}\n\nTell me what to revise, or say “search” when ready.`,
        );
      case 'search':
        return issues.length > 0
          ? go(CriteriaHelper.nextStep(issues))
          : go(CriteriaReadinessJudgeStep);
      default: {
        const next = go(CriteriaHelper.nextStep(route));
        return answers.request_delivery.choice === 'apply_request'
          ? next.withMessage(
              new HumanMessageEx(this, context.request, { origin: 'user' }),
            )
          : next;
      }
    }
  }
}
