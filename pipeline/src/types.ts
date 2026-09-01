export interface TrendCandidate {
  id: string;
  source: 'google-trends' | 'youtube' | 'news' | 'reddit' | 'rss' | 'finance';
  title: string;
  url?: string;
  summary?: string;
  metrics: {
    volume?: number; // search volume / upvotes / views proxy
    growthPct?: number; // % change vs baseline, when known
    engagement?: number; // comments/likes/upvote ratio proxy, 0-1
    recencyHours?: number; // hours since published/detected
  };
  raw?: unknown;
  discoveredAt: string;
}

export interface ScoredTopic extends TrendCandidate {
  viralityScore: number; // 0-100
  scoreBreakdown: Record<string, number>;
}

export interface ResearchBrief {
  topic: ScoredTopic;
  keyFacts: string[];
  sources: string[];
  angles: string[];
  risks: string[];
}

export interface FactCheckResult {
  brief: ResearchBrief;
  verifiedFacts: { claim: string; confidence: 'high' | 'medium' | 'low'; note?: string }[];
  flaggedClaims: string[];
  passed: boolean;
}

export interface StoryArc {
  hook: string;
  setup: string;
  turn: string;
  payoff: string;
  cta: string;
}

export interface ScriptScene {
  index: number;
  voiceover: string;
  onScreenText?: string;
  estimatedSeconds: number;
}

export interface Script {
  title: string;
  arc: StoryArc;
  scenes: ScriptScene[];
  totalEstimatedSeconds: number;
}

export interface VisualScene {
  sceneIndex: number;
  imagePrompt: string;
  negativePrompt?: string;
  motion: {
    type: 'ken-burns-in' | 'ken-burns-out' | 'pan-left' | 'pan-right' | 'static';
    durationSeconds: number;
  };
}

export interface VisualPlan {
  scenes: VisualScene[];
}

export interface GeneratedImage {
  sceneIndex: number;
  filePath: string;
  prompt: string;
}

export interface VoiceoverResult {
  filePath: string;
  sceneDurations: { sceneIndex: number; seconds: number }[];
  totalSeconds: number;
}

export interface CaptionResult {
  srtPath: string;
  cues: { start: number; end: number; text: string }[];
}

export interface SoundDesignResult {
  musicPath?: string;
  musicPrompt: string;
  sfxNotes: string[];
}

export interface QAReport {
  passed: boolean;
  checks: { name: string; passed: boolean; note?: string }[];
}

export interface PipelineResult {
  topic: ScoredTopic;
  script: Script;
  visualPlan: VisualPlan;
  images: GeneratedImage[];
  voiceover: VoiceoverResult;
  captions: CaptionResult;
  sound: SoundDesignResult;
  qa: QAReport;
  remotionPropsPath: string;
  finalVideoPath?: string;
}
