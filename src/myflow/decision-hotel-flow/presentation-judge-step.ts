import {
  DecisionStep,
  Prompt,
  directTo,
  type DecisionAnswers,
  type DecisionErrorContext,
  type DecisionQuestionMap,
  type DecisionResponse,
} from '@picoflow/core';
import type { SearchHotelEntry } from '../hotel-flow/backend/pricing-engine.js';
import { renderHotelResults } from './hotel-criteria.js';
import { PresentStep } from './present-step.js';

const Instructions = Prompt.file('prompt/presentation-judge.md');

const REVIEW = {
  grounded: {
    type: 'noul',
    instructions:
      'Are all hotel names and prices in the draft supported by hotelFound, with no invented booking or amenity claim?',
  },
  completeness: {
    type: 'score',
    criteria: [
      'Missing the result list',
      'Lists hotels but omits an important action',
      'Lists matching hotels with total prices and explains how to book or revise',
    ],
  },
  clarity: {
    type: 'score',
    criteria: ['Confusing', 'Understandable', 'Clear numbered choices'],
  },
} as const satisfies DecisionQuestionMap;

export class PresentationJudgeStep extends DecisionStep<typeof REVIEW> {
  public defineQuestions() {
    return REVIEW;
  }

  public override getPrompt(): string {
    return Instructions;
  }

  protected override getDecisionData() {
    return {
      draft: this.getStepState<string>(PresentStep, 'draft') ?? '',
      hotelFound:
        this.getStepState<SearchHotelEntry[]>(PresentStep, 'hotelFound') ?? [],
      criteria: this.getStepState(PresentStep, 'criteria') ?? {},
    };
  }

  public override async onDecisionError(
    _context: DecisionErrorContext,
  ): Promise<DecisionResponse> {
    const hotels =
      this.getStepState<SearchHotelEntry[]>(PresentStep, 'hotelFound') ?? [];
    return directTo(PresentStep, renderHotelResults(hotels));
  }

  public async onDecision(
    answers: DecisionAnswers<typeof REVIEW>,
  ): Promise<DecisionResponse> {
    const hotels =
      this.getStepState<SearchHotelEntry[]>(PresentStep, 'hotelFound') ?? [];
    const draft = this.getStepState<string>(PresentStep, 'draft') ?? '';
    const accepted =
      answers.grounded.noul >= 0.85 &&
      answers.completeness.score >= 1.5 &&
      answers.completeness.confidence >= 0.75 &&
      answers.clarity.score >= 1.5 &&
      answers.clarity.confidence >= 0.75;

    this.saveState({ review: answers, accepted });
    return directTo(
      PresentStep,
      accepted ? draft : renderHotelResults(hotels),
    );
  }
}
