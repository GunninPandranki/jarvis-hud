"""
Cartesia TTS via a single raw HTTP POST - no SDK.
Uses the same `requests` library already used for the Gemini calls.

Usage:
    python cartesia_client.py                 # writes output.wav using the default sample line
    python cartesia_client.py "Custom text"    # writes output.wav speaking custom text
"""
import os
import sys
import requests

CARTESIA_URL = "https://api.cartesia.ai/tts/bytes"
CARTESIA_SSE_URL = "https://api.cartesia.ai/tts/sse"
CARTESIA_VERSION = "2026-08-14"


def _load_dotenv(path=None):
    """Minimal .env loader (no python-dotenv dependency) - sets os.environ
    from KEY=VALUE lines if the key isn't already set in the environment."""
    path = path or os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            if key and key not in os.environ:
                os.environ[key] = value


DEFAULT_VOICE = "1259b7e3-cb8a-43df-9446-30971a46b8b0"  # Devansh - Warm Support Agent
DEFAULT_SPEED = 0.85  # slightly slower than normal for a relaxed, unhurried feel


def synthesize(
    transcript,
    out_path="output.wav",
    voice=DEFAULT_VOICE,
    model_id="sonic-3.6",
    sample_rate=44100,
    speed=DEFAULT_SPEED,
    volume=1,
):
    """POST to Cartesia's /tts/bytes endpoint and write the raw WAV bytes to out_path."""
    _load_dotenv()
    api_key = os.environ.get("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY not set (checked environment and .env)")

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "Cartesia-Version": CARTESIA_VERSION,
    }
    payload = {
        "model_id": model_id,
        "transcript": transcript,
        "voice": voice,
        "output_format": {
            "container": "wav",
            "encoding": "pcm_s16le",
            "sample_rate": sample_rate,
        },
        "generation_config": {
            "speed": speed,
            "volume": volume,
        },
    }

    resp = requests.post(CARTESIA_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Cartesia request failed ({resp.status_code}): {resp.text[:500]}")

    with open(out_path, "wb") as f:
        f.write(resp.content)

    return out_path


def synthesize_pcm_bytes(
    transcript,
    voice=DEFAULT_VOICE,
    model_id="sonic-3.6",
    sample_rate=44100,
    speed=DEFAULT_SPEED,
    volume=1,
):
    """Like synthesize(), but returns raw PCM16 bytes directly instead of writing a WAV file.
    Used for pre-generating short filler clips the browser can schedule instantly."""
    _load_dotenv()
    api_key = os.environ.get("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY not set (checked environment and .env)")

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "Cartesia-Version": CARTESIA_VERSION,
    }
    payload = {
        "model_id": model_id,
        "transcript": transcript,
        "voice": voice,
        "output_format": {
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": sample_rate,
        },
        "generation_config": {"speed": speed, "volume": volume},
    }
    resp = requests.post(CARTESIA_URL, headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"Cartesia request failed ({resp.status_code}): {resp.text[:500]}")
    return resp.content


def stream_synthesize_pcm(
    transcript,
    voice=DEFAULT_VOICE,
    model_id="sonic-3.6",
    sample_rate=44100,
    speed=DEFAULT_SPEED,
    volume=1,
):
    """Stream raw PCM16 audio chunks (base64 strings, as sent by Cartesia) as they
    arrive, instead of waiting for the whole clip. Yields base64-encoded PCM chunks."""
    _load_dotenv()
    api_key = os.environ.get("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY not set (checked environment and .env)")

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "Cartesia-Version": CARTESIA_VERSION,
    }
    payload = {
        "model_id": model_id,
        "transcript": transcript,
        "voice": voice,
        "output_format": {
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": sample_rate,
        },
        "generation_config": {
            "speed": speed,
            "volume": volume,
        },
    }

    resp = requests.post(CARTESIA_SSE_URL, headers=headers, json=payload, stream=True, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Cartesia stream request failed ({resp.status_code}): {resp.text[:500]}")

    import json as _json
    for line in resp.iter_lines():
        if not line:
            continue
        line = line.decode("utf-8") if isinstance(line, bytes) else line
        if not line.startswith("data:"):
            continue
        event = _json.loads(line[len("data:"):].strip())
        if event.get("type") == "chunk" and event.get("data"):
            yield event["data"]  # base64-encoded PCM16 chunk
        if event.get("done"):
            break


if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "Hi, thanks for calling Cartesia. How can I help you today?"
    path = synthesize(text)
    print(f"Wrote {path} ({os.path.getsize(path)} bytes)")
