import { LogicStep, go, type LogicResponseType } from '@picoflow/core';
import { searchHotelsViaMcp } from '../../tools/hotel-pricing-mcp-client.js';
import { CriteriaReadinessJudgeStep } from './criteria-readiness-judge-step.js';
import { CriteriaHelper } from './criteria-helper.js';
import { PresentStep } from './present-step.js';
import { RouterStep } from './router-step.js';

export class SearchHotelsStep extends LogicStep {
  public async runLogic(): Promise<LogicResponseType> {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    if (issues.length > 0) {
      return go(CriteriaHelper.nextStep(issues));
    }

    let hotels;
    try {
      hotels = await searchHotelsViaMcp(CriteriaHelper.toSearchRequest(criteria));
    } catch {
      return go(RouterStep).withState({
        mode: 'notice',
        notice:
          'Hotel pricing is temporarily unavailable. Your criteria are saved; say “search” to try again.',
      });
    }

    if (hotels.length === 0) {
      return go(RouterStep).withState({
        mode: 'notice',
        notice:
          'No hotels matched all current criteria. Tell me whether to revise budget, room type, amenities, or distance.',
      });
    }

    return go(PresentStep).withState({
      hotelFound: hotels,
      criteria,
      criteriaReviewAccepted:
        this.getStepState<boolean>(CriteriaReadinessJudgeStep, 'accepted') ===
        true,
    });
  }
}
