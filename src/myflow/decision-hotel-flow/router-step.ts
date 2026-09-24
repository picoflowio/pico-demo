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
import { CriteriaHelper, type CriteriaField } from './criteria-helper.js';

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
    instructions:
      'Choose exactly one destination from the supplied criteria. Classify only the latest request and use it for explicit revisions. The exact request "search" is always "search", never "review". When mode is "advance", choose the first unresolved criterion in this order: "dates", "budget", "room type", "amenities", "distance". When every criterion is answered, choose "review" rather than searching automatically.',
  },
} as const satisfies DecisionQuestionMap;

export class RouterStep extends DecisionStep<typeof ROUTING> {
  public defineQuestions() {
    return ROUTING;
  }

  public override getPrompt(): string {
    return Instructions;
  }

  protected override getDecisionData() {
    const criteria = CriteriaHelper.readCriteria(this);
    return {
      mode: this.getState<string>('mode') ?? 'request',
      criteria,
      unresolved: CriteriaHelper.validateCriteria(criteria).map((issue) => issue.field),
      notice: this.getState<string | null>('notice') ?? null,
    };
  }

  public override async onDecisionError(
    _context: DecisionErrorContext,
  ): Promise<DecisionResponse> {
    if (this.getState<string>('mode') === 'notice') {
      const notice =
        this.getState<string | null>('notice') ??
        'The hotel request could not be completed. Your criteria are still saved.';
      this.saveState({ mode: 'request', notice: null });
      return directTo(RouterStep, notice);
    }

    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);

    //do the routing based on the issues and the mode
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
    const mode = this.getState<string>('mode') ?? 'request';
    const route = answers.destination.choice;

    if (mode === 'notice') {
      const notice =
        this.getState<string | null>('notice') ??
        'The request could not be completed. Your hotel criteria are still saved.';
      this.saveState({ mode: 'request', notice: null });
      return directTo(RouterStep, notice);
    }

    this.saveState({
      mode: 'request',
      lastRoute: route,
      lastDecision: answers,
    });

    if (mode === 'advance') {
      if (issues.length > 0) {
        return go(CriteriaHelper.nextStep(issues));
      }
      return directTo(
        RouterStep,
        `${CriteriaHelper.renderCriteriaSummary(criteria)}\n\nSay “search” to find hotels, or tell me which criterion to revise.`,
      );
    }

    if (route === 'unclear') {
      if (issues.length === 5) {
        return go(CriteriaHelper.stepForField('dates'));
      }
      return directTo(
        RouterStep,
        'I can update dates, nightly budget, room type, amenities, or distance. You can also ask to review or search the current criteria.',
      );
    }

    if (route === 'exit') {
      return finish('Thanks for considering Hilton hotels in Portland.');
    }
    if (route === 'review') {
      return directTo(
        RouterStep,
        `${CriteriaHelper.renderCriteriaSummary(criteria)}\n\nTell me what to revise, or say “search” when ready.`,
      );
    }
    if (route === 'search') {
      if (issues.length > 0) {
        return go(CriteriaHelper.nextStep(issues));
      }
      return go(CriteriaReadinessJudgeStep);
    }

    return go(CriteriaHelper.stepForField(route as CriteriaField)).withMessage(
      new HumanMessageEx(this, context.request, { origin: 'user' }),
    );
  }
}
