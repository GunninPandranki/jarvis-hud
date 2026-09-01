import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from '../lib/fsutil.js';
import type { CaptionResult, Script, VoiceoverResult } from '../types.js';

function formatSrtTime(totalSeconds: number): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWholeSeconds = Math.floor(totalSeconds);
  const s = totalWholeSeconds % 60;
  const m = Math.floor(totalWholeSeconds / 60) % 60;
  const h = Math.floor(totalWholeSeconds / 3600);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Builds burned-in-style caption cues (one per scene) from the voiceover's
 * scene-duration timeline, so captions line up with audio and with the
 * Remotion scene cuts driven by the same durations. */
export async function generateCaptions(script: Script, voiceover: VoiceoverResult, outDir: string): Promise<CaptionResult> {
  await ensureDir(outDir);
  let cursor = 0;
  const cues = script.scenes.map((scene) => {
    const duration = voiceover.sceneDurations.find((d) => d.sceneIndex === scene.index)?.seconds ?? scene.estimatedSeconds;
    const start = cursor;
    const end = cursor + duration;
    cursor = end;
    return { start, end, text: scene.voiceover };
  });

  const srt = cues
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n');

  const srtPath = path.join(outDir, 'captions.srt');
  await fs.writeFile(srtPath, srt, 'utf-8');

  return { srtPath, cues };
}
