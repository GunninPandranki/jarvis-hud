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

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
  console.warn('\n⚠️  No real GEMINI_API_KEY set in .env — /api/chat will return an error until you add one.\n');
}

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

app.listen(PORT, () => {
  console.log(`Jarvis proxy server running at http://localhost:${PORT}`);
});
