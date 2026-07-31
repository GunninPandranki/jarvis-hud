#!/usr/bin/env node
// Example: Control the Jarvis Orb from an external process
// This demonstrates how to drive the orb UI from a voice backend

const http = require('http');

const ORB_API_URL = 'http://localhost:8787/api/orb';

function sendOrbEvent(event) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(event);
    const req = http.request(ORB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Demo: Simulate a voice interaction
async function demo() {
  console.log('🎤 Jarvis Orb Control Demo\n');

  try {
    // Listening state
    console.log('→ User speaking (listening state)');
    for (let i = 0; i < 5; i++) {
      await sendOrbEvent({
        state: 'listening',
        amplitude: Math.random() * 0.7 + 0.3,
        caption: 'Hey Jarvis, what time is it?'
      });
      await new Promise(r => setTimeout(r, 200));
    }

    // Processing
    await new Promise(r => setTimeout(r, 500));
    console.log('→ Assistant thinking');
    await sendOrbEvent({
      state: 'thinking',
      amplitude: 0.2
    });
    await new Promise(r => setTimeout(r, 1000));

    // Speaking response
    console.log('→ Assistant speaking');
    const response = 'The current time is 2:30 PM.';
    for (let i = 0; i < response.length; i++) {
      await sendOrbEvent({
        state: 'speaking',
        amplitude: Math.random() * 0.4 + 0.4,
        caption: response.substring(0, i + 1),
        speaker: 'assistant'
      });
      await new Promise(r => setTimeout(r, 50));
    }

    // Return to idle
    await new Promise(r => setTimeout(r, 500));
    console.log('→ Idle');
    await sendOrbEvent({
      state: 'idle',
      amplitude: 0
    });

    console.log('\n✅ Demo complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

demo();
