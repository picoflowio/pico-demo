async function testTravelFlow() {
  const url = 'http://localhost:8000/ai/run';
  let sessionId = null;

  async function send(message) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['CHAT_SESSION_ID'] = sessionId;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, flowName: 'TravelFlow' }),
    });

    const data = await response.json();
    const newSessionId = response.headers.get('chat_session_id');
    if (newSessionId) sessionId = newSessionId;

    console.log(`-> User: ${message}`);
    console.log(`<- Bot [Session: ${sessionId}]: ${data.message}`);
    console.log(`   completed: ${data.completed}`);
    console.log('');

    return data;
  }

  console.log('=== TravelFlow Integration Test ===\n');

  const steps = [
    'Hello',
    'Full plan please',
    'Origin PDX, destination Madrid, depart 2026-04-21, return 2026-05-05, 2 adults, business class, total budget $7000',
    'I choose Premium.',
  ];

  let lastResponse = null;
  for (const step of steps) {
    lastResponse = await send(step);
    if (lastResponse.completed || lastResponse.success === false) {
      break;
    }
  }

  if (lastResponse && lastResponse.completed) {
    console.log(`Session ID: ${sessionId}`);
    console.log('✅ TravelFlow scripted run completed (session left open for inspection).');
    process.exit(0);
  } else {
    console.log(`Session ID: ${sessionId || 'unavailable'}`);
    console.log('❌ TravelFlow scripted run did not reach completion.');
    process.exit(1);
  }
}

testTravelFlow().catch((err) => {
  console.error('❌ Test error:', err.message);
  process.exit(1);
});
