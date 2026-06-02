// Free image generation via Pollinations.ai — no API key, no payment.
// Runs Flux Schnell behind the scenes. Community-sponsored, no SLA but
// works well for demos. Replace with fal.ai or Replicate for production.

import { STYLE_PROMPT_BASE } from "../config";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 1024;

export function buildImagePrompt(subjectDescription: string, composition = "centered portrait"): string {
  return `${STYLE_PROMPT_BASE}, portrait of ${subjectDescription}, ${composition}, vintage cartoon poster style`;
}

function buildUrl(prompt: string, seed: number): string {
  const params = new URLSearchParams({
    width: String(IMAGE_WIDTH),
    height: String(IMAGE_HEIGHT),
    model: "flux",
    nologo: "true",
    enhance: "false",
    seed: String(seed),
  });
  return `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

async function ensureReachable(url: string): Promise<void> {
  // Pollinations generates the image at the moment the URL is fetched.
  // We do a HEAD-like probe (small range GET) to surface errors early and
  // warm the cache so Telegram's image fetch completes quickly.
  const resp = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  if (!resp.ok && resp.status !== 206) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Pollinations failed (${resp.status}): ${body.slice(0, 200)}`);
  }
}

export async function generateImage(
  subjectDescription: string,
  composition = "centered portrait",
): Promise<{ url: string; prompt: string }> {
  const prompt = buildImagePrompt(subjectDescription, composition);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = buildUrl(prompt, seed);
  await ensureReachable(url);
  return { url, prompt };
}

export async function regenerateImage(
  previousPrompt: string,
): Promise<{ url: string; prompt: string }> {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = buildUrl(previousPrompt, seed);
  await ensureReachable(url);
  return { url, prompt: previousPrompt };
}
