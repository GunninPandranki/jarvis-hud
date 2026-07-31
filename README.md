# Jarvis HUD — Voice Assistant UI

A collection of UIs for voice-driven assistant interactions, powered by a local Node.js server.

## UIs Available

### 1. **Jarvis Orb** (NEW) — `orb.html`
Animated particle-based visualizer with live caption support. Perfect for a fullscreen, sci-fi HUD feel.
- **Animated orb** with particle effects responding to microphone amplitude
- **Live captions** — real-time transcript display below the orb
- **WebSocket-driven** — external processes push state/amplitude/caption events
- **No AI logic built-in** — acts as a visual shell for your voice backend

### 2. **Jarvis HUD** — `jarvis-hud-final.html`
Traditional dashboard with system status, conversation log, and speech controls.

## Files
- `orb.html` — Jarvis Orb UI. Open this in your browser: `http://localhost:8787/orb`
- `jarvis-hud-final.html` — Classic HUD dashboard
- `server.js` — local proxy server. Serves UIs and hosts WebSocket/REST APIs
- `.env.example` — copy to `.env` and put your Gemini API key there
- `package.json` — Node dependencies
- `orb-control-example.js` — demo script showing how to control the orb from Python/external process

## Setup (one-time)

1. Install Node.js if you don't have it: https://nodejs.org

2. Open a terminal in this folder and run:
   ```
   npm install
   ```

3. Copy `.env.example` to a new file named `.env` in the same folder, then open `.env`
   and replace `YOUR_API_KEY_HERE` with your real Gemini API key:
   ```
   GEMINI_API_KEY=your_real_key_here
   ```
   Get a key at https://aistudio.google.com/apikey — `.env` stays on your machine only,
   never inside the HTML.

4. Start the server:
   ```
   npm start
   ```
   You should see: `Jarvis proxy server running at http://localhost:8787`

5. Open `jarvis-hud-final.html` directly in your browser (double-click it, or drag it
   into a browser window). The "Agent Mode" panel will show **LIVE (Gemini)** once it
   detects the server and key. If the server isn't running, it automatically falls back
   to the mock demo agent — the UI never breaks.

## Controlling the Orb

Once the server is running, any external process (Python script, voice loop, etc.) can drive the Orb UI by POSTing to the `/api/orb` endpoint.

**API Events:**

```json
{
  "state": "listening|speaking|thinking|idle",
  "amplitude": 0.0 - 1.0,
  "caption": "text to display",
  "speaker": "user|assistant"
}
```

**Example (curl):**
```bash
curl -X POST http://localhost:8787/api/orb \
  -H "Content-Type: application/json" \
  -d '{"state":"listening","amplitude":0.7,"caption":"User speaking..."}'
```

**Example (Node.js):**
See `orb-control-example.js` for a full demo.

**From Python:**
```python
import json, requests

orb_api = "http://localhost:8787/api/orb"
requests.post(orb_api, json={
    "state": "listening",
    "amplitude": 0.65,
    "caption": "User: what time is it?"
})
```

## Notes
- The server only runs on your machine (`localhost`) — nothing is exposed to the internet.
- Orb UI is driven entirely by external events — build your voice pipeline however you like (mic capture → transcription → Claude/Gemini → TTS) and push state to the orb as you go.
- Never commit or share your `.env` file.
