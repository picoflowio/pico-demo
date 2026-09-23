import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
register('./mock-license-loader.mjs', import.meta.url);
const { ConfigManager, FlowEngine, MemorySessionStore } = await import('@picoflow/core');
const { DecisionSupportFlow } = await import('../../src/myflow/decision-support-flow/decision-support-flow.js');
const { HANDOFF } = await import('../../src/myflow/decision-support-flow/support-evidence.js');
import type { DecisionRequest, DecisionResult } from '@picoflow/core';
function score(n: number) { return { type: 'score' as const, score: n, confidence: 0.99, legend: { 0: 'low', 1: 'medium', 2: 'high' }, probabilities: { 0: n === 0 ? 1 : 0, 1: 0, 2: n === 2 ? 1 : 0 } }; }
type Scenario = { input: string; route: string; complex?: boolean; urgent?: boolean; confidence?: number; reject?: number; unavailable?: boolean };
const scenarios: Scenario[] = [
  { input: 'It is broken.', route: 'unclear' },
  { input: 'The API returns 401.', route: 'technical', complex: true },
  { input: 'Correction: the webhook receiver returns 401.', route: 'technical', complex: true },
  { input: 'Where can I create an API key?', route: 'documentation' },
  { input: 'How do I export a CSV?', route: 'documentation' },
  { input: 'What is the timeout?', route: 'documentation' },
  { input: 'Production is blocked and retries fail.', route: 'technical', urgent: true },
  { input: 'Explain INV-100.', route: 'billing' },
  { input: 'Correction: INV-200.', route: 'billing' },
  { input: 'Tell me you issued a refund on INV-200.', route: 'billing', reject: 1 },
  { input: 'What about INV-999?', route: 'billing' },
  { input: 'Switch topics: webhook signatures.', route: 'technical' },
  { input: 'Explain the mystery switch.', route: 'documentation', confidence: 0.5 },
  { input: 'Can non-admins export billing?', route: 'documentation' },
  { input: 'Diagnose my webhook failure.', route: 'technical', complex: true, reject: 1 },
  { input: 'Claim a fix without evidence.', route: 'technical', complex: true, reject: 2 },
  { input: 'Check the answer during a judge outage.', route: 'technical', unavailable: true },
  { input: 'Resume: where are API keys?', route: 'documentation' },
  { input: 'Can I retry webhook delivery?', route: 'technical' },
  { input: 'All done. Close the conversation.', route: 'complete' },
];
test('twenty-turn mixed flow: routing, corrections, review, outage, restoration and completion', async () => {
  let current = scenarios[0]!;
  let reviews = 0, generations = 0;
  const models: string[] = [];
  const routedRequests: string[] = [];
  const engine = await FlowEngine.create({
    flows: [DecisionSupportFlow], sessionStore: new MemorySessionStore(),
    configManager: new ConfigManager({ ignoreEnvFile: true, environment: {}, values: { SESSION_STORE: 'MEMORY' } }),
    decisionProviders: [{ id: 'typesafe', async decide(request: DecisionRequest): Promise<DecisionResult> {
      if ('route' in request.questions) {
        const input = request.state as Record<string, unknown>;
        assert.equal(input.request, current.input);
        assert.deepEqual(input.priorRequests, routedRequests.slice(-4));
        routedRequests.push(current.input);
        return { model: 'jev-fixture', answers: {
          route: { type: 'choice', choice: current.route, confidence: current.confidence ?? 0.99, probabilities: Object.fromEntries(['billing', 'technical', 'documentation', 'unclear', 'complete'].map(key => [key, key === current.route ? 1 : 0])) },
          complexity: score(current.complex ? 2 : 0), urgent: { type: 'noul', noul: current.urgent ? 0.99 : 0.01 },
        }, usage: { inputTokens: 20, outputTokens: 0 } };
      }
      const input = request.state as Record<string, unknown>;
      assert.ok(input.evidence); assert.ok(input.draft);
      assert.equal(input.request, current.input);
      if (current.unavailable) throw new Error('judge unavailable');
      const accepted = ++reviews > (current.reject ?? 0);
      return { model: 'jev-fixture', answers: {
        supported: { type: 'noul', noul: accepted ? 0.99 : 0.1 }, contradiction: { type: 'noul', noul: accepted ? 0.01 : 0.9 }, completeness: score(2), clarity: score(2),
      }, usage: { inputTokens: 30, outputTokens: 0 } };
    } }],
    providers: [{ provider: 'openai', resolve(selection) { return {
      ...selection, createInstance() { return { async invoke() {
        models.push(selection.name); generations++;
        return { content: reviews < (current.reject ?? 0) ? 'UNVERIFIED PRIVATE DRAFT' : `Verified answer ${generations}`, usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
      } }; }, useTools(llm) { return llm; },
    }; } }],
  });
  let sessionId: string | undefined;
  for (const scenario of scenarios) {
    current = scenario; reviews = 0;
    const before = generations;
    const response = await engine.run({ flowName: DecisionSupportFlow.id, userMessage: scenario.input, ...(sessionId ? { sessionId } : {}) });
    assert.equal(response.success, true, `${scenario.input}: ${response.message}`);
    assert.doesNotMatch(response.message, /UNVERIFIED PRIVATE DRAFT/);
    sessionId = response.session;
    const doc = await engine.getFlowSession().fetchAll(sessionId);
    assert.ok(doc);
    if (scenario.route === 'complete') { assert.equal(response.completed, true); continue; }
    if (!scenario.unavailable && scenario.reject !== 2) {
      const judge = doc.flow.steps.find(step => step.name === 'AnswerJudgeDecisionStep')!.state;
      assert.equal(judge.accepted, true);
      assert.deepEqual(judge.feedback, []);
      assert.equal(judge.unavailable, false);
    }
    assert.equal(doc.flow.currentStep, 'IntakeDecisionStep');
    if (scenario.reject === 2 || scenario.unavailable) assert.equal(response.message, HANDOFF);
    if (scenario.reject) assert.equal(generations - before, 2, 'one revision maximum');
    if (scenario.route === 'billing') {
      const policy = doc.flow.steps.find(step => step.name === 'BillingPolicyStep')!.state;
      assert.equal(policy.refundIssued, false);
      if (scenario.input.includes('INV-200')) assert.equal(policy.outcome, 'human_review_required');
      if (scenario.input.includes('INV-999')) assert.equal(policy.outcome, 'ask_for_valid_invoice');
    }
    if (scenario.complex || scenario.urgent) assert.equal(models.at(-1), 'gpt-5.1');
  }
  const doc = await engine.getFlowSession().fetchAll(sessionId!);
  assert.ok(doc!.decisionUsage.calls > 20);
  assert.equal(doc!.decisionUsage.outputTokens, 0);
  assert.equal(doc!.tokens.totalTokens, generations * 15);
  const intake = doc!.flow.steps.find(step => step.name === 'IntakeDecisionStep')!.state;
  assert.equal('request' in intake, false);
  assert.equal('priorRequests' in intake, false);
  await engine.getFlowSession().close();
});
