import { config } from '../config.js';
import { readJson, writeJson } from '../lib/fsutil.js';
import type { ScoredTopic, TrendCandidate } from '../types.js';

interface TopicDb {
  candidates: TrendCandidate[];
  scored: ScoredTopic[];
  usedTopicIds: string[]; // topics already produced into a video — never reselect
  updatedAt: string;
}

const EMPTY_DB: TopicDb = { candidates: [], scored: [], usedTopicIds: [], updatedAt: new Date(0).toISOString() };

export async function loadDb(): Promise<TopicDb> {
  return readJson(config.topicDbPath, EMPTY_DB);
}

export async function saveCandidates(candidates: TrendCandidate[]): Promise<TopicDb> {
  const db = await loadDb();
  const byId = new Map(db.candidates.map((c) => [c.id, c]));
  for (const c of candidates) byId.set(c.id, c); // newer discovery wins
  const next: TopicDb = { ...db, candidates: [...byId.values()], updatedAt: new Date().toISOString() };
  await writeJson(config.topicDbPath, next);
  return next;
}

export async function saveScored(scored: ScoredTopic[]): Promise<TopicDb> {
  const db = await loadDb();
  const next: TopicDb = { ...db, scored, updatedAt: new Date().toISOString() };
  await writeJson(config.topicDbPath, next);
  return next;
}

export async function markTopicUsed(topicId: string): Promise<void> {
  const db = await loadDb();
  if (!db.usedTopicIds.includes(topicId)) {
    db.usedTopicIds.push(topicId);
    await writeJson(config.topicDbPath, { ...db, updatedAt: new Date().toISOString() });
  }
}
