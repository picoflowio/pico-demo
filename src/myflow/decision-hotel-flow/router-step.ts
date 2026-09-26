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
 * question's generated `instructions` before sending the schema to Jev.
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
   * constructs the effective Jev instructions as:
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
          dates: "Set or revise check-in and checkout dates",
          budget: "Set or revise minimum or maximum nightly budget",
          room_type: "Set or revise one bed, two beds, or suite",
          amenities: "Set or revise hotel amenity preferences",
          distance: "Set or revise airport or city-center distance limits",
          review:
            "Display the currently saved criteria only, without running a hotel search",
          search:
            "Execute a hotel search and show matching hotels; choose this for the exact request “search”",
          exit: "End the hotel conversation without booking",
          unclear: "The request is ambiguous or outside this hotel flow",
        },
        instructions: `Choose exactly one destination using the saved criteria and latest request. 
        Current unresolved criteria in collection order: ${unresolvedSummary}. 
        The exact request "search" routes to "search", never "review". 
        An explicit request to review saved criteria routes to "review". 
        An explicit exit routes to "exit". If the latest request sets or revises a criterion whose value is not reflected in the saved criteria, route to that criterion. 
        If its value is already reflected, do not route back to it; route to the first unresolved criterion. 
        If the request does not identify a criterion and unresolved criteria remain, route to the first unresolved criterion. 
        When every criterion is resolved and the latest criterion request is already reflected, route to "review"; never start a search automatically. 
        Use "unclear" only for an ambiguous or out-of-scope request.`,
      },
      request_delivery: {
        type: "choice",
        criteria: {
          apply_request:
            "The latest request contains a criterion value or revision that is not yet reflected in the saved criteria",
          prompt_next:
            "The latest request contains no unapplied criterion value and unresolved criteria remain, so the next collector should prompt",
          none: "The latest request is for review, search, exit, or an unclear or out-of-scope action, so no collector should receive it",
        },
        instructions: `Classify the latest request independently by comparing it with the saved criteria; do not depend on the destination answer. 
        Current unresolved criteria in collection order: ${unresolvedSummary}. 
        Choose "apply_request" when the latest request contains a criterion value or revision that is not yet reflected in the saved criteria. 
        Choose "prompt_next" when it contains no unapplied criterion value and unresolved criteria remain. 
        Choose "none" for review, search, exit, and unclear or out-of-scope requests.`,
      },
    } as const satisfies DecisionQuestionMap;
  }
}
