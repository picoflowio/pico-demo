async function testMedicalFlow() {
  const url = 'http://localhost:8000/ai/run';
  
  // 1. Send Initial Message
  console.log("-> User: Hello, I'd like to book an appointment");
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "Hello, I'd like to book an appointment", flowName: 'MedicalFlow' })
  });
  
  let data = await response.json();
  let sessionId = response.headers.get('chat_session_id'); // headers are lowercased in fetch
  console.log(`<- Bot [Session: ${sessionId}]:`, data.message || data);
  
  // 2. Send Symptoms
  console.log("\\n-> User: I have a mild fever and headache");
  response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'CHAT_SESSION_ID': sessionId
    },
    body: JSON.stringify({ message: "I have a mild fever and headache", flowName: 'MedicalFlow' })
  });
  data = await response.json();
  sessionId = response.headers.get('chat_session_id') || sessionId;
  console.log(`<- Bot [Session: ${sessionId}]:`, data.message || data);
  
  // 3. Select Doctor
  console.log("\\n-> User: I'll go with the first doctor you suggested");
  response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'CHAT_SESSION_ID': sessionId
    },
    body: JSON.stringify({ message: "I'll go with the first doctor you suggested", flowName: 'MedicalFlow' })
  });
  data = await response.json();
  sessionId = response.headers.get('chat_session_id') || sessionId;
  console.log(`<- Bot [Session: ${sessionId}]:`, data.message || data);
  
  // 4. Confirm Booking
  console.log("\\n-> User: Tomorrow at 10:00 AM works perfectly");
  response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'CHAT_SESSION_ID': sessionId
    },
    body: JSON.stringify({ message: "Tomorrow at 10:00 AM works perfectly", flowName: 'MedicalFlow' })
  });
  data = await response.json();
  console.log(`<- Bot [Session: ${sessionId}]:`, data.message || data);
  
  console.log("\\nTest completed successfully!");
}

testMedicalFlow().catch(console.error);