import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config";
import { EPHEMERIS_AGENT_PROMPT } from "../prompts";
import ephemerisData from "../../data/ephemeris.json";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

type EphemerisEvent = { subject: string; type: string; note: string };
type EphemerisDB = Record<string, EphemerisEvent[]>;

const DB = ephemerisData as EphemerisDB;

export function eventsForDate(date: Date = new Date()): EphemerisEvent[] {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return DB[`${mm}-${dd}`] ?? [];
}

export async function pickSuggestion(
  recentSubjects: string[],
  date: Date = new Date(),
): Promise<{ subject: string; reason: string } | null> {
  const events = eventsForDate(date);
  if (events.length === 0) return null;

  const eventsStr = events.map((e) => `- ${e.subject} (${e.type}): ${e.note}`).join("\n");
  const recentStr = recentSubjects.length ? recentSubjects.join(", ") : "ninguno";

  const response = await client().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: EPHEMERIS_AGENT_PROMPT(date.toISOString().slice(0, 10), eventsStr, recentStr),
      },
    ],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const cleaned = stripFences(text);
  try {
    const parsed = JSON.parse(cleaned) as { subject: string | null; reason: string };
    if (!parsed.subject) return null;
    return { subject: parsed.subject, reason: parsed.reason ?? "" };
  } catch {
    return null;
  }
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
