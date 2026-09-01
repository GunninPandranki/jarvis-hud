import { complete, safeParseJson } from '../lib/llm.js';
import type { Script, VisualPlan, VisualScene } from '../types.js';

const SYSTEM = `You are a visual director for short-form vertical video (9:16).
For each script scene, write a detailed text-to-image prompt (subject,
composition, lighting, style — punchy, high-contrast, thumb-stopping,
consistent visual style across scenes) and a negative prompt (things to
avoid: text artifacts, watermarks, extra limbs, etc). Also choose a camera
motion for Remotion's Ken-Burns-style animation of the still image.`;

const MOTION_CYCLE: VisualScene['motion']['type'][] = [
  'ken-burns-in',
  'pan-right',
  'ken-burns-out',
  'pan-left',
];

export async function directVisuals(script: Script): Promise<VisualPlan> {
  const prompt = `Video title: ${script.title}
Scenes:
${script.scenes.map((s) => `${s.index + 1}. VO: "${s.voiceover}" | overlay: "${s.onScreenText ?? ''}"`).join('\n')}

Return JSON with this exact shape:
{
  "scenes": [{ "imagePrompt": string, "negativePrompt": string, "motion": "ken-burns-in"|"ken-burns-out"|"pan-left"|"pan-right"|"static" }]
  // one entry per scene, same order and count as the scenes above
}`;

  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 1600 });
  const parsed = safeParseJson(raw, {
    scenes: script.scenes.map((s) => ({
      imagePrompt: `Vertical 9:16 cinematic photo illustrating: ${s.voiceover}. Bold, high-contrast, thumb-stopping style, consistent color grade.`,
      negativePrompt: 'text, watermark, logo, distorted anatomy, extra limbs, blurry',
      motion: 'ken-burns-in' as const,
    })),
  });

  const scenes: VisualScene[] = script.scenes.map((scriptScene, i) => {
    const v = parsed.scenes?.[i];
    return {
      sceneIndex: scriptScene.index,
      imagePrompt: v?.imagePrompt ?? `Vertical 9:16 illustration of: ${scriptScene.voiceover}`,
      negativePrompt: v?.negativePrompt ?? 'text, watermark, logo, blurry',
      motion: {
        type: v?.motion ?? MOTION_CYCLE[i % MOTION_CYCLE.length],
        durationSeconds: scriptScene.estimatedSeconds,
      },
    };
  });

  return { scenes };
}
