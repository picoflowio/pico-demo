import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

register('../mock-license-loader.mjs', import.meta.url);

const {
  ConfigManager,
  DecisionProvider,
  FlowEngine,
  MemorySessionStore,
} = await import('@picoflow/core');
const { DecisionHotelFlow: BaseDecisionHotelFlow } = await import(
  '../../src/myflow/decision-hotel-flow/decision-hotel-flow.js'
);
// Keep the simulated Google transport independent of the live provider choice.
const DecisionHotelFlow = class DecisionHotelFlow extends BaseDecisionHotelFlow {
  protected override configDecision() {
    return {
      provider: 'google',
      model: 'gemini-decision-1',
      timeoutMs: 15_000,
      maxRetries: 2,
    };
  }
};
const { CriteriaHelper } = await import(
  '../../src/myflow/decision-hotel-flow/criteria-helper.js'
);
const { closeHotelPricingMcpClient } = await import(
  '../../src/tools/hotel-pricing-mcp-client.js'
);

type ScenarioTurn = {
  label: string;
  input: string;
  activeStep: string;
  completed?: boolean;
  excludes?: string;
  includes?: string;
};

const turns: ScenarioTurn[] = [
  {
    label: 'keep an unrelated request at the router',
    input: 'What is the weather in Seattle?',
    activeStep: 'RouterStep',
    includes: 'I can update dates',
  },
  { label: 'start with dates', input: 'Hi', activeStep: 'DateRangeStep' },
  {
    label: 'reject impossible calendar dates',
    input: '2027-02-30 to 2027-03-05',
    activeStep: 'DateRangeStep',
  },
  {
    label: 'reject past dates',
    input: '2025-08-01 to 2025-08-08',
    activeStep: 'DateRangeStep',
  },
  {
    label: 'accept dates',
    input: '2027-08-01 to 2027-08-08',
    activeStep: 'BudgetStep',
  },
  {
    label: 'reject inverted budget',
    input: 'minimum 800 and maximum 500',
    activeStep: 'BudgetStep',
  },
  { label: 'accept budget', input: 'maximum 700', activeStep: 'RoomTypeStep' },
  { label: 'accept room', input: 'suite', activeStep: 'AmenityStep' },
  {
    label: 'reroute date correction from amenities',
    input: 'Actually change my dates to 2027-08-03 through 2027-08-09',
    activeStep: 'AmenityStep',
  },
  {
    label: 'accept amenities',
    input: 'free wifi and free parking',
    activeStep: 'DistanceStep',
  },
  {
    label: 'reject negative distance',
    input: 'airport within -5 miles',
    activeStep: 'DistanceStep',
  },
  {
    label: 'waive distance',
    input: 'distance does not matter',
    activeStep: 'RouterStep',
  },
  {
    label: 'review criteria',
    input: 'show my criteria',
    activeStep: 'RouterStep',
  },
  {
    label: 'criteria judge requests budget confirmation',
    input: 'search',
    activeStep: 'BudgetStep',
  },
  {
    label: 'reaffirm budget',
    input: 'maximum 700',
    activeStep: 'RouterStep',
  },
  {
    label: 'presentation judge rejects invented draft',
    input: 'search',
    activeStep: 'PresentStep',
    excludes: 'Invented Waterfront Palace',
  },
  {
    label: 'revise budget to an empty result set',
    input: 'change maximum budget to 500',
    activeStep: 'RouterStep',
  },
  {
    label: 'report no matching hotels without looping',
    input: 'search',
    activeStep: 'RouterStep',
    includes: 'No hotels matched',
  },
  {
    label: 'revise budget after empty results',
    input: 'change maximum budget to 750',
    activeStep: 'RouterStep',
  },
  {
    label: 'presentation outage falls back to grounded results',
    input: 'search',
    activeStep: 'PresentStep',
  },
  {
    label: 'revise budget after presentation fallback',
    input: 'change maximum budget to 760',
    activeStep: 'RouterStep',
  },
  {
    label: 'accept presentation after another search',
    input: 'search',
    activeStep: 'PresentStep',
  },
  {
    label: 'book a validated result',
    input: 'book hotel 1',
    activeStep: 'PresentStep',
    completed: true,
  },
];

