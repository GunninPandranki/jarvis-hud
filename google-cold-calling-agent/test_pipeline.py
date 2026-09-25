"""
Automated round-trip test for the cold-call agent pipeline.

For each test input:
  1. Send text to /api/turn_stream (simulating what the browser would send
     after transcribing your speech).
  2. Collect the streamed PCM audio chunks and the reply text.
  3. Save the audio as a WAV file.
  4. Transcribe that audio BACK to text using Gemini (closing the loop) to
     verify Cartesia actually said what the reply text claims it said.
  5. Report: reply text, transcribed-back text, whether they roughly match,
     timing, and any errors encountered.

Run: python test_pipeline.py
"""
import os
import sys
import json
import time
import wave
import base64
import difflib
import requests

sys.path.insert(0, os.path.dirname(__file__))
from gemini_client import transcribe_audio

BASE_URL = "http://127.0.0.1:5000"
OUT_DIR = os.path.join(os.path.dirname(__file__), "_test_audio")
os.makedirs(OUT_DIR, exist_ok=True)

TEST_CASES = [
    ("casual_yes", "yeah sure I drink coffee, what's this about"),
    ("urgent_meeting", "I'm actually late for a meeting can you call me later"),
    ("objection_has_brand", "I already have my own coffee brand that I use"),
    ("not_interested", "I'm not interested, please don't call again"),
    ("agree_to_sample", "okay fine you can send me a sample"),
    ("address_given", "sure my address is 42 park street bangalore"),
    ("question_price", "how much does it cost"),
    ("goodbye", "okay thanks, goodbye"),
]


def call_turn_stream(text):
    """POST text to /api/turn_stream, collect reply text + concatenated PCM audio."""
    t0 = time.time()
    resp = requests.post(
        f"{BASE_URL}/api/turn_stream",
        headers={"Content-Type": "application/json"},
        json={"text": text},
        stream=True,
        timeout=30,
    )
    reply_text = None
    sample_rate = 44100
    pcm_chunks = []
    error = None
    ended = False

    buf = ""
    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
        if not chunk:
            continue
        buf += chunk
        while "\n\n" in buf:
            raw_event, buf = buf.split("\n\n", 1)
            if not raw_event.startswith("data:"):
                continue
            evt = json.loads(raw_event[len("data:"):].strip())
            if evt["type"] == "reply":
                reply_text = evt["reply_text"]
                sample_rate = evt.get("sample_rate", 44100)
            elif evt["type"] == "audio":
                pcm_chunks.append(base64.b64decode(evt["chunk"]))
            elif evt["type"] == "error":
                error = evt["error"]
            elif evt["type"] == "done":
                ended = evt.get("ended", False)

    elapsed = time.time() - t0
    pcm_bytes = b"".join(pcm_chunks)
    return {
        "reply_text": reply_text,
        "sample_rate": sample_rate,
        "pcm_bytes": pcm_bytes,
        "error": error,
        "ended": ended,
        "elapsed": elapsed,
    }


def save_wav(pcm_bytes, sample_rate, path):
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)


def similarity(a, b):
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def main():
    # fresh call session
    requests.post(f"{BASE_URL}/api/start", timeout=30)

    results = []
    for name, text in TEST_CASES:
        print(f"\n=== {name} ===")
        print(f"  input: {text!r}")
        result = call_turn_stream(text)

        if result["error"]:
            print(f"  [ERROR] {result['error']}")
            results.append({"name": name, "input": text, "error": result["error"]})
            continue

        print(f"  reply_text: {result['reply_text']!r}")
        print(f"  elapsed: {result['elapsed']:.2f}s  audio_bytes: {len(result['pcm_bytes'])}")

        wav_path = os.path.join(OUT_DIR, f"{name}.wav")
        save_wav(result["pcm_bytes"], result["sample_rate"], wav_path)

        # Close the loop: transcribe the generated audio back to text
        transcribed = None
        try:
            transcribed = transcribe_audio(wav_path)
            print(f"  transcribed_back: {transcribed!r}")
        except Exception as e:
            print(f"  [transcription failed] {e}")

        sim = similarity(result["reply_text"], transcribed) if transcribed else None
        if sim is not None:
            flag = "OK" if sim > 0.6 else "MISMATCH"
            print(f"  similarity: {sim:.2f} [{flag}]")

        results.append({
            "name": name,
            "input": text,
            "reply_text": result["reply_text"],
            "transcribed_back": transcribed,
            "similarity": sim,
            "elapsed": result["elapsed"],
            "ended": result["ended"],
        })

        if result["ended"]:
            print("  [call ended by agent - starting fresh session for remaining tests]")
            requests.post(f"{BASE_URL}/api/end", timeout=10)
            requests.post(f"{BASE_URL}/api/start", timeout=30)

    requests.post(f"{BASE_URL}/api/end", timeout=10)

    print("\n\n========== SUMMARY ==========")
    for r in results:
        if "error" in r:
            print(f"[FAIL]  {r['name']}: {r['error']}")
        else:
            sim = r["similarity"]
            tag = "OK" if (sim and sim > 0.6) else ("NO-STT" if sim is None else "MISMATCH")
            print(f"[{tag:7}] {r['name']:20} sim={sim if sim is not None else 'n/a'!s:5} elapsed={r['elapsed']:.2f}s")

    return results


if __name__ == "__main__":
    main()
