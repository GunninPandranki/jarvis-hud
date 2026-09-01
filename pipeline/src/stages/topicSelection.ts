import type { ScoredTopic } from '../types.js';

/**
 * Picks the single best topic to produce next: highest virality score,
 * excluding anything already turned into a video, and lightly deduping
 * near-identical titles so we don't pick two RSS mirrors of the same story.
 */
export function selectTopic(scored: ScoredTopic[], usedTopicIds: string[]): ScoredTopic | undefined {
  const usedSet = new Set(usedTopicIds);
  const seenTitles = new Set<string>();

  for (const topic of scored) {
    if (usedSet.has(topic.id)) continue;
    const key = normalizeTitle(topic.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    return topic;
  }
  return undefined;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ');
}
