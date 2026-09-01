import { complete, safeParseJson } from '../lib/llm.js';
import type { FactCheckResult, Script, ScriptScene, StoryArc } from '../types.js';

const SYSTEM = `You are a script engine for short-form video. Expand a story
arc into 5-8 scenes of spoken voiceover lines, each short enough to read
aloud in 3-6 seconds at a brisk, punchy pace (roughly 14-16 words per line
max). Include a short on-screen text overlay per scene (3-6 words, a
"caption card" style hook/keyword, not a transcript). Keep total runtime
under 60 seconds.`;

const WORDS_PER_SECOND = 2.5; // brisk short-form narration pace

function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, Math.round((words / WORDS_PER_SECOND) * 10) / 10);
}

export async function buildScript(check: FactCheckResult, arc: StoryArc): Promise<Script> {
  const prompt = `Topic: ${check.brief.topic.title}
Story arc:
- Hook: ${arc.hook}
- Setup: ${arc.setup}
- Turn: ${arc.turn}
- Payoff: ${arc.payoff}
- CTA: ${arc.cta}

Return JSON with this exact shape:
{
  "title": string, // punchy video title, <= 60 chars
  "scenes": [{ "voiceover": string, "onScreenText": string }]  // 5-8 scenes, hook first, cta last
}`;

  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 1400 });
  const parsed = safeParseJson(raw, {
    title: check.brief.topic.title.slice(0, 60),
    scenes: [
      { voiceover: arc.hook, onScreenText: 'WAIT FOR IT' },
      { voiceover: arc.setup, onScreenText: 'CONTEXT' },
      { voiceover: arc.turn, onScreenText: 'THE TWIST' },
      { voiceover: arc.payoff, onScreenText: 'WHY IT MATTERS' },
      { voiceover: arc.cta, onScreenText: 'FOLLOW FOR MORE' },
    ],
  });

  const scenes: ScriptScene[] = (parsed.scenes ?? []).map((s, i) => ({
    index: i,
    voiceover: s.voiceover,
    onScreenText: s.onScreenText,
    estimatedSeconds: estimateSeconds(s.voiceover),
  }));

  return {
    title: parsed.title ?? check.brief.topic.title,
    arc,
    scenes,
    totalEstimatedSeconds: Math.round(scenes.reduce((sum, s) => sum + s.estimatedSeconds, 0) * 10) / 10,
  };
}
