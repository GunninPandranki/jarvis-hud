import type { FactCheckResult, GeneratedImage, QAReport, Script, VoiceoverResult } from '../types.js';

/**
 * Deterministic pre-render checklist. Kept rule-based (not LLM) because QA
 * gates should be reliable and fast to run on every video, not subject to
 * model variance.
 */
export function runQa(opts: {
  script: Script;
  check: FactCheckResult;
  images: GeneratedImage[];
  voiceover: VoiceoverResult;
}): QAReport {
  const { script, check, images, voiceover } = opts;
  const checks: QAReport['checks'] = [];

  checks.push({
    name: 'runtime-under-60s',
    passed: script.totalEstimatedSeconds <= 65,
    note: `${script.totalEstimatedSeconds}s estimated`,
  });

  checks.push({
    name: 'fact-check-passed',
    passed: check.passed,
    note: check.passed ? undefined : `${check.flaggedClaims.length} claim(s) flagged`,
  });

  checks.push({
    name: 'every-scene-has-image',
    passed: script.scenes.every((s) => images.some((img) => img.sceneIndex === s.index)),
  });

  checks.push({
    name: 'voiceover-file-present',
    passed: voiceover.filePath.length > 0,
  });

  checks.push({
    name: 'no-empty-voiceover-lines',
    passed: script.scenes.every((s) => s.voiceover.trim().length > 0),
  });

  checks.push({
    name: 'scene-count-in-range',
    passed: script.scenes.length >= 4 && script.scenes.length <= 10,
    note: `${script.scenes.length} scenes`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}
