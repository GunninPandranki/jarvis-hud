"""
Mic recording (push-to-talk) and speaker playback, using only sounddevice/scipy
for recording and winsound for playback (Windows built-in, no extra deps).
"""
import os
import sys
import wave
import numpy as np
import sounddevice as sd

from config import SAMPLE_RATE


def record_until_enter(out_wav_path):
    """Push-to-talk: press Enter to start, press Enter again to stop."""
    input("\nPress Enter to start speaking...")
    print("Recording... press Enter to stop.")

    frames = []

    def callback(indata, frames_count, time_info, status):
        frames.append(indata.copy())

    stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", callback=callback)
    with stream:
        input()  # blocks until Enter pressed again

    if not frames:
        raise RuntimeError("No audio captured.")

    audio = np.concatenate(frames, axis=0)
    with wave.open(out_wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())

    return out_wav_path


def play_wav(wav_path):
    if sys.platform == "win32":
        import winsound
        winsound.PlaySound(wav_path, winsound.SND_FILENAME)
    else:
        # Fallback for non-Windows: use sounddevice to play back
        import soundfile as sf
        data, sr = sf.read(wav_path, dtype="int16")
        sd.play(data, sr)
        sd.wait()
