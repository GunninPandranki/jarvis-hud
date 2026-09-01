import { complete, safeParseJson } from '../lib/llm.js';
import type { ResearchBrief, ScoredTopic } from '../types.js';

const SYSTEM = `You are a research agent for a short-form video pipeline. Given a
trending topic (title + summary + source metadata), produce a tight research
brief: verifiable key facts, credible source leads, strong narrative angles,
and risks (things that could be wrong, misleading, sensitive, or legally
risky to state as fact). Be skeptical of the raw trend text — it may be a
clickbait headline, not a verified fact.`;

export async function research(topic: ScoredTopic): Promise<ResearchBrief> {
  const prompt = `Topic: ${topic.title}
Source: ${topic.source}
URL: ${topic.url ?? 'n/a'}
Summary/snippet: ${topic.summary ?? 'n/a'}
Virality score: ${topic.viralityScore}/100

Return JSON with this exact shape:
{
  "keyFacts": string[],   // 4-8 concrete, checkable facts relevant to this topic
  "sources": string[],    // URLs or named outlets that would corroborate these facts (include the topic URL if given)
  "angles": string[],     // 2-4 narrative angles a short-form video could take
  "risks": string[]       // things to verify/avoid stating as fact without hedging
}`;

  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 1200 });
  const parsed = safeParseJson(raw, {
    keyFacts: [`(unverified) ${topic.title}`],
    sources: topic.url ? [topic.url] : [],
    angles: ['Straightforward explainer'],
    risks: ['LLM unavailable — facts below are unverified, verify before publishing'],
  });

  return {
    topic,
    keyFacts: parsed.keyFacts ?? [],
    sources: parsed.sources ?? [],
    angles: parsed.angles ?? [],
    risks: parsed.risks ?? [],
  };
}
