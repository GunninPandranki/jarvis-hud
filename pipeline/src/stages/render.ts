import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeJson } from '../lib/fsutil.js';
import type { PipelineResult } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = path.resolve(__dirname, '..', '..', 'remotion');

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

/** Shapes the pipeline's stage outputs into the flat props object the
 * Remotion composition (remotion/src/Video.tsx) reads via getInputProps(). */
export function buildRemotionProps(result: Omit<PipelineResult, 'remotionPropsPath' | 'finalVideoPath'>) {
  const scenes = result.script.scenes.map((scene) => {
    const image = result.images.find((img) => img.sceneIndex === scene.index);
    const visual = result.visualPlan.scenes.find((v) => v.sceneIndex === scene.index);
    const durationSec = result.voiceover.sceneDurations.find((d) => d.sceneIndex === scene.index)?.seconds ?? scene.estimatedSeconds;
    return {
      index: scene.index,
      imagePath: image?.filePath ?? '',
      onScreenText: scene.onScreenText ?? '',
      voiceover: scene.voiceover,
      durationInFrames: Math.max(1, Math.round(durationSec * FPS)),
      motion: visual?.motion.type ?? 'ken-burns-in',
    };
  });

  const totalDurationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

  return {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    title: result.script.title,
    audioPath: result.voiceover.filePath,
    musicPath: result.sound.musicPath ?? null,
    captions: result.captions.cues,
    scenes,
    totalDurationInFrames,
  };
}

/** Remotion only serves files placed under its own public/ dir (via
 * staticFile()). Copy every asset the props reference in there, under a
 * run-scoped subfolder, and rewrite the paths to include "public/" so
 * remotion/src/Video.tsx's resolveAsset() picks them up. */
async function copyIntoRemotionPublic(filePath: string, runId: string): Promise<string> {
  if (!filePath) return filePath;
  const destDir = path.join(REMOTION_DIR, 'public', 'generated', runId);
  await ensureDir(destDir);
  const destPath = path.join(destDir, path.basename(filePath));
  await fs.copyFile(filePath, destPath);
  return destPath; // contains ".../remotion/public/generated/<runId>/..." — resolveAsset finds the "public/" marker
}

export async function writeRemotionProps(
  result: Omit<PipelineResult, 'remotionPropsPath' | 'finalVideoPath'>,
  outDir: string
): Promise<string> {
  const props = buildRemotionProps(result);
  const runId = path.basename(outDir);

  props.audioPath = await copyIntoRemotionPublic(props.audioPath, runId);
  if (props.musicPath) props.musicPath = await copyIntoRemotionPublic(props.musicPath, runId);
  for (const scene of props.scenes) {
    if (scene.imagePath) scene.imagePath = await copyIntoRemotionPublic(scene.imagePath, runId);
  }

  const propsPath = path.join(outDir, 'remotion-props.json');
  await writeJson(propsPath, props);
  return propsPath;
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

/** Invokes the real Remotion CLI (`remotion render`) against the sibling
 * `remotion/` project, using the props file this stage just wrote. Requires
 * `npm install` to have been run inside `pipeline/remotion`. */
export async function renderVideo(propsPath: string, outFile: string): Promise<string | undefined> {
  await ensureDir(path.dirname(outFile));
  try {
    await fs.access(path.join(REMOTION_DIR, 'node_modules'));
  } catch {
    console.warn(
      '[render] remotion/node_modules not found — skipping actual render.\n' +
        '         Run `npm install` inside pipeline/remotion, then re-run this stage,\n' +
        '         or manually: cd pipeline/remotion && npx remotion render src/Root.tsx ShortVideo <out.mp4> --props=' +
        propsPath
    );
    return undefined;
  }

  await run(
    'npx',
    ['remotion', 'render', 'src/Root.tsx', 'ShortVideo', outFile, `--props=${propsPath}`],
    REMOTION_DIR
  );
  return outFile;
}
