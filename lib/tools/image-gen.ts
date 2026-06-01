import { fal } from "@fal-ai/client";
import { env, IMAGE_SIZE, STYLE_PROMPT_BASE } from "../config";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: env.FAL_KEY });
  configured = true;
}

export function buildImagePrompt(subjectDescription: string, composition = "centered portrait"): string {
  return `${STYLE_PROMPT_BASE}, portrait of ${subjectDescription}, ${composition}, vintage cartoon poster style`;
}

type FluxResult = {
  images: { url: string; width: number; height: number }[];
};

export async function generateImage(
  subjectDescription: string,
  composition = "centered portrait",
): Promise<{ url: string; prompt: string }> {
  ensureConfigured();
  const prompt = buildImagePrompt(subjectDescription, composition);
  const out = (await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size: IMAGE_SIZE,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
    },
  })) as { data: FluxResult };

  const url = out.data.images[0]?.url;
  if (!url) throw new Error("fal.ai returned no image");
  return { url, prompt };
}

export async function regenerateImage(
  previousPrompt: string,
): Promise<{ url: string; prompt: string }> {
  ensureConfigured();
  const out = (await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt: previousPrompt,
      image_size: IMAGE_SIZE,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
      seed: Math.floor(Math.random() * 1_000_000_000),
    },
  })) as { data: FluxResult };

  const url = out.data.images[0]?.url;
  if (!url) throw new Error("fal.ai returned no image");
  return { url, prompt: previousPrompt };
}
