import path from 'node:path';
import { config, requireAtLeastOneLlm } from './config.js';
import { discoverTrends } from './stages/trendDiscovery.js';
import { loadDb, markTopicUsed, saveCandidates, saveScored } from './stages/topicDatabase.js';
import { scoreAll } from './stages/viralityAnalyzer.js';
import { selectTopic } from './stages/topicSelection.js';
import { research } from './stages/researchAgent.js';
import { factCheck } from './stages/factChecker.js';
import { buildStory } from './stages/storyEngine.js';
import { buildScript } from './stages/scriptEngine.js';
import { directVisuals } from './stages/visualDirector.js';
import { generateImages } from './stages/imageGenerator.js';
import { synthesizeVoiceover } from './stages/voiceEngine.js';
import { generateCaptions } from './stages/captionEngine.js';
import { designSound } from './stages/soundDesign.js';
import { runQa } from './stages/qaAgent.js';
import { renderVideo, writeRemotionProps } from './stages/render.js';
import { slugify } from './lib/fsutil.js';
import type { PipelineResult, ScoredTopic } from './types.js';

export async function runDiscoveryOnly(): Promise<ScoredTopic[]> {
  const fresh = await discoverTrends();
  const db = await saveCandidates(fresh); // merges into whatever was already persisted
  const scored = scoreAll(db.candidates); // score the full persisted pool, not just this run's haul
  await saveScored(scored);
  return scored;
}

export async function runFullPipeline(opts: { render?: boolean } = {}): Promise<PipelineResult> {
  requireAtLeastOneLlm();

  console.log('\n=== 1. TREND DISCOVERY ===');
  const scored = await runDiscoveryOnly();

  console.log('\n=== 2. TOPIC SELECTION ===');
  const db = await loadDb();
  const topic = selectTopic(scored, db.usedTopicIds);
  if (!topic) throw new Error('No unused topic candidates available — try again later or clear the topic DB.');
  console.log(`Selected: "${topic.title}" (score ${topic.viralityScore}, source ${topic.source})`);

  console.log('\n=== 3. RESEARCH AGENT ===');
  const brief = await research(topic);

  console.log('\n=== 4. FACT CHECKER ===');
  const check = await factCheck(brief);
  console.log(`Fact-check ${check.passed ? 'PASSED' : 'FLAGGED'} (${check.flaggedClaims.length} flagged claim(s))`);

  console.log('\n=== 5. STORY ENGINE ===');
  const arc = await buildStory(check);

  console.log('\n=== 6. SCRIPT ENGINE ===');
  const script = await buildScript(check, arc);
  console.log(`Script "${script.title}": ${script.scenes.length} scenes, ~${script.totalEstimatedSeconds}s`);

  console.log('\n=== 7. VISUAL DIRECTOR ===');
  const visualPlan = await directVisuals(script);

  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(script.title)}`;
  const runDir = path.join(config.outputDir, runId);

  console.log('\n=== 8a. IMAGE GENERATOR ===');
  const images = await generateImages(visualPlan, path.join(runDir, 'images'));

  console.log('\n=== 9. VOICE ENGINE ===');
  const voiceover = await synthesizeVoiceover(script, runDir);

  console.log('\n=== 10. CAPTION ENGINE ===');
  const captions = await generateCaptions(script, voiceover, runDir);

  console.log('\n=== 11. SOUND DESIGN ===');
  const sound = await designSound(script);

  console.log('\n=== 12. QA AGENT ===');
  const qa = runQa({ script, check, images, voiceover });
  console.log(qa.passed ? 'QA PASSED' : `QA FAILED: ${qa.checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}`);

  console.log('\n=== 8b. MOTION PLAN -> REMOTION PROPS ===');
  const remotionPropsPath = await writeRemotionProps(
    { topic, script, visualPlan, images, voiceover, captions, sound, qa },
    runDir
  );

  let finalVideoPath: string | undefined;
  if (opts.render ?? true) {
    console.log('\n=== 13. RENDER ===');
    finalVideoPath = await renderVideo(remotionPropsPath, path.join(runDir, 'final-short.mp4'));
  }

  await markTopicUsed(topic.id);

  const result: PipelineResult = {
    topic,
    script,
    visualPlan,
    images,
    voiceover,
    captions,
    sound,
    qa,
    remotionPropsPath,
    finalVideoPath,
  };

  console.log(`\n✅ Pipeline complete. Run artifacts in: ${runDir}`);
  if (finalVideoPath) console.log(`   Final video: ${finalVideoPath}`);
  else console.log('   (No final video — Remotion render was skipped; see remotion-props.json to render it manually.)');

  return result;
}
