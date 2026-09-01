import { complete, safeParseJson } from '../lib/llm.js';
import type { FactCheckResult, ResearchBrief } from '../types.js';

const SYSTEM = `You are a fact-checking agent. You receive a research brief's
claimed facts and must rate your confidence in each, based on general
knowledge and internal consistency (you have no live web access here — treat
this as a plausibility/consistency pass, not a ground-truth verification, and
say so via lower confidence when a claim can't be reasoned about this way).
Flag anything that sounds fabricated, internally contradictory, or stated
with unwarranted certainty.`;

export async function factCheck(brief: ResearchBrief): Promise<FactCheckResult> {
  const prompt = `Claims to check:
${brief.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Sources cited: ${brief.sources.join(', ') || 'none'}

Return JSON with this exact shape:
{
  "verifiedFacts": [{ "claim": string, "confidence": "high"|"medium"|"low", "note": string }],
  "flaggedClaims": string[] // subset of claims that should NOT be stated as fact without a hedge
}`;

  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 1200 });
  const parsed = safeParseJson(raw, {
    verifiedFacts: brief.keyFacts.map((claim) => ({
      claim,
      confidence: 'low' as const,
      note: 'LLM unavailable — not actually checked',
    })),
    flaggedClaims: brief.keyFacts,
  });

  const flaggedClaims = parsed.flaggedClaims ?? [];
  const lowConfidenceCount = (parsed.verifiedFacts ?? []).filter((f) => f.confidence === 'low').length;
  // Pass if fewer than half the claims are flagged/low-confidence — otherwise
  // send it back for the story engine to hedge language or drop weak claims.
  const passed = flaggedClaims.length + lowConfidenceCount < Math.ceil(brief.keyFacts.length / 2);

  return {
    brief,
    verifiedFacts: parsed.verifiedFacts ?? [],
    flaggedClaims,
    passed,
  };
}
