// server.js
// Minimal local proxy server for the Jarvis HUD.
// Keeps your Gemini API key on the server — it never reaches the browser.
//
// SETUP:
//   1. npm install express node-fetch dotenv cors googleapis
//   2. Copy .env.example to .env and paste your real keys:
//        GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   3. node server.js
//   4. Open jarvis-hud-final.html in your browser (it talks to http://localhost:8787)
//
// GOOGLE FLOW LOGIN ENDPOINTS:
//   GET  /api/flow/auth/status    – check whether the user is logged in
//   GET  /api/flow/auth/start     – get the Google OAuth URL to open
//   GET  /api/flow/auth/callback  – OAuth redirect handler (browser lands here)
//   GET  /api/flow/auth/confirm   – verify login completed successfully
//   GET  /api/flow/projects       – list the user's Google Cloud projects

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const flowAuth = require('./flow-auth');

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

// ── Google Flow Login ────────────────────────────────────────────────────────

// flow_auth_status — check whether the user is currently authenticated
app.get('/api/flow/auth/status', async (req, res) => {
  try {
    const status = await flowAuth.authStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// flow_start_login — return the Google OAuth URL (open it in a browser)
app.get('/api/flow/auth/start', (req, res) => {
  try {
    const { url } = flowAuth.startLogin();
    res.json({ url, message: 'Open this URL in your browser to sign in with Google.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback — Google redirects here after the user signs in
app.get('/api/flow/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).send(`<h2>Login failed: ${error}</h2><p>You may close this tab.</p>`);
  }
  if (!code) {
    return res.status(400).send('<h2>Missing authorization code.</h2>');
  }
  try {
    await flowAuth.handleCallback(code);
    res.send('<h2>✅ Signed in successfully!</h2><p>You may close this tab and return to Jarvis.</p>');
  } catch (err) {
    res.status(500).send(`<h2>Error exchanging code: ${err.message}</h2>`);
  }
});

// flow_confirm_login — verify the login completed and return user info
app.get('/api/flow/auth/confirm', async (req, res) => {
  try {
    const status = await flowAuth.confirmLogin();
    if (!status.loggedIn) {
      return res.status(401).json({ loggedIn: false, reason: status.reason });
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// project_list — list the authenticated user's Google Cloud projects
app.get('/api/flow/projects', async (req, res) => {
  try {
    const projects = await flowAuth.listProjects();
    res.json({ projects });
  } catch (err) {
    const status = err.message === 'Not logged in' ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Jarvis proxy server running at http://localhost:${PORT}`);
});