test(
  'decision hotel flow routes corrections, local decision fallbacks, both judges, then books',
  { timeout: 60_000 },
  async () => {
    process.env.HOTEL_FLOW_CURRENT_DATE = '2026-01-15T00:00:00.000Z';
    let currentInput = '';
    const simulatedOutages = new Set<string>();
    const fixtureErrors: unknown[] = [];
    let criteriaReviews = 0;
    let presentationReviews = 0;
    let toolCallId = 0;
    const routerInstructions: string[] = [];
    const criteriaJudgeInstructions: string[] = [];

    const engine = await FlowEngine.create({
      flows: [DecisionHotelFlow],
      sessionStore: new MemorySessionStore(),
      configManager: new ConfigManager({
        ignoreEnvFile: true,
        environment: {},
        values: { SESSION_STORE: 'MEMORY' },
      }),
      decisionProviders: DecisionProvider.create({
        google: {
          apiKey: 'test-only',
          async fetch(url, options) {
            const body = String(options?.body);
            const outage = () => {
              simulatedOutages.add(body);
              return new Response(null, { status: 503 });
            };
            if (simulatedOutages.has(body)) return outage();
            try {
              assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/decisions');
              assert.ok(options?.signal instanceof AbortSignal);
              const request = JSON.parse(body) as {
                model: string;
                input: string;
                questions: Record<string, { instructions: string; criteria?: unknown }>;
              };
              assert.equal(request.model, 'gemini-decision-1');
              const state = JSON.parse(request.input) as Record<string, any>;
              if ('destination' in request.questions) {
                const unresolved = state.unresolved as string[];
                const criteria = state.criteria as Record<string, any>;
                const instructions = splitInstructions(request.questions.destination!.instructions);
                const deliveryInstructions = splitInstructions(request.questions.request_delivery!.instructions);
                assert.equal(deliveryInstructions[0], instructions[0]);
                assert.notEqual(deliveryInstructions[1], instructions[1]);
                assert.doesNotMatch(instructions[0], /{{[A-Z_]+}}/);
                assert.match(
                  instructions[0],
                  /structured decision state as the source of truth/i,
                );
                const unresolvedSummary =
                  unresolved.length === 0 ? 'none' : unresolved.join(', ');
                assert.ok(
                  (instructions[1]).includes(
                    `Current unresolved criteria in collection order: ${unresolvedSummary}.`,
                  ),
                );
                assert.ok(
                  (deliveryInstructions[1]).includes(
                    `Current unresolved criteria in collection order: ${unresolvedSummary}.`,
                  ),
                );
                assert.match(
                  deliveryInstructions[1],
                  /classify the latest request independently/i,
                );
                assert.equal('mode' in state, false);
                routerInstructions.push(instructions[1]);

                if (state.notice) {
                  return outage();
                }

                let route: string;
                let delivery = 'none';
                if (/weather/i.test(currentInput)) {
                  route = 'unclear';
                } else if (/show.*criteria|review/i.test(currentInput)) {
                  route = 'review';
                } else if (/^search$/i.test(currentInput)) {
                  route = 'search';
                } else if (/\b(exit|quit|stop)\b/i.test(currentInput)) {
                  route = 'exit';
                } else {
                  const requested = requestedCriterion(currentInput);
                  const needsApplication =
                    requested !== undefined &&
                    !criterionIsReflected(requested, currentInput, criteria);
                  route = needsApplication
                    ? requested
                    : (unresolved[0] ?? 'review');
                  delivery = needsApplication ? 'apply_request' : 'prompt_next';
                }
                return geminiResponse({
                  destination: choiceAnswer(
                    route,
                    [
                      'dates',
                      'budget',
                      'room_type',
                      'amenities',
                      'distance',
                      'review',
                      'search',
                      'exit',
                      'unclear',
                    ],
                  ),
                  request_delivery: choiceAnswer(delivery, [
                    'apply_request',
                    'prompt_next',
                    'none',
                  ]),
                }, 20);
              }

              if ('outcome' in request.questions) {
                assert.equal(typeof state.criteria, 'object');
                assert.ok(Array.isArray(state.deterministicIssues));
                assert.equal(typeof state.request, 'string');
                assert.ok(Array.isArray(state.priorRequests));

                const outcomeInstructions = request.questions.outcome!.instructions;
                const faithfulInstructions = request.questions.faithful!.instructions;
                assert.match(faithfulInstructions, /faithfully reflect the latest user requests/);
                assert.match(outcomeInstructions, /which saved criterion needs correction/i);
                assert.doesNotMatch(
                  outcomeInstructions,
                  /{{[A-Z_]+}}/,
                );
                assert.match(
                  outcomeInstructions,
                  /normalized criteria being reviewed/i,
                );
                criteriaJudgeInstructions.push(outcomeInstructions);

                criteriaReviews += 1;
                if (criteriaReviews === 2) {
                  return outage();
                }
                const outcome = criteriaReviews === 1 ? 'budget' : 'ready';
                return geminiResponse({
                  outcome: choiceAnswer(outcome, [
                    'ready',
                    'dates',
                    'budget',
                    'room_type',
                    'amenities',
                    'distance',
                    'unclear',
                  ]),
                  faithful: { type: 'noul', noul: 0.99, confidence: 0.99 },
                }, 30);
              }

              presentationReviews += 1;
              if (presentationReviews === 2) {
                return outage();
              }
              const accepted = presentationReviews > 1;
              return geminiResponse({
                grounded: { type: 'noul', noul: accepted ? 0.99 : 0.1, confidence: accepted ? 0.99 : 0.9 },
                completeness: score(2, request.questions.completeness!.criteria),
                clarity: score(2, request.questions.clarity!.criteria),
              }, 30);
            } catch (error) {
              fixtureErrors.push(error);
              throw error;
            }
          },
        },
      }),
      providers: [
        {
          provider: 'openai',
          resolve(selection) {
            return {
              ...selection,
              createInstance() {
                return {
                  bindTools() {
                    return this;
                  },
                  async invoke(messages: Array<{ content?: unknown }>) {
                    const systemPrompt = messageText(messages[0]?.content);
                    const latestHuman = latestHumanText(messages);
                    const latestMessage = messageText(messages.at(-1)?.content);

                    const tool = (
                      name: string,
                      args: Record<string, unknown>,
                    ) =>
                      new AIMessage({
                        content: '',
                        tool_calls: [
                          {
                            id: `decision-hotel-${++toolCallId}`,
                            name,
                            args,
                            type: 'tool_call',
                          },
                        ],
                      });

                    if (systemPrompt.includes('collect only hotel check-in')) {
                      if (
                        latestMessage.includes('after the current date') ||
                        latestMessage.includes('valid calendar dates')
                      ) {
                        return new AIMessage({ content: latestMessage });
                      }
                      const match = latestHuman.match(
                        /(20\d{2})-(\d{2})-(\d{2}).*?(20\d{2})-(\d{2})-(\d{2})/,
                      );
                      if (match) {
                        return tool('capture_date_range', {
                          start: `${match[1]}-${match[2]}-${match[3]}`,
                          end: `${match[4]}-${match[5]}-${match[6]}`,
                        });
                      }
                      return new AIMessage({
                        content: latestMessage.includes('must be after')
                          ? latestMessage
                          : 'What are your check-in and checkout dates?',
                      });
                    }

                    if (systemPrompt.includes('minimum and maximum hotel budget')) {
                      if (latestMessage.includes('cannot exceed')) {
                        return new AIMessage({ content: latestMessage });
                      }
                      if (/minimum 800.*maximum 500/i.test(latestHuman)) {
                        return tool('capture_budget', { min: 800, max: 500 });
                      }
                      const max = latestHuman.match(/(?:maximum|max(?:imum)? budget)\D*(\d+)/i);
                      if (max) {
                        return tool('capture_budget', {
                          min: null,
                          max: Number(max[1]),
                        });
                      }
                      return new AIMessage({
                        content: latestMessage.includes('cannot exceed')
                          ? latestMessage
                          : 'What nightly budget range should I use?',
                      });
                    }

                    if (systemPrompt.includes('exactly one supported room type')) {
                      if (/suite/i.test(latestHuman)) {
                        return tool('capture_room_type', { roomType: 'suite' });
                      }
                      return new AIMessage({
                        content: 'Choose one bed, two beds, or suite.',
                      });
                    }

                    if (systemPrompt.includes('collect required hotel amenities')) {
                      if (/change my dates/i.test(latestHuman)) {
                        return tool('reroute_request', {});
                      }
                      if (/free wifi.*free parking/i.test(latestHuman)) {
                        return tool('capture_amenities', {
                          amenities: ['freeWiFi', 'freeParking'],
                        });
                      }
                      return new AIMessage({
                        content: 'Which amenities do you require?',
                      });
                    }

                    if (systemPrompt.includes('maximum distance in miles')) {
                      if (latestMessage.includes('cannot be negative')) {
                        return new AIMessage({ content: latestMessage });
                      }
                      if (/-5/.test(latestHuman)) {
                        return tool('capture_distance', {
                          airport: -5,
                          cityCenter: null,
                        });
                      }
                      if (/does not matter/i.test(latestHuman)) {
                        return tool('capture_distance', {
                          airport: null,
                          cityCenter: null,
                        });
                      }
                      return new AIMessage({
                        content: latestMessage.includes('cannot be negative')
                          ? latestMessage
                          : 'Do you have an airport or city-center distance limit?',
                      });
                    }

                    if (systemPrompt.includes('Present only the hotels')) {
                      if (/change maximum budget/i.test(latestHuman)) {
                        return tool('revise_search', {});
                      }
                      if (/book hotel 1/i.test(latestHuman)) {
                        return tool('chosen_hotel', { hotelName: '1' });
                      }
                      if (presentationReviews === 0) {
                        return new AIMessage({
                          content:
                            '1. Invented Waterfront Palace — total $1. Book now.',
                        });
                      }
                      const names = [
                        ...systemPrompt.matchAll(/"hotelName":"([^"]+)"/g),
                      ].map((match) => match[1]);
                      return new AIMessage({
                        content: `Matching hotels include ${names.join(', ')}. Reply with a hotel name or number to book, or revise your criteria.`,
                      });
                    }

                    if (/Confirm that .* is booked/.test(systemPrompt)) {
                      const hotel = systemPrompt.match(/Confirm that (.*?) is booked/)?.[1];
                      const confirmation = systemPrompt.match(/#(\d{6})/)?.[1];
                      return new AIMessage({
                        content: `${hotel} is booked with confirmation #${confirmation}. Thank you for choosing Hilton.`,
                      });
                    }

                    throw new Error(
                      `No scripted response for prompt: ${systemPrompt.slice(0, 120)}`,
                    );
                  },
                };
              },
              useTools(llm: unknown) {
                return llm;
              },
            };
          },
        },
      ],
    });

    let sessionId: string | undefined;
    try {
      for (const turn of turns) {
        currentInput = turn.input;
        simulatedOutages.clear();
        console.log(`[DecisionHotelFlow] ${turn.label}: ${turn.input}`);
        const response = await engine.run({
          flowName: DecisionHotelFlow.id,
          userMessage: turn.input,
          ...(sessionId ? { sessionId } : {}),
        });
        assert.equal(response.success, true, `${turn.label}: ${response.message}`);
        console.log(`[DecisionHotelFlow] response: ${response.message.slice(0, 180)}`);
        assert.equal(response.completed, turn.completed === true, turn.label);
        if (turn.excludes) {
          assert.doesNotMatch(response.message, new RegExp(turn.excludes, 'i'));
        }
        if (turn.includes) {
          assert.match(response.message, new RegExp(turn.includes, 'i'));
        }
        sessionId = response.session;
        const doc = await engine.getFlowSession().fetchAll(sessionId);
        assert.equal(doc?.flow.currentStep, turn.activeStep, turn.label);
      }

      const doc = await engine.getFlowSession().fetchAll(sessionId!);
      assert.ok(doc);
      assert.deepEqual(stepState(doc.flow, 'DateRangeStep'), {
        answered: true,
        start: '2027-08-03',
        end: '2027-08-09',
      });
      assert.deepEqual(stepState(doc.flow, 'BudgetStep'), {
        answered: true,
        min: null,
        max: 760,
      });
      assert.deepEqual(stepState(doc.flow, 'RoomTypeStep'), {
        answered: true,
        roomType: 'suite',
      });
      assert.deepEqual(stepState(doc.flow, 'AmenityStep'), {
        answered: true,
        amenities: ['freeWiFi', 'freeParking'],
      });
      assert.equal(
        stepState(doc.flow, 'CriteriaReadinessJudgeStep').accepted,
        true,
      );
      assert.equal(
        stepState(doc.flow, 'PresentationJudgeStep').accepted,
        true,
      );
      const present = stepState(doc.flow, 'PresentStep');
      assert.equal(typeof present.selectedHotel, 'string');
      assert.ok(
        (present.hotelFound as Array<{ hotelName: string }>).some(
          (hotel) => hotel.hotelName === present.selectedHotel,
        ),
      );
      assert.match(String(present.confirmationNumber), /^\d{6}$/);
      assert.deepEqual(fixtureErrors, []);
      assert.ok(doc.decisionUsage.calls >= 12);
      assert.ok(doc.debug.some(entry => entry.kind === 'decision' &&
        entry.provider === 'google' && entry.model === 'gemini-decision-1'));
      assert.ok(routerInstructions.length >= 12);
      assert.match(
        routerInstructions[0]!,
        /dates, budget, room_type, amenities, distance/,
      );
      assert.ok(
        routerInstructions.some(
          (instruction) => instruction.includes(
            'Current unresolved criteria in collection order: none.',
          ),
        ),
      );
      assert.equal(criteriaJudgeInstructions.length, 5);
      assert.ok(
        criteriaJudgeInstructions.every((instruction) =>
          instruction.includes('"start": "2027-08-03"'),
        ),
      );
      for (const maximum of [500, 700, 750, 760]) {
        assert.ok(
          criteriaJudgeInstructions.some((instruction) =>
            instruction.includes(`"max": ${maximum}`),
          ),
        );
      }
      assert.equal(
        doc.flow.steps.some((step) => step.name === 'CompareStep'),
        false,
      );
    } finally {
      delete process.env.HOTEL_FLOW_CURRENT_DATE;
      await closeHotelPricingMcpClient();
      await engine.close();
    }
  },
);

