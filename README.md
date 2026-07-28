# Jarvis HUD — Final Setup

This is the real version: the HTML file is your UI, and a tiny local server holds your
API key so it never appears in the browser or in any file you share.

## Files
- `jarvis-hud-final.html` — the HUD. Open this in your browser.
- `server.js` — local proxy server. Talks to Gemini using your key.
- `.env.example` — copy to `.env` and put your real key there.
- `package.json` — dependencies for the server.

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

## Notes
- Speech recognition works best in Chrome or Edge, and needs mic permission.
- The server only runs on your machine (`localhost`) — nothing is exposed to the internet.
- Never commit or share your `.env` file.
