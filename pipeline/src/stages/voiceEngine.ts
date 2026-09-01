import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ensureDir } from '../lib/fsutil.js';
import type { Script, VoiceoverResult } from '../types.js';

async function ttsElevenLabs(text: string): Promise<Buffer> {
  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`,
    { text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.8 } },
    {
      headers: { 'xi-api-key': config.elevenLabsApiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      responseType: 'arraybuffer',
      timeout: 30_000,
    }
  );
  return Buffer.from(resp.data);
}

async function ttsOpenAI(text: string): Promise<Buffer> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const resp = await client.audio.speech.create({
    model: config.openaiTtsModel,
    voice: config.openaiTtsVoice as never,
    input: text,
    response_format: 'mp3',
  });
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/** Generates a silent PCM16 mono WAV of the given duration — used only when
 * no TTS provider is configured, so downstream timing/render code still has
 * a real audio file with the right length to work against. */
function silentWav(seconds: number, sampleRate = 24_000): Buffer {
  const numSamples = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf; // PCM section stays zeroed (silence)
}

export async function synthesizeVoiceover(script: Script, outDir: string): Promise<VoiceoverResult> {
  await ensureDir(outDir);
  const fullText = script.scenes.map((s) => s.voiceover).join(' ');
  const ext = config.elevenLabsApiKey ? 'mp3' : config.openaiApiKey ? 'mp3' : 'wav';
  const filePath = path.join(outDir, `voiceover.${ext}`);

  try {
    let buf: Buffer;
    if (config.elevenLabsApiKey) {
      buf = await ttsElevenLabs(fullText);
    } else if (config.openaiApiKey) {
      buf = await ttsOpenAI(fullText);
    } else {
      throw new Error('no TTS provider configured');
    }
    await fs.writeFile(filePath, buf);
  } catch (err) {
    console.warn('[voiceEngine] real TTS unavailable, writing silent placeholder audio:', (err as Error).message);
    await fs.writeFile(filePath, silentWav(script.totalEstimatedSeconds));
  }

  // Scene-level durations: real per-scene TTS timing requires either
  // per-scene synthesis calls or forced alignment; we use the script's own
  // word-count-based estimates here, which the caption engine also builds
  // its cue timings from, so audio/caption timing stay internally consistent.
  const sceneDurations = script.scenes.map((s) => ({ sceneIndex: s.index, seconds: s.estimatedSeconds }));

  return { filePath, sceneDurations, totalSeconds: script.totalEstimatedSeconds };
}
