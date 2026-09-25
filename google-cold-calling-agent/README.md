# Local Cold-Calling Voice Agent

A browser-based, locally-hosted cold-calling voice agent prototype. Runs on your own
machine (mic/speakers), streams live speech-to-text, an LLM-driven conversation, and
streamed text-to-speech, with barge-in interruption support.

Not connected to any real phone line — for local testing only.

## Stack
- **Frontend**: `index.html` — mic capture (Web Speech API), barge-in detection (mic
  volume analysis), streamed audio playback (Web Audio API)
- **Backend**: `webapp.py` — Flask server, SSE streaming, session state
- **LLM**: Groq (`groq_client.py`) — fast reply generation
- **TTS**: Cartesia (`cartesia_client.py`) — streamed voice synthesis
- **Persona/script**: `config.py` — edit `PERSONA_PROMPT` for your own use case
- **CLI variant**: `main.py` / `audio_io.py` / `gemini_client.py` — an earlier
  terminal-based version using Gemini for STT/LLM/TTS

## Setup
```bash
pip install -r requirements.txt
cp .env.example .env   # fill in your own API keys
python webapp.py
```
Then open `http://localhost:5000`.

## Testing
- `test_pipeline.py` — sends text through the pipeline and transcribes the generated
  audio back to verify TTS fidelity
- `stress_test.py` — hammers the backend with rapid interrupted/concurrent requests
  to check stability under load

## Notes
This was built iteratively as a prototype/local test line, not a production system.
Real deployment against actual phone numbers would need consent/compliance handling
(TCPA-style rules, do-not-call scrubbing, recording consent) which is not implemented
here.
