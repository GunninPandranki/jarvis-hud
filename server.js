// server.js
// Minimal local proxy server for the Jarvis HUD.
// Keeps your Gemini API key on the server — it never reaches the browser.
//
// SETUP:
//   1. npm install express node-fetch dotenv cors
//   2. Copy .env.example to .env and paste your real key into GEMINI_API_KEY
//   3. node server.js
//   4. Open jarvis-hud-final.html in your browser (it talks to http://localhost:8787)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
  console.warn('\n⚠️  No real GEMINI_API_KEY set in .env — /api/chat will return an error until you add one.\n');
}

// WebSocket server for Jarvis Orb (optional, used if browser supports it)
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const orbClients = new Set();

// Event queue for polling
const orbEvents = [];
let eventIdCounter = 0;

wss.on('connection', (ws) => {
  console.log('Orb client connected');
  orbClients.add(ws);

  ws.on('close', () => {
    console.log('Orb client disconnected');
    orbClients.delete(ws);
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing "message" string in request body.' });
    }
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      return res.status(500).json({ error: 'Server has no API key configured. Add GEMINI_API_KEY to your .env file.' });
    }

    // Build a simple conversation payload for the Gemini generateContent endpoint
    const contents = (history || []).map(turn => ({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: 'You are Jarvis, a concise, helpful voice assistant. Keep answers short and conversational since they will be spoken aloud.' }]
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ') || '(no response text)';
    res.json({ reply: text });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keyConfigured: !!(API_KEY && API_KEY !== 'YOUR_API_KEY_HERE')
  });
});

// Endpoint to control the Orb UI (push state, amplitude, captions)
// Usage: POST http://localhost:8787/api/orb with JSON body
app.post('/api/orb', (req, res) => {
  const event = req.body;

  // Store in event queue for polling
  orbEvents.push({ id: ++eventIdCounter, data: event });
  if (orbEvents.length > 50) orbEvents.shift(); // Keep only last 50 events

  // Broadcast via WebSocket if any clients are connected
  orbClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });

  res.json({ sent: orbClients.size, queued: true });
});

// Polling endpoint for browsers that don't support WebSocket
app.get('/api/orb/state', (req, res) => {
  res.json({ events: orbEvents });
});

// Serve orb.html at root and /orb
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'orb.html'));
});
app.get('/orb', (req, res) => {
  res.sendFile(path.join(__dirname, 'orb.html'));
});

server.listen(PORT, () => {
  console.log(`Jarvis server running at http://localhost:${PORT}`);
  console.log(`  → Orb UI: http://localhost:${PORT}/orb`);
  console.log(`  → Control: POST http://localhost:${PORT}/api/orb`);
  console.log(`  → WebSocket: ws://localhost:${PORT}`);
});
