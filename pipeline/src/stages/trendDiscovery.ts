import axios from 'axios';
import Parser from 'rss-parser';
import { config } from '../config.js';
import type { TrendCandidate } from '../types.js';

const rssParser = new Parser();
const nowIso = () => new Date().toISOString();

/** Google Trends daily-trending RSS feed. No API key required. */
async function fromGoogleTrends(geo = 'US'): Promise<TrendCandidate[]> {
  try {
    const feed = await rssParser.parseURL(
      `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`
    );
    return (feed.items ?? []).map((item, i) => ({
      id: `gtrends-${geo}-${i}-${item.guid ?? item.title}`,
      source: 'google-trends' as const,
      title: item.title ?? 'Untitled trend',
      url: item.link,
      summary: (item as { contentSnippet?: string }).contentSnippet,
      metrics: {
        // Google's RSS doesn't expose raw volume; rank in the daily list is
        // itself a strong, free signal so we encode it as a decaying volume proxy.
        volume: Math.max(100 - i * 5, 5),
        recencyHours: 6,
      },
      raw: item,
      discoveredAt: nowIso(),
    }));
  } catch (err) {
    console.warn('[trendDiscovery] Google Trends RSS failed:', (err as Error).message);
    return [];
  }
}

/** Reddit's public JSON listing endpoints. No API key required. */
async function fromReddit(subreddits = ['popular', 'technology', 'todayilearned']): Promise<TrendCandidate[]> {
  const results: TrendCandidate[] = [];
  for (const sub of subreddits) {
    try {
      const { data } = await axios.get(`https://www.reddit.com/r/${sub}/hot.json`, {
        params: { limit: 15 },
        headers: { 'User-Agent': 'viral-content-pipeline/0.1 (trend-discovery)' },
        timeout: 10_000,
      });
      const children = data?.data?.children ?? [];
      for (const c of children) {
        const p = c.data;
        if (!p || p.stickied) continue;
        const ageHours = (Date.now() / 1000 - p.created_utc) / 3600;
        results.push({
          id: `reddit-${p.id}`,
          source: 'reddit',
          title: p.title,
          url: `https://reddit.com${p.permalink}`,
          summary: p.selftext?.slice(0, 300),
          metrics: {
            volume: p.ups,
            engagement: p.upvote_ratio,
            recencyHours: Math.round(ageHours),
          },
          raw: { subreddit: sub, numComments: p.num_comments },
          discoveredAt: nowIso(),
        });
      }
    } catch (err) {
      console.warn(`[trendDiscovery] Reddit r/${sub} failed:`, (err as Error).message);
    }
  }
  return results;
}

/** NewsAPI.org top-headlines. Requires NEWSAPI_KEY. */
async function fromNews(): Promise<TrendCandidate[]> {
  if (!config.newsApiKey) return [];
  try {
    const { data } = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { language: 'en', pageSize: 25, apiKey: config.newsApiKey },
      timeout: 10_000,
    });
    return (data.articles ?? []).map((a: Record<string, unknown>, i: number) => ({
      id: `news-${i}-${a.url}`,
      source: 'news' as const,
      title: String(a.title),
      url: String(a.url),
      summary: a.description ? String(a.description) : undefined,
      metrics: {
        recencyHours: hoursSince(a.publishedAt as string),
      },
      raw: a,
      discoveredAt: nowIso(),
    }));
  } catch (err) {
    console.warn('[trendDiscovery] NewsAPI failed:', (err as Error).message);
    return [];
  }
}

/** YouTube Data API v3 mostPopular chart. Requires YOUTUBE_API_KEY. */
async function fromYouTube(): Promise<TrendCandidate[]> {
  if (!config.youtubeApiKey) return [];
  try {
    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        maxResults: 25,
        regionCode: 'US',
        key: config.youtubeApiKey,
      },
      timeout: 10_000,
    });
    return (data.items ?? []).map((v: Record<string, any>) => ({
      id: `yt-${v.id}`,
      source: 'youtube' as const,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      summary: v.snippet.description?.slice(0, 300),
      metrics: {
        volume: Number(v.statistics.viewCount ?? 0),
        engagement: safeRatio(v.statistics.likeCount, v.statistics.viewCount),
        recencyHours: hoursSince(v.snippet.publishedAt),
      },
      raw: v,
      discoveredAt: nowIso(),
    }));
  } catch (err) {
    console.warn('[trendDiscovery] YouTube API failed:', (err as Error).message);
    return [];
  }
}

/** Generic RSS feeds (finance + tech + general news) — no keys required. */
const DEFAULT_RSS_FEEDS = [
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', source: 'finance' as const },
  { url: 'https://www.reddit.com/r/all/top/.rss?t=day', source: 'rss' as const },
  { url: 'https://hnrss.org/frontpage', source: 'rss' as const },
];

async function fromRssFeeds(): Promise<TrendCandidate[]> {
  const out: TrendCandidate[] = [];
  for (const feedDef of DEFAULT_RSS_FEEDS) {
    try {
      const feed = await rssParser.parseURL(feedDef.url);
      (feed.items ?? []).slice(0, 15).forEach((item, i) => {
        out.push({
          id: `${feedDef.source}-${feedDef.url}-${i}`,
          source: feedDef.source,
          title: item.title ?? 'Untitled',
          url: item.link,
          summary: (item as { contentSnippet?: string }).contentSnippet?.slice(0, 300),
          metrics: {
            recencyHours: item.isoDate ? hoursSince(item.isoDate) : undefined,
          },
          raw: item,
          discoveredAt: nowIso(),
        });
      });
    } catch (err) {
      console.warn(`[trendDiscovery] RSS feed ${feedDef.url} failed:`, (err as Error).message);
    }
  }
  return out;
}

function hoursSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.round((Date.now() - t) / 36e5));
}

function safeRatio(a?: string, b?: string): number | undefined {
  const na = Number(a);
  const nb = Number(b);
  if (!nb) return undefined;
  return na / nb;
}

/** Fan out to every source in parallel and merge whatever succeeds. */
export async function discoverTrends(): Promise<TrendCandidate[]> {
  const results = await Promise.all([fromGoogleTrends(), fromReddit(), fromNews(), fromYouTube(), fromRssFeeds()]);
  const merged = results.flat();
  console.log(`[trendDiscovery] collected ${merged.length} candidates from ${results.filter((r) => r.length).length} live sources`);
  return merged;
}
