import type { ScoredTopic, TrendCandidate } from '../types.js';

/**
 * Deterministic, explainable scoring heuristic (0-100). No LLM involved —
 * virality scoring should be fast, cheap, and reproducible across the whole
 * candidate pool so we can safely score hundreds of items per run.
 *
 * Weighted signals:
 *  - volume: log-scaled raw popularity (views/upvotes/search rank proxy)
 *  - engagement: ratio-based signal (like ratio, upvote ratio) 0-1
 *  - recency: exponential decay — fresher trends score higher
 *  - sourceWeight: some sources correlate more with short-form virality
 */
const SOURCE_WEIGHT: Record<TrendCandidate['source'], number> = {
  'google-trends': 1.0,
  youtube: 1.1,
  reddit: 1.05,
  news: 0.85,
  rss: 0.75,
  finance: 0.8,
};

function scoreVolume(volume?: number): number {
  if (!volume || volume <= 0) return 0;
  // log10 scale, normalized so ~1M -> ~100, ~1k -> ~50
  return Math.min(100, (Math.log10(volume + 1) / 6) * 100);
}

function scoreEngagement(engagement?: number): number {
  if (engagement === undefined) return 50; // neutral when unknown
  return Math.max(0, Math.min(100, engagement * 100));
}

function scoreRecency(hours?: number): number {
  if (hours === undefined) return 50; // neutral when unknown
  // half-life of 18 hours: fresh = ~100, 18h old = 50, 72h old = ~6
  return 100 * Math.pow(0.5, hours / 18);
}

export function scoreTopic(candidate: TrendCandidate): ScoredTopic {
  const volume = scoreVolume(candidate.metrics.volume);
  const engagement = scoreEngagement(candidate.metrics.engagement);
  const recency = scoreRecency(candidate.metrics.recencyHours);
  const sourceWeight = SOURCE_WEIGHT[candidate.source] ?? 1;

  const weighted = volume * 0.4 + engagement * 0.25 + recency * 0.35;
  const viralityScore = Math.round(Math.min(100, weighted * sourceWeight));

  return {
    ...candidate,
    viralityScore,
    scoreBreakdown: {
      volume: Math.round(volume),
      engagement: Math.round(engagement),
      recency: Math.round(recency),
      sourceWeight,
    },
  };
}

export function scoreAll(candidates: TrendCandidate[]): ScoredTopic[] {
  return candidates.map(scoreTopic).sort((a, b) => b.viralityScore - a.viralityScore);
}
