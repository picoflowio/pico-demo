# DecisionSupportFlow

A new, read-only Northstar Cloud support demo combining Jev decisions and generative Steps. All account evidence is fictional.

```text
IntakeDecisionStep
  -> ClarifyStep (clarification draft)
  -> QuickAnswerStep / TechnicalSpecialistStep
  -> BillingPolicyStep -> BillingAnswerStep
  -> AnswerJudgeDecisionStep
      -> approved draft -> next customer turn
      -> ReviseAnswerStep -> judge once more
      -> fixed handoff after a second rejection or provider failure
```

Intake batches Choice (route), Score (complexity), and Noul (urgency). The judge batches two Noul and two Score checks. Thresholds and billing policy are code-owned. Drafts remain internal until accepted. Explicit conversation completion marks the session completed.

The intake and judge share one PicoFlow memory namespace. `DecisionStep` derives the current request and four-request history from that message stream. Regular Steps read the same conversation through `Flow.getConversation()`; no Step copies it into state. The intake contains no input-construction hook, and the judge adds only its draft, evidence, and billing data through `getDecisionData()`.

Accepted drafts and fixed handoffs use `directTo(IntakeDecisionStep, content)`. This returns the content immediately while leaving Intake ready for the next customer message, without making another Jev call.

Set server-side `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, and the existing `PICOFLOW_KEY`. The application uses its normal session backend. Start the demo normally and select `DecisionSupportFlow` (or pass that name to the existing flow endpoint). Ordinary answers use `gpt-5.6-luna` with low reasoning effort; specialist and revision Steps use `gpt-5.1`. Jev defaults to `jev-latest`.

Run `npm run test:decision-support-flow` from the demo repository. The deterministic scenario has twenty turns, with ambiguity, corrections, topic changes, complexity/urgency routing, billing policy checks, a successful revision, bounded rejection, an unavailable judge, restored-session continuation, and completion. A separate live smoke test runs when all three credentials exist. It preserves `.env` configuration, including `SESSION_STORE`, and writes `test/.tmp/decision-support-flow/live.json` only on full success.

The deterministic replay verifies application behavior with scripted decisions and model responses. It does not establish Jev accuracy. Calibrate thresholds with independently labeled requests and drafts before production use; latency and cost comparisons require measured live baselines.


## Source layout

`decision-support-flow.ts` contains Flow configuration, step registration, and provider-failure policy. Each registered Step has its own sibling `*-step.ts` file, following HotelFlow's layout. `prompt/` contains the externalized conversational and decision-provider instructions. Triage and review question schemas stay with their respective decision Steps. `support-evidence.ts` contains fictional evidence and the handoff message; `decision-support-memory.ts` names the shared conversation memory.
