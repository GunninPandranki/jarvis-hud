"""
Browser-based local cold-call agent.
Serves a single page with a mic button; talks to Gemini for STT -> reply -> TTS.
Run: python webapp.py
Then open: http://localhost:5000
"""
import os
import json
import time
import uuid
import traceback
import datetime
from flask import Flask, request, jsonify, send_from_directory, Response

import base64

from config import PERSONA_PROMPT, CALL_LOG_DIR, AGENT_NAME, BRAND_NAME
from groq_client import generate_reply, guard_reply
from cartesia_client import synthesize as synthesize_speech, stream_synthesize_pcm, synthesize_pcm_bytes, DEFAULT_SPEED

APP_DIR = os.path.dirname(__file__)
TMP_DIR = os.path.join(APP_DIR, "_tmp_audio")
os.makedirs(TMP_DIR, exist_ok=True)
os.makedirs(CALL_LOG_DIR, exist_ok=True)

app = Flask(__name__)

# In-memory session state (single local user, so a global is fine here)
SESSION = {"history": [], "transcript_lines": []}

# See the note above where this is used - disabled by default due to Groq
# free-tier rate limits under real (not just burst) conversational load.
ENABLE_RESPONSE_GUARD = False

# Short filler/backchannel phrases pre-generated once at startup so the browser
# can play one instantly (no network wait) the moment the user stops talking,
# bridging the gap while the real reply is being generated - makes the turn
# feel continuous instead of a dead silent pause.
#
# Split into two moods so the filler actually matches what the person just
# said, instead of a cheerful "Yeah, totally! Haha!" landing on someone who
# just said they're late for a meeting. Kept deliberately small (2-3 each) -
# the point is ONE quick natural sound, not a string of them.
FILLER_PHRASES = {
    "upbeat": [
        "Mm-hmm.", "Right.", "Got it.", "Sure thing.", "Yeah.",
        "Oh nice.", "Totally.", "For sure.", "Makes sense.", "Gotcha.",
    ],
    "neutral": [
        "Got it.", "Understood.", "Sure, no problem.", "I see.", "Okay.",
        "Alright.", "No worries.", "That's fine.", "I hear you.", "Sure.",
    ],
}
FILLERS_B64 = {"upbeat": [], "neutral": []}

def _pregenerate_fillers():
    for mood, phrases in FILLER_PHRASES.items():
        for phrase in phrases:
            try:
                # Match the main reply's speed - a speed mismatch between filler
                # and reply is exactly what made pacing feel inconsistent/jarring
                # right at the filler-to-reply handoff.
                pcm = synthesize_pcm_bytes(phrase, speed=DEFAULT_SPEED)
                FILLERS_B64[mood].append(base64.b64encode(pcm).decode("ascii"))
            except Exception:
                traceback.print_exc()
    total = sum(len(v) for v in FILLERS_B64.values())
    expected = sum(len(v) for v in FILLER_PHRASES.values())
    print(f"[startup] pre-generated {total}/{expected} filler clips")

_pregenerate_fillers()


def save_log():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(CALL_LOG_DIR, f"call_{ts}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(SESSION["transcript_lines"]))
    return path


@app.route("/")
def index():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/api/fillers")
def get_fillers():
    return jsonify({"sample_rate": 44100, "fillers": FILLERS_B64})  # {"upbeat": [...], "neutral": [...]}


@app.route("/api/debug_log", methods=["POST"])
def debug_log():
    """Live client-side event stream, printed straight to this console so the
    whole call's state machine (orb changes, recognizer status, errors, what
    was actually heard/said) is visible here in real time - a text-based
    stand-in for "hearing" the call, since Claude has no audio input."""
    body = request.get_json(silent=True) or {}
    event = body.get("event", "?")
    detail = body.get("detail", "")
    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[LIVE {ts}] {event}: {detail}")
    return jsonify({"ok": True})


@app.route("/api/start", methods=["POST"])
def start_call():
    SESSION["history"] = []
    SESSION["transcript_lines"] = []

    opening_line = f"Hi, is this a good time? I'm {AGENT_NAME} calling from {BRAND_NAME}."
    SESSION["history"].append({"role": "model", "text": opening_line})
    SESSION["transcript_lines"].append(f"Asha: {opening_line}")

    out_wav = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}.wav")
    try:
        synthesize_speech(opening_line, out_wav)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "text": opening_line,
        "audio_url": f"/api/audio/{os.path.basename(out_wav)}",
    })


@app.route("/api/turn", methods=["POST"])
def turn():
    body = request.get_json(silent=True) or {}
    user_text = (body.get("text") or "").strip()
    if not user_text:
        return jsonify({"error": "no text provided"}), 400

    t0 = time.time()
    t2 = time.time()  # transcription now happens client-side (browser Speech Recognition)

    SESSION["transcript_lines"].append(f"You: {user_text}")

    ended = "goodbye" in user_text.lower()
    if ended:
        reply_text = "Thanks so much for your time, have a great day!"
    else:
        try:
            reply_text = generate_reply(PERSONA_PROMPT, SESSION["history"], user_text)
        except Exception as e:
            traceback.print_exc()
            return jsonify({"error": f"reply generation failed: {e}"}), 500
    t3 = time.time()

    SESSION["history"].append({"role": "user", "text": user_text})
    SESSION["history"].append({"role": "model", "text": reply_text})
    SESSION["transcript_lines"].append(f"Asha: {reply_text}")

    out_wav = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}_out.wav")
    try:
        synthesize_speech(reply_text, out_wav)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"speech synthesis failed: {e}"}), 500
    t4 = time.time()

    print(f"[timing] reply={t3-t2:.2f}s  tts={t4-t3:.2f}s  TOTAL={t4-t0:.2f}s")

    if ended:
        save_log()

    return jsonify({
        "user_text": user_text,
        "reply_text": reply_text,
        "audio_url": f"/api/audio/{os.path.basename(out_wav)}",
        "ended": ended,
    })


