import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { DecisionProvider, FlowEngine, ModelProvider } from '@picoflow/core';
import { DecisionSupportFlow } from '../../src/myflow/decision-support-flow/decision-support-flow.js';
import { HANDOFF } from '../../src/myflow/decision-support-flow/support-evidence.js';
dotenv.config({ override: true, quiet: true });
const missing = ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'PICOFLOW_KEY'].filter(key => !process.env[key]?.trim());
// Preserves SESSION_STORE and other deployment choices from .env.
test('live Jev and LLM routing/review smoke test', { skip: missing.length ? `Missing ${missing.join(', ')}` : false, timeout: 300_000 }, async () => {
  const engine = await FlowEngine.create({
    flows: [DecisionSupportFlow],
    decisionProviders: DecisionProvider.create({
      typesafe: { apiKey: process.env.TYPESAFE_API_KEY },
    }),
    providers: ModelProvider.createBuiltinAdapters({
      openai: { apiKey: process.env.OPENAI_API_KEY },
    }),
  });
  const turns = [
    { label: 'API-key documentation', input: 'Where do I create a Northstar API key?', expected: /settings|API keys/i },
    { label: 'restricted refund request', input: 'Explain invoice INV-200. Please refund it.', expected: /review|support|cannot|can.t/i },
    { label: 'billing correction', input: 'Correction: INV-100. Is there a duplicate charge?', expected: /no duplicate|not.*duplicate|49|single/i },
    { label: 'conversation completion', input: 'All done. Please close the conversation.', expected: /complete/i },
  ];
  const transcript: object[] = [];
  let substantiveAnswers = 0;
  let sessionId: string | undefined;
  try {
    for (const [index, turn] of turns.entries()) {
      logProgress(`turn ${index + 1}/${turns.length}: ${turn.label}`);
      logProgress(`input: ${turn.input}`);
      const response = await engine.run({ flowName: DecisionSupportFlow.id, userMessage: turn.input, ...(sessionId ? { sessionId } : {}) });
      assert.equal(response.success, true, response.message);
      sessionId = response.session;
      if (response.message === HANDOFF) {
        assert.notEqual(turn.label, 'conversation completion');
        const doc = await engine.getFlowSession().fetchAll(sessionId);
        const judge = doc!.flow.steps.find(step => step.name === 'AnswerJudgeDecisionStep')!.state;
        assert.equal(judge.accepted, false);
        assert.ok(judge.unavailable === true || (judge.revision === 1 && Array.isArray(judge.feedback) && judge.feedback.length > 0));
        assert.equal(doc!.flow.currentStep, 'IntakeDecisionStep');
      } else {
        assert.match(response.message, turn.expected);
        if (turn.label !== 'conversation completion') substantiveAnswers++;
      }
      transcript.push({ input: turn.input, output: response.message, completed: response.completed, handedOff: response.message === HANDOFF });
      logProgress(`response: ${preview(response.message)}`);
    }
    logProgress('checking final session state');
    const doc = await engine.getFlowSession().fetchAll(sessionId!);
    assert.ok(substantiveAnswers >= 2, `Expected at least two reviewed answers, received ${substantiveAnswers}`);
    assert.equal(doc!.runStatus, 'completed');
    assert.ok(doc!.decisionUsage.calls >= 7);
    assert.ok(doc!.tokens.totalTokens > 0);
    assert.equal(doc!.flow.steps.find(step => step.name === 'BillingPolicyStep')!.state.refundIssued, false);
    logProgress('final session state ok');
    await mkdir('test/.tmp/decision-support-flow', { recursive: true });
    await writeFile('test/.tmp/decision-support-flow/live.json', JSON.stringify({ transcript, decisionUsage: doc!.decisionUsage, llmUsage: doc!.tokens }, null, 2));
  } finally { await engine.close(); }
});

function logProgress(message: string): void {
  if (process.env.DECISION_SUPPORT_FLOW_TEST_LOG === '0') return;
  console.log(`[DecisionSupportFlow live] ${message}`);
}

function preview(message: string, maxLength = 180): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}
