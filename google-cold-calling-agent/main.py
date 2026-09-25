"""
Local cold-calling voice agent - mic/speaker loop for testing on your own laptop.
You play the role of the prospective client; the agent (Asha) responds.

Run:
    python main.py

Each turn = 3 Gemini API calls (transcribe, generate reply, synthesize speech),
so expect to hit free-tier rate limits quickly during testing.
"""
import os
import datetime

from config import PERSONA_PROMPT, CALL_LOG_DIR
from audio_io import record_until_enter, play_wav
from gemini_client import transcribe_audio, generate_reply, synthesize_speech

TMP_DIR = os.path.join(os.path.dirname(__file__), "_tmp_audio")


def ensure_dirs():
    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(CALL_LOG_DIR, exist_ok=True)


def log_call(transcript_lines):
    ensure_dirs()
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(CALL_LOG_DIR, f"call_{ts}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(transcript_lines))
    print(f"\n[call log saved to {path}]")


def main():
    ensure_dirs()
    print("=" * 60)
    print("Local Cold-Call Agent - TEST MODE (mic/speaker, no real phone line)")
    print("You are playing the role of the prospective client.")
    print("Say 'goodbye' or press Ctrl+C to end the call.")
    print("=" * 60)

    conversation_history = []  # list of {"role": "user"|"model", "text": str}
    transcript_lines = []

    # Agent opens the call
    opening_line = "Hi! This is Asha calling, do you have a quick minute?"
    print(f"\nAsha: {opening_line}")
    opening_wav = os.path.join(TMP_DIR, "turn_0_agent.wav")
    synthesize_speech(opening_line, opening_wav)
    play_wav(opening_wav)
    conversation_history.append({"role": "model", "text": opening_line})
    transcript_lines.append(f"Asha: {opening_line}")

    turn = 1
    try:
        while True:
            user_wav = os.path.join(TMP_DIR, f"turn_{turn}_user.wav")
            record_until_enter(user_wav)

            print("Transcribing...")
            user_text = transcribe_audio(user_wav)
            print(f"You: {user_text}")
            transcript_lines.append(f"You: {user_text}")

            if "goodbye" in user_text.lower():
                print("Asha: Thanks so much for your time, have a great day!")
                transcript_lines.append("Asha: Thanks so much for your time, have a great day!")
                break

            print("Generating reply...")
            reply_text = generate_reply(PERSONA_PROMPT, conversation_history, user_text)
            print(f"Asha: {reply_text}")
            transcript_lines.append(f"Asha: {reply_text}")

            conversation_history.append({"role": "user", "text": user_text})
            conversation_history.append({"role": "model", "text": reply_text})

            print("Synthesizing voice...")
            agent_wav = os.path.join(TMP_DIR, f"turn_{turn}_agent.wav")
            synthesize_speech(reply_text, agent_wav)
            play_wav(agent_wav)

            turn += 1

    except KeyboardInterrupt:
        print("\n[call ended manually]")
    finally:
        log_call(transcript_lines)


if __name__ == "__main__":
    main()
