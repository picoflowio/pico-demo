/*
 * Automated conversational test for HotelFlow.
 * Requires the Hotel demo service to be running locally on port 8000
 * (run `yarn start` in the repo root).
 */
const fetch = globalThis.fetch;

const FLOW_URL = 'http://localhost:8000/ai/run';
const SCRIPT = [
  'Hi',
  'yes',
  '7/1/2026 to 7/6/2026',
  'max 700',
  'suite',
  'free wifi, parking',
  'none',
  'search',
  'change to a 2 bed rooms, and rerun search',
  'compare 2,5,7 on price.',
  'compare same hotels on amenities.',
  "let's book",
  'choose #9',
];

async function runScript() {
  let sessionId = null;
  let lastResponse = null;

  async function sendMessage(message) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['CHAT_SESSION_ID'] = sessionId;
    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, flowName: 'HotelFlow' }),
    });
    const body = await res.json();
    const newSession = res.headers.get('chat_session_id');
    if (newSession) sessionId = newSession;
    console.log(`\n> ${message}`);
    console.log(body.message);
    return body;
  }

  for (const line of SCRIPT) {
    lastResponse = await sendMessage(line);
    if (lastResponse.completed || lastResponse.success === false) {
      break;
    }
  }

  const success = Boolean(lastResponse && lastResponse.completed);
  console.log(`\n${success ? '✅' : '❌'} HotelFlow scripted run ${success ? 'completed' : 'did not complete'}.`);
  process.exit(success ? 0 : 1);
}

runScript().catch((err) => {
  console.error(err);
  process.exit(1);
});
