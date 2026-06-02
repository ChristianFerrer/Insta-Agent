// Free image generation via Google Gemini 2.5 Flash Image ("Nano Banana").
// Generous free tier from aistudio.google.com. Fast (~3-5s), reliable.
//
// Flow: Gemini returns base64 image bytes -> upload to Supabase Storage
// -> return the public URL. We upload eagerly so Telegram has a stable
// URL to render and so the image persists past the conversation.

import { STYLE_PROMPT_BASE, env } from "../config";
import { uploadGeneratedImage } from "../db";

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export function buildImagePrompt(subjectDescription: string, composition = "centered portrait"): string {
  return `${STYLE_PROMPT_BASE}, portrait of ${subjectDescription}, ${composition}, vintage cartoon poster style`;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

async function callGemini(prompt: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Gemini API ${resp.status}: ${body.slice(0, 300)}`);
  }

  const json = (await resp.json()) as GeminiResponse;
  if (json.error) throw new Error(`Gemini error: ${json.error.message}`);
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) {
    const finishReason = json.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no image (finishReason: ${finishReason ?? "unknown"})`);
  }

  const bytes = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
  return { bytes, mimeType: inline.mimeType ?? "image/png" };
}

export async function generateImage(
  subjectDescription: string,
  composition = "centered portrait",
): Promise<{ url: string; prompt: string }> {
  const prompt = buildImagePrompt(subjectDescription, composition);
  const { bytes, mimeType } = await callGemini(prompt);
  const url = await uploadGeneratedImage(bytes, mimeType, "generation");
  return { url, prompt };
}

export async function regenerateImage(
  previousPrompt: string,
): Promise<{ url: string; prompt: string }> {
  const { bytes, mimeType } = await callGemini(previousPrompt);
  const url = await uploadGeneratedImage(bytes, mimeType, "regen");
  return { url, prompt: previousPrompt };
}
