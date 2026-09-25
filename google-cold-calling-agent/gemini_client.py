"""
Thin wrapper around the Gemini API for the three calls the agent makes per turn:
transcribe (STT), generate_reply (LLM), synthesize (TTS).
Includes basic retry/backoff since local testing will regularly hit rate limits.
"""
import base64
import time
import wave
import requests

from config import GEMINI_API_KEY, TEXT_MODEL, STT_MODEL, TTS_MODEL, TTS_VOICE, TTS_STYLE_PREFIX

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _post(model, payload, max_retries=2, request_timeout=10):
    """Gemini's free-tier responses are sometimes fast (2-5s) and sometimes very
    slow (30s+) under load. A short per-attempt timeout + retry usually gets a
    fast response on the 2nd try instead of waiting out a single slow one."""
    url = f"{BASE_URL}/{model}:generateContent?key={GEMINI_API_KEY}"
    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(url, json=payload, timeout=request_timeout)
        except requests.exceptions.Timeout:
            print(f"[slow response] {model} took >{request_timeout}s, retrying...")
            if attempt == max_retries:
                raise RuntimeError(f"{model} kept timing out after {max_retries + 1} attempts")
            continue
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            data = resp.json()
            msg = data.get("error", {}).get("message", "")
            print(f"[rate limit] {msg}")
            # If it's a daily cap (limit hits 10 or similar), retrying won't help.
            if "PerDay" in msg or attempt == max_retries:
                raise RuntimeError(f"Rate limited on {model}, giving up: {msg}")
            time.sleep(5)
            continue
        if resp.status_code in (500, 503) and attempt < max_retries:
            print(f"[server error {resp.status_code}] retrying...")
            continue
        resp.raise_for_status()
    raise RuntimeError(f"Failed to get a response from {model}")


_MIME_BY_EXT = {
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mp3",
}


def transcribe_audio(audio_path):
    """Send recorded audio (wav from CLI, or webm from browser) to Gemini for transcription."""
    ext = audio_path[audio_path.rfind("."):].lower()
    mime_type = _MIME_BY_EXT.get(ext, "audio/wav")

    with open(audio_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "contents": [{
            "parts": [
                {"text": "Transcribe exactly what is said in this audio. Return only the transcript, no extra commentary."},
                {"inlineData": {"mimeType": mime_type, "data": audio_b64}},
            ]
        }]
    }
    data = _post(STT_MODEL, payload)
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


MAX_HISTORY_TURNS = 6  # cap context so prompt size (and latency) stays flat as the call goes on


def generate_reply(system_prompt, conversation_history, user_message):
    """conversation_history: list of {"role": "user"|"model", "text": str}"""
    recent_history = conversation_history[-MAX_HISTORY_TURNS:]
    contents = []
    for turn in recent_history:
        contents.append({"role": turn["role"], "parts": [{"text": turn["text"]}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
    }
    data = _post(TEXT_MODEL, payload)
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def synthesize_speech(text, out_wav_path):
    """Generate speech audio for `text` using the tuned voice/style, save as playable WAV."""
    styled_text = TTS_STYLE_PREFIX + text
    payload = {
        "contents": [{"parts": [{"text": styled_text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": TTS_VOICE}}
            },
        },
    }
    data = _post(TTS_MODEL, payload)
    part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
    audio_bytes = base64.b64decode(part["data"])
    mime = part["mimeType"]

    if "wav" in mime:
        with open(out_wav_path, "wb") as f:
            f.write(audio_bytes)
    else:
        # raw PCM (audio/L16) - wrap in a proper WAV header
        with wave.open(out_wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_bytes)
    return out_wav_path
