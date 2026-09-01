import { complete } from '../lib/llm.js';
import type { Script, SoundDesignResult } from '../types.js';

const SYSTEM = `You are a sound designer for short-form video. Given a script,
propose a one-line background-music brief (genre/mood/tempo/reference) and a
short list of SFX cues tied to specific scene beats (whooshes, dings, risers).
This is a text brief only — no audio synthesis here.`;

/**
 * There is no free, keyless music-generation API worth wiring up (Suno/
 * Udio/MusicGen-hosted APIs all require paid keys we don't have here), so
 * this stage produces a concrete, actionable music/SFX brief a human or a
 * downstream generation job (e.g. a MusicGen/Stability-audio call, added the
 * same way imageGenerator.ts wires in an image provider) can act on, plus
 * placeholder SFX notes per beat.
 */
export async function designSound(script: Script): Promise<SoundDesignResult> {
  const prompt = `Video title: ${script.title}
Scenes:
${script.scenes.map((s, i) => `${i + 1}. ${s.voiceover}`).join('\n')}

Return a short music brief (one line: genre, mood, tempo, a reference-artist
comparison) followed by a bulleted list of SFX cues, one per relevant beat,
each starting with "- ".`;

  const raw = await complete({ system: SYSTEM, prompt, maxTokens: 400 });
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const musicPrompt = lines.find((l) => !l.startsWith('-')) ?? 'Upbeat, tension-building electronic underscore, 100-110bpm';
  const sfxNotes = lines.filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, ''));

  return {
    musicPrompt,
    sfxNotes: sfxNotes.length ? sfxNotes : ['- whoosh on hook', '- riser into the turn', '- soft ding on payoff'],
  };
}
