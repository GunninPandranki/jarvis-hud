import axios from 'axios';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { ensureDir } from '../lib/fsutil.js';
import type { GeneratedImage, VisualPlan } from '../types.js';

async function generateWithOpenAI(prompt: string): Promise<Buffer> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const result = await client.images.generate({
    model: config.imageModel,
    prompt,
    size: '1024x1536', // closest portrait size to 9:16
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image API returned no data');
  return Buffer.from(b64, 'base64');
}

/** Google Imagen via the Gemini API's :predict endpoint. Needs GEMINI_API_KEY
 * or GOOGLE_API_KEY — a real, documented API (unlike the Google Flow web
 * app, which has no public API to call). */
async function generateWithGoogleImagen(prompt: string): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.googleImageModel}:predict?key=${config.googleApiKey}`;
  const { data } = await axios.post(
    url,
    {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '9:16' },
    },
    { timeout: 60_000 }
  );
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Google Imagen API returned no image data');
  return Buffer.from(b64, 'base64');
}

async function generateWithStability(prompt: string, negativePrompt?: string): Promise<Buffer> {
  const resp = await axios.post(
    'https://api.stability.ai/v2beta/stable-image/generate/core',
    (() => {
      const form = new FormData();
      form.append('prompt', prompt);
      if (negativePrompt) form.append('negative_prompt', negativePrompt);
      form.append('aspect_ratio', '9:16');
      form.append('output_format', 'png');
      return form;
    })(),
    {
      headers: { Authorization: `Bearer ${config.stabilityApiKey}`, Accept: 'image/*' },
      responseType: 'arraybuffer',
      timeout: 60_000,
    }
  );
  return Buffer.from(resp.data);
}

/** Deterministic offline placeholder: a labeled gradient SVG card per scene. */
function placeholderSvg(sceneIndex: number, prompt: string): string {
  const hue = (sceneIndex * 47) % 360;
  const escaped = prompt.slice(0, 140).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},70%,25%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 60) % 360},70%,15%)"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <text x="60" y="900" fill="white" font-family="sans-serif" font-size="44" font-weight="700">Scene ${sceneIndex + 1}</text>
  <foreignObject x="60" y="960" width="960" height="600">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-family:sans-serif;font-size:32px;line-height:1.4;opacity:0.85">
      ${escaped}
    </div>
  </foreignObject>
  <text x="60" y="1840" fill="white" font-family="sans-serif" font-size="24" opacity="0.6">PLACEHOLDER — no image API key configured</text>
</svg>`;
}

export async function generateImages(plan: VisualPlan, outDir: string): Promise<GeneratedImage[]> {
  await ensureDir(outDir);
  const images: GeneratedImage[] = [];

  for (const scene of plan.scenes) {
    const base = path.join(outDir, `scene-${String(scene.sceneIndex).padStart(2, '0')}`);
    try {
      let buf: Buffer | null = null;
      if (config.imageProvider === 'google' && config.googleApiKey) {
        buf = await generateWithGoogleImagen(scene.imagePrompt);
      } else if (config.imageProvider === 'stability' && config.stabilityApiKey) {
        buf = await generateWithStability(scene.imagePrompt, scene.negativePrompt);
      } else if (config.openaiApiKey) {
        buf = await generateWithOpenAI(scene.imagePrompt);
      } else if (config.googleApiKey) {
        buf = await generateWithGoogleImagen(scene.imagePrompt);
      } else if (config.stabilityApiKey) {
        buf = await generateWithStability(scene.imagePrompt, scene.negativePrompt);
      }

      if (buf) {
        const filePath = `${base}.png`;
        await fs.writeFile(filePath, buf);
        images.push({ sceneIndex: scene.sceneIndex, filePath, prompt: scene.imagePrompt });
        continue;
      }
    } catch (err) {
      console.warn(`[imageGenerator] scene ${scene.sceneIndex} generation failed, using placeholder:`, (err as Error).message);
    }

    const filePath = `${base}.svg`;
    await fs.writeFile(filePath, placeholderSvg(scene.sceneIndex, scene.imagePrompt), 'utf-8');
    images.push({ sceneIndex: scene.sceneIndex, filePath, prompt: scene.imagePrompt });
  }

  return images;
}
