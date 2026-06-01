import { NextResponse, type NextRequest } from "next/server";
import { allowedUserIdsSet, env } from "@/lib/config";
import * as db from "@/lib/db";
import { pickSuggestion } from "@/lib/tools/ephemeris";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization");
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const recent = await db.recentSubjects(30);
  const suggestion = await pickSuggestion(recent);
  if (!suggestion) {
    return NextResponse.json({ ok: true, suggestion: null });
  }

  const text = [
    "☀️ <b>Sugerencia del día</b>",
    "",
    `<b>${suggestion.subject}</b>`,
    `<i>${suggestion.reason}</i>`,
    "",
    "¿Genero el post? Respondé sí o dame instrucciones específicas.",
  ].join("\n");

  const ids = Array.from(allowedUserIdsSet());
  for (const chatId of ids) {
    try {
      await sendMessage(chatId, text);
      await db.logProactive(chatId, suggestion.subject);
    } catch (err) {
      console.error("send proactive to", chatId, err);
    }
  }

  return NextResponse.json({ ok: true, suggestion, notified: ids.length });
}