@app.route("/api/turn_stream", methods=["POST"])
def turn_stream():
    body = request.get_json(silent=True) or {}
    user_text = (body.get("text") or "").strip()
    if not user_text:
        return jsonify({"error": "no text provided"}), 400

    def event_stream():
        t0 = time.time()
        SESSION["transcript_lines"].append(f"You: {user_text}")

        ended = "goodbye" in user_text.lower()
        if ended:
            reply_text = "Thanks so much for your time, have a great day!"
        else:
            try:
                # Response Guard is disabled by default - on Groq's free tier it
                # doubles/triples API calls per turn, which pushes even normal,
                # human-paced conversation past the rate limit (confirmed live:
                # repeated 429s and fallback replies during real testing). Set
                # ENABLE_RESPONSE_GUARD=True below if you upgrade to a paid Groq
                # tier and want the extra consistency checking back.
                reply_text = generate_reply(PERSONA_PROMPT, SESSION["history"], user_text)

                if ENABLE_RESPONSE_GUARD:
                    is_valid, reason = guard_reply(user_text, reply_text)
                    if not is_valid:
                        print(f"[response guard] rejected: {reason} - regenerating once")
                        corrective_prompt = (
                            f"{PERSONA_PROMPT}\n\nIMPORTANT: your previous draft reply to this "
                            f"exact customer message had this problem: {reason}\n"
                            f"Fix that specific issue in your reply."
                        )
                        reply_text = generate_reply(corrective_prompt, SESSION["history"], user_text)
            except Exception as e:
                traceback.print_exc()
                # Fallback: keep the call alive with a safe generic line instead of
                # dying silently - a real person would just ask you to repeat, not hang up.
                print("[fallback] reply generation failed, using canned recovery line")
                reply_text = "Sorry, could you say that again?"
        t1 = time.time()

        SESSION["history"].append({"role": "user", "text": user_text})
        SESSION["history"].append({"role": "model", "text": reply_text})
        SESSION["transcript_lines"].append(f"Asha: {reply_text}")

        yield f"data: {json.dumps({'type': 'reply', 'user_text': user_text, 'reply_text': reply_text, 'sample_rate': 44100})}\n\n"

        first_chunk = True
        audio_failed = False
        try:
            for pcm_chunk_b64 in stream_synthesize_pcm(reply_text):
                if first_chunk:
                    print(f"[timing] reply={t1-t0:.2f}s  time_to_first_audio={time.time()-t1:.2f}s")
                    first_chunk = False
                yield f"data: {json.dumps({'type': 'audio', 'chunk': pcm_chunk_b64})}\n\n"
        except Exception as e:
            traceback.print_exc()
            audio_failed = True

        if audio_failed and not first_chunk:
            # partial audio already streamed before it broke - nothing more to do,
            # the turn just ends a bit early rather than erroring out entirely.
            pass
        elif audio_failed:
            # Streaming failed before sending anything - fall back to the plain
            # (non-streaming) Cartesia endpoint once before giving up on audio
            # entirely. Either way, the turn still completes with the reply text
            # visible even if voice fails completely - never a dead silent error.
            try:
                fallback_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}_fallback.wav")
                synthesize_speech(reply_text, fallback_path)
                with open(fallback_path, "rb") as f:
                    wav_bytes = f.read()
                # crude WAV->raw PCM: strip the 44-byte standard header so the
                # browser's existing PCM player can handle it the same way.
                pcm_bytes = wav_bytes[44:]
                b64_chunk = base64.b64encode(pcm_bytes).decode("ascii")
                print("[fallback] used non-streaming Cartesia endpoint after streaming failed")
                yield f"data: {json.dumps({'type': 'audio', 'chunk': b64_chunk})}\n\n"
            except Exception:
                traceback.print_exc()
                print("[fallback] audio completely unavailable this turn - continuing as text-only")

        print(f"[timing] TOTAL={time.time()-t0:.2f}s")

        if ended:
            save_log()

        yield f"data: {json.dumps({'type': 'done', 'ended': ended})}\n\n"

    return Response(event_stream(), mimetype="text/event-stream")


@app.route("/api/end", methods=["POST"])
def end_call():
    if SESSION["transcript_lines"]:
        path = save_log()
        return jsonify({"saved": path})
    return jsonify({"saved": None})


@app.route("/api/audio/<fname>")
def get_audio(fname):
    path = os.path.join(TMP_DIR, fname)
    with open(path, "rb") as f:
        data = f.read()
    return Response(data, mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
