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
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;

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

app.post('/api/tts', async (req, res) => {
  try {
    if (!CARTESIA_API_KEY || CARTESIA_API_KEY === 'YOUR_API_KEY_HERE') {
      return res.status(500).json({ error: 'Server has no API key configured. Add CARTESIA_API_KEY to your .env file.' });
    }
    const { transcript, voice, model_id, output_format, generation_config } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Missing "transcript" string in request body.' });
    }

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2026-08-14'
      },
      body: JSON.stringify({
        model_id: model_id || 'sonic-3.6',
        transcript,
        voice: voice || 'f6141af3-5f94-418c-80ed-a45d450e7e2e',
        output_format: output_format || { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
        generation_config: generation_config || { speed: 1, volume: 1 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Cartesia API error:', errText);
      return res.status(response.status).json({ error: errText || 'Cartesia API error' });
    }

    const audioBuffer = await response.buffer();
    res.set('Content-Type', 'audio/wav');
    res.send(audioBuffer);

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keyConfigured: !!(API_KEY && API_KEY !== 'YOUR_API_KEY_HERE'),
    cartesiaKeyConfigured: !!(CARTESIA_API_KEY && CARTESIA_API_KEY !== 'YOUR_API_KEY_HERE')
  });
});

app.listen(PORT, () => {
  console.log(`Jarvis proxy server running at http://localhost:${PORT}`);
});
