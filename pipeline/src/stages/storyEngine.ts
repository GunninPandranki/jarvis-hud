import { complete, safeParseJson } from '../lib/llm.js';
import type { FactCheckResult, StoryArc } from '../types.js';

const SYSTEM = `You are a story engine for viral short-form video (TikTok/Reels/
Shorts, 30-60 seconds). Turn a fact-checked research brief into a tight
five-beat narrative arc optimized for retention: a scroll-stopping hook in
the first 2 seconds, quick setup, a surprising turn/reveal, a satisfying
payoff, and a clear call to action. Use only claims marked high/medium
confidence; hedge or omit low-confidence/flagged claims.`;

export async function buildStory(check: FactCheckResult): Promise<StoryArc> {
  const usableFacts = check.verifiedFacts
    .filter((f) => f.confidence !== 'low' && !check.flaggedClaims.includes(f.claim))
    .map((f) => f.claim);

  const prompt = `Topic: ${check.brief.topic.title}
Angles: ${check.brief.angles.join(' | ')}
Usable, checked facts:
${usableFacts.map((f) => `- ${f}`).join('\n') || '- (none passed fact-check; keep the story generic/light and say so implicitly)'}

Return JSON with this exact shape:
{
  "hook": string,   // 1 sentence, first 2 seconds of the video, must create curiosity
  "setup": string,  // 1-2 sentences of context
  "turn": string,   // the surprising reveal/insight
  "payoff": string, // the resolution / "so what"
  "cta": string     // short call-to-action (follow/comment/watch-to-end style)
}`;

  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 800 });
  return safeParseJson<StoryArc>(raw, {
    hook: `You won't believe what's happening with ${check.brief.topic.title}.`,
    setup: check.brief.keyFacts[0] ?? 'Here is the context.',
    turn: check.brief.angles[0] ?? 'Here is the twist.',
    payoff: 'Here is why it matters.',
    cta: 'Follow for more.',
  });
}
