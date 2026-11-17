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
} from "@picoflow/core";
import { CriteriaReadinessJudgeStep } from "./criteria-readiness-judge-step.js";
import {
  CriteriaHelper,
  type HotelCriteriaSnapshot,
} from "./criteria-helper.js";

const SharedInstructions = Prompt.file("prompt/router.md");

/**
 * Dynamic-question technique:
 * `ReturnType` derives the DecisionStep answer types directly from the static
 * factory, avoiding a duplicate question-map type. `defineQuestions()` calls
 * the factory on every decision invocation, so each question can use current
 * Flow state. PicoFlow then prepends the shared `getPrompt()` text to each
 * question's generated `instructions` before sending the request to the decision provider.
 */
export class RouterStep extends DecisionStep<
  ReturnType<typeof RouterStep.buildRoutingQuestions>
> {
  public defineQuestions() {
    return RouterStep.buildRoutingQuestions(CriteriaHelper.readCriteria(this));
  }

  public override getPrompt(): string {
    return SharedInstructions;
  }

  protected override getDecisionFacts() {
    const criteria = CriteriaHelper.readCriteria(this);
    return {
      criteria,
      unresolved: CriteriaHelper.validateCriteria(criteria).map(
        (issue) => issue.field,
      ),
      notice: this.getState<string | null>("notice") ?? null,
    };
  }

  public async onDecision(
    answers: DecisionAnswers<
      ReturnType<typeof RouterStep.buildRoutingQuestions>
    >,
    context: DecisionContext,
  ): Promise<DecisionResponse> {
    const criteria = CriteriaHelper.readCriteria(this);
    const issues = CriteriaHelper.validateCriteria(criteria);
    const route = answers.destination.choice;

    const notice = this.getState<string | null>("notice");
    if (notice) {
      this.saveState({ notice: null });
      return directTo(RouterStep, notice);
    }

    this.saveState({
      lastRoute: route,
      lastDecision: answers,
    });

    switch (route) {
      case "unclear":
        return directTo(
          RouterStep,
          "I can update dates, nightly budget, room type, amenities, or distance. You can also ask to review or search the current criteria.",
        );
      case "exit":
        return finish("Thanks for considering Hilton hotels in Portland.");
      case "review":
        return directTo(
          RouterStep,
          `${CriteriaHelper.renderCriteriaSummary(criteria)}\n\nTell me what to revise, or say “search” when ready.`,
        );
      case "search":
        return issues.length > 0
          ? go(CriteriaHelper.nextStep(issues))
          : go(CriteriaReadinessJudgeStep);
      default: {
        const next = go(CriteriaHelper.nextStep(route));
        return answers.request_delivery.choice === "apply_request"
          ? next.withMessage(
              new HumanMessageEx(this, context.request, { origin: "user" }),
            )
          : next;
      }
    }
  }

  //..............................................................................................
  public override async onDecisionError(
    _context: DecisionErrorContext,
  ): Promise<DecisionResponse> {
    const notice = this.getState<string | null>("notice");
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

  //..............................................................................................
  /**
   * Builds a fresh question schema from the current criteria on every call.
   * The returned `instructions` are question-specific and may include dynamic
   * state such as `unresolvedSummary`. DecisionRunner preserves them and
   * constructs the effective instructions as:
   *
   *   [this.getPrompt(), question.instructions]
   *
   * Thus `getPrompt()` supplies shared rules while this factory independently
   * specializes `destination` and `request_delivery` without losing typed
   * question keys or choice labels.
   */
  private static buildRoutingQuestions(criteria: HotelCriteriaSnapshot) {
    const unresolved = CriteriaHelper.validateCriteria(criteria).map(
      (issue) => issue.field,
    );
    const unresolvedSummary =
      unresolved.length === 0 ? "none" : unresolved.join(", ");

    return {
      destination: {
        type: "choice",
        criteria: {
          dates: `${unresolved[0] === "dates" ? "NEXT COLLECTOR: collect stay dates when no new correction needs applying." : "NOT THE NEXT COLLECTOR: choose only for a NEW date pair DIFFERENT from saved dates."} Saved start=${criteria.dates.start ?? "unset"}, end=${criteria.dates.end ?? "unset"}. If the requested pair equals this pair, do not choose dates; that request is already handled.`,
          budget: `${unresolved[0] === "budget" ? "NEXT COLLECTOR: collect nightly budget when no new correction needs applying." : "NOT THE NEXT COLLECTOR: choose only for a NEW budget value DIFFERENT from saved budget."} Saved answered=${criteria.budget.answered}, min=${criteria.budget.min ?? "no limit"}, max=${criteria.budget.max ?? "no limit"}. Matching values on an answered budget are already handled.`,
          room_type: `${unresolved[0] === "room_type" ? "NEXT COLLECTOR: collect room type when no new correction needs applying." : "NOT THE NEXT COLLECTOR: choose only for a NEW room type DIFFERENT from the saved room type."} Saved room type=${criteria.roomType.roomType ?? "unset"}. A matching room type is already handled.`,
          amenities: `${unresolved[0] === "amenities" ? "NEXT COLLECTOR: ask for amenities when the latest request is already handled or contains no new correction." : "NOT THE NEXT COLLECTOR: choose only for a NEW amenity answer DIFFERENT from saved preferences, or an explicit amenity answer when unanswered."} Saved answered=${criteria.amenities.answered}, amenities=${JSON.stringify(criteria.amenities.amenities)}. Matching answered amenities, including an explicit no-preference empty list, are already handled.`,
          distance: `${unresolved[0] === "distance" ? "NEXT COLLECTOR: ask for distance preferences when the latest request is already handled or contains no new correction." : "NOT THE NEXT COLLECTOR: choose only for a NEW distance value DIFFERENT from saved limits, or an explicit distance answer when unanswered."} Saved answered=${criteria.distance.answered}, airport=${criteria.distance.airport ?? "no limit"}, city center=${criteria.distance.cityCenter ?? "no limit"}. Matching answered limits are already handled.`,
          review:
            "Display the currently saved criteria only, without running a hotel search",
          search:
            "Execute a hotel search and show matching hotels; choose this for the exact request “search”",
          exit: "End the hotel conversation without booking",
          unclear: "The request is ambiguous or outside this hotel flow",
        },
        instructions: `Choose the next destination for the latest request by comparing its requested values with the saved criteria.
        First unresolved criterion: ${unresolved[0] ?? "none"}. Current unresolved criteria in collection order: ${unresolvedSummary}.
        Current saved dates: ${criteria.dates.start ?? "unset"} through ${criteria.dates.end ?? "unset"}.
        Current saved budget: minimum ${criteria.budget.min ?? "no limit"}, maximum ${criteria.budget.max ?? "no limit"}; answered: ${criteria.budget.answered}.
        An explicit search request selects search. An explicit criteria review selects review. An explicit exit selects exit.
        A new or changed criterion value selects its owning collector, even if that criterion was answered before or is absent from unresolved. Compare actual values, not just answered flags.
        If the latest requested value already matches the saved value, the request is handled. In that case select exactly ${unresolved[0] ?? "review"}; do not select another collector or apply that value again.
        If the request is a greeting or supplies no criterion value, select exactly ${unresolved[0] ?? "review"}.
        Use unclear for an ambiguous or out-of-scope request. Never start a search without an explicit search request.`,
      },
      request_delivery: {
        type: "choice",
        criteria: {
          apply_request:
            "The latest request contains a criterion value or revision that is not yet reflected in the saved criteria",
          prompt_next:
            "The latest request contains no unapplied criterion value and unresolved criteria remain, so the next collector should prompt",
          none: "The latest request is for review, search, exit, an unclear or out-of-scope action, or is already handled with no unresolved criteria, so no collector should receive it",
        },
        instructions: `Classify the latest request independently by comparing its requested values with the saved criteria. Decide whether a supplied value still needs saving, without using the destination answer or treating priorRequests as pending work.
        Current saved dates: ${criteria.dates.start ?? "unset"} through ${criteria.dates.end ?? "unset"}.
        Current saved budget: minimum ${criteria.budget.min ?? "no limit"}, maximum ${criteria.budget.max ?? "no limit"}; answered: ${criteria.budget.answered}.
        Current unresolved criteria in collection order: ${unresolvedSummary}.
        Choose apply_request only for a supplied value that differs from the saved value, or an answer to a still-unanswered criterion. A date correction requires apply_request until BOTH saved dates match the requested dates.
        A collector returns to the router after saving; the same latest request is then already handled. If its requested values match the saved values, choose ${unresolved.length > 0 ? "prompt_next" : "none"}. Do not apply it again. Normalize natural dates and compare actual values.
        Choose prompt_next for a greeting or a request with no new criterion value when unresolved criteria remain.
        Choose none for an explicit review, search, exit, or out-of-scope request.`,
      },
    } as const satisfies DecisionQuestionMap;
  }
}