test('criteria summary distinguishes unanswered fields from no preference', () => {
  const summary = CriteriaHelper.renderCriteriaSummary({
    dates: { answered: false, start: null, end: null },
    budget: { answered: false, min: null, max: null },
    roomType: { answered: false, roomType: null },
    amenities: { answered: false, amenities: [] },
    distance: { answered: false, airport: null, cityCenter: null },
  });

  assert.match(summary, /Dates: not set/);
  assert.match(summary, /Nightly budget: not set/);
  assert.match(summary, /Room type: not set/);
  assert.match(summary, /Amenities: not set/);
  assert.match(summary, /Distance: not set/);
  assert.doesNotMatch(summary, /no preference/);
});

function choiceAnswer(choice: string, labels: string[]) {
  return {
    type: 'choice' as const,
    choice,
    confidence: 0.99,
    probabilities: Object.fromEntries(
      labels.map((label) => [label, label === choice ? 1 : 0]),
    ),
  };
}

function splitInstructions(instructions: string): [string, string] {
  const separator = instructions.lastIndexOf('\n\n');
  assert.ok(separator >= 0);
  return [instructions.slice(0, separator), instructions.slice(separator + 2)];
}

function geminiResponse(answers: object, inputTokens: number) {
  return Response.json({
    answers,
    usage: { total_input_tokens: inputTokens, total_output_tokens: 0 },
  });
}

