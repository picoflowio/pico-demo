/*
 * Automated conversation test for BasicFlow.
 * Requires the basic-demo service to be running on http://localhost:8000.
 */
const fetch = globalThis.fetch;

const FLOW_URL = 'http://localhost:8000/ai/run';
const SCRIPT = [
  { message: 'Hello', config: { isPresident: false } },
  { message: 'Compare NYC and LA' },
  { message: 'blue' },
  { message: 'Interstellar' },
  { message: 'summer' },
  { message: 'My name is Alice Carter' },
  { message: 'March 5, 1990' },
  { message: '742 Evergreen Terrace, Springfield, OR 97477' },
];

async function run() {
  let sessionId = null;
  let lastResponse = null;

  for (const step of SCRIPT) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['CHAT_SESSION_ID'] = sessionId;
    const body = { message: step.message, flowName: 'BasicFlow' };
    if (!sessionId && step.config) body.config = step.config;

    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    sessionId = res.headers.get('chat_session_id') || sessionId;

    console.log(`\n> ${step.message}`);
    console.log(json.message || json);

    lastResponse = json;
    if (json.completed || json.success === false) {
      break;
    }
  }

  const success = Boolean(lastResponse && lastResponse.completed);
  console.log(`\nSession ID: ${sessionId || 'unknown'}`);
  console.log(success ? '✅ BasicFlow scripted run completed.' : '❌ BasicFlow scripted run did not complete.');

  process.exit(success ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
