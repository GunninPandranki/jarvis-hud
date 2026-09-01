# Viral Content Pipeline

An end-to-end pipeline that discovers trending topics, researches and
fact-checks them, writes a short-form video script, generates images and a
motion plan, synthesizes voiceover, generates captions, and renders a final
vertical (9:16) short with [Remotion](https://www.remotion.dev/).

```
TREND DISCOVERY -> TOPIC DATABASE -> VIRALITY ANALYZER -> TOPIC SELECTION
   -> RESEARCH AGENT -> FACT CHECKER -> STORY ENGINE -> SCRIPT ENGINE
   -> VISUAL DIRECTOR -> { IMAGE GENERATOR, MOTION PLAN } -> VOICE ENGINE
   -> CAPTION ENGINE -> SOUND DESIGN -> QA AGENT -> RENDER -> FINAL SHORT
```

Every stage lives in `src/stages/*.ts` and is a plain async function with a
typed input/output (`src/types.ts`), orchestrated by `src/pipeline.ts`. That
makes each stage independently testable and swappable.

## Real integrations, graceful degradation

Every stage that needs a paid API degrades to a clearly-labeled,
still-functional fallback when the corresponding key is missing, so
`npm run pipeline` always runs end to end with zero configuration — you get
placeholder images/audio and templated (not fabricated-as-real) text instead
of a crash. Add keys incrementally to upgrade each stage to the real thing.

| Stage | Real source used when configured | Key(s) | Fallback |
|---|---|---|---|
| Trend discovery | Google Trends RSS, Reddit hot listings | *(none needed)* | — always live |
| Trend discovery | NewsAPI top-headlines | `NEWSAPI_KEY` | source skipped |
| Trend discovery | YouTube Data API trending chart | `YOUTUBE_API_KEY` | source skipped |
| Virality analyzer | Deterministic scoring heuristic (log-scaled volume + engagement ratio + recency half-life + source weight) | *(none needed)* | — always live |
| Research / fact-check / story / script / visual direction / QA copy | Anthropic Claude | `ANTHROPIC_API_KEY` | OpenAI, then a labeled stub |
| ″ | OpenAI (fallback LLM) | `OPENAI_API_KEY` | — |
| Image generation | OpenAI `gpt-image-1` | `OPENAI_API_KEY` | Stability AI, then a labeled placeholder SVG card |
| Image generation | Stability AI | `STABILITY_API_KEY` + `IMAGE_PROVIDER=stability` | — |
| Voice/TTS | ElevenLabs | `ELEVENLABS_API_KEY` | OpenAI TTS, then a silent WAV of the correct duration |
| Voice/TTS | OpenAI TTS | `OPENAI_API_KEY` | — |
| Sound design | LLM-written music/SFX brief (text, not audio synthesis — see comment in `soundDesign.ts` for why) | LLM key | templated brief |
| Render | Real Remotion CLI render (`remotion render`) | *(none needed, needs `npm install` in `remotion/`)* | props JSON written, render step skipped with instructions |

QA is a deterministic rule-based gate (runtime, fact-check pass, every scene
has an image, etc.) — not LLM-graded — so it's fast and reproducible.

## Setup

```bash
cd pipeline
npm install
cp .env.example .env   # fill in whichever keys you have
cd remotion && npm install && cd ..
```

## Usage

```bash
npm run discover        # trend discovery + virality scoring only, prints top 10
npm run pipeline        # full pipeline: discover -> script -> assets -> render
npm run render:preview  # open the Remotion Studio preview for the last props
```

Every run writes its artifacts to `output/<timestamp>-<topic-slug>/`:
research/script JSON is embedded in the console log; on disk you get
`images/`, `voiceover.(mp3|wav)`, `captions.srt`, `remotion-props.json`, and
(if the Remotion render step ran) `final-short.mp4`.

The topic database (`data/topics.json` by default) tracks every discovered
candidate, its virality score, and which topics have already been turned
into a video, so re-running `npm run pipeline` won't repeat a topic.

## Project layout

```
pipeline/
  src/
    stages/          one file per pipeline stage
    lib/              LLM wrapper + filesystem helpers
    types.ts          shared data contracts between stages
    pipeline.ts        orchestrator
    cli.ts             CLI entrypoint
  remotion/            Remotion project: takes remotion-props.json and
                       renders the final MP4 (Ken-Burns motion, captions,
                       voiceover + music tracks)
  data/                topic database (git-ignored)
  output/              per-run generated assets (git-ignored)
```