function score(value: number, criteria: unknown) {
  assert.ok(Array.isArray(criteria));
  assert.ok(criteria.every(level => typeof level === 'string'));
  return {
    type: 'score' as const,
    score: value,
    confidence: 0.99,
    legend: Object.fromEntries(criteria.map((description, index) => [index, description])),
    probabilities: { 0: value === 0 ? 1 : 0, 1: value === 1 ? 1 : 0, 2: value === 2 ? 1 : 0 },
  };
}

function requestedCriterion(input: string): string | undefined {
  if (/date|check-in|checkout|20\d{2}-\d{2}-\d{2}/i.test(input)) return 'dates';
  if (/budget|maximum|minimum|\$\d+/i.test(input)) return 'budget';
  if (/room|one bed|two beds|suite/i.test(input)) return 'room_type';
  if (/amenit|wifi|parking|breakfast|pool|fitness/i.test(input)) {
    return 'amenities';
  }
  if (/distance|airport|city.?center|miles?/i.test(input)) return 'distance';
  return undefined;
}

function criterionIsReflected(
  field: string,
  input: string,
  criteria: Record<string, any>,
): boolean {
  if (field === 'dates') {
    const dates = [...input.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map(
      (match) => match[0],
    );
    return (
      criteria.dates?.answered === true &&
      dates.length >= 2 &&
      criteria.dates.start === dates[0] &&
      criteria.dates.end === dates[1]
    );
  }
  if (field === 'budget') {
    const maximum = input.match(/(?:maximum|max(?:imum)? budget)\D*(\d+)/i);
    return (
      criteria.budget?.answered === true &&
      maximum !== null &&
      criteria.budget.max === Number(maximum[1])
    );
  }
  if (field === 'room_type') {
    const roomType = input
      .match(/\b(one bed|two beds|suite)\b/i)?.[1]
      ?.toLowerCase();
    return (
      criteria.roomType?.answered === true &&
      criteria.roomType.roomType === roomType
    );
  }
  if (field === 'amenities') {
    return (
      criteria.amenities?.answered === true &&
      (!/wifi/i.test(input) ||
        criteria.amenities.amenities.includes('freeWiFi')) &&
      (!/parking/i.test(input) ||
        criteria.amenities.amenities.includes('freeParking'))
    );
  }
  return (
    field === 'distance' &&
    criteria.distance?.answered === true &&
    /does not matter/i.test(input) &&
    criteria.distance.airport === null &&
    criteria.distance.cityCenter === null
  );
}

function latestHumanText(messages: Array<{ content?: unknown }>): string {
  const message = [...messages]
    .reverse()
    .find((candidate) => HumanMessage.isInstance(candidate));
  return message ? messageText(message.content) : '';
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  return content === undefined || content === null
    ? ''
    : JSON.stringify(content);
}

function stepState(
  flow: { steps: Array<{ name: string; state: Record<string, unknown> }> },
  name: string,
): Record<string, any> {
  const step = flow.steps.find((candidate) => candidate.name === name);
  assert.ok(step, `Missing ${name} state`);
  const businessState = { ...step.state };
  delete businessState._saveOn;
  return businessState;
}
