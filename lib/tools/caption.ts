import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config";
import { CAPTION_GENERATION_PROMPT } from "../prompts";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export async function generateCaption(
  subject: string,
  context = "general tribute",
): Promise<{ caption: string; hashtags: string }> {
  const response = await client().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: CAPTION_GENERATION_PROMPT(subject, context) }],
  });

  const text =
    response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

  const cleaned = stripFences(text);
  try {
    const parsed = JSON.parse(cleaned) as { caption?: string; hashtags?: string };
    if (parsed.caption && parsed.hashtags) {
      return { caption: parsed.caption.trim(), hashtags: parsed.hashtags.trim() };
    }
  } catch {
    /* fall through */
  }

  return {
    caption: `Thank you ${subject}.`,
    hashtags: "#bandtoons #cartoon #vintageart #rubberhose #music",
  };
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.slice(3);
    if (t.startsWith("json")) t = t.slice(4);
    const end = t.lastIndexOf("```");
    if (end !== -1) t = t.slice(0, end);
  }
  return t.trim();
}
