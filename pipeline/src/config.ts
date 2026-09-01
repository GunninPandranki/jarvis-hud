import 'dotenv/config';
import path from 'node:path';

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  youtubeApiKey: env('YOUTUBE_API_KEY'),
  newsApiKey: env('NEWSAPI_KEY'),

  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-sonnet-4-5'),
  openaiApiKey: env('OPENAI_API_KEY'),

  stabilityApiKey: env('STABILITY_API_KEY'),
  imageProvider: env('IMAGE_PROVIDER', 'openai') as 'openai' | 'stability',
  imageModel: env('IMAGE_MODEL', 'gpt-image-1'),

  elevenLabsApiKey: env('ELEVENLABS_API_KEY'),
  elevenLabsVoiceId: env('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
  openaiTtsModel: env('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'),
  openaiTtsVoice: env('OPENAI_TTS_VOICE', 'alloy'),

  outputDir: path.resolve(env('OUTPUT_DIR', './output')),
  topicDbPath: path.resolve(env('TOPIC_DB_PATH', './data/topics.json')),

  hasLlm: () => Boolean(config.anthropicApiKey || config.openaiApiKey),
};

export function requireAtLeastOneLlm(): void {
  if (!config.hasLlm()) {
    console.warn(
      '\n⚠️  No ANTHROPIC_API_KEY or OPENAI_API_KEY set — LLM-driven stages ' +
        '(research, fact-check, story, script, visual direction, QA) will fall ' +
        'back to deterministic templated output instead of real generations.\n'
    );
  }
}
