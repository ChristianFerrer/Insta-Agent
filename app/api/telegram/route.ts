import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { env } from "@/lib/config";
import {
  handleCallback,
  handleHistorial,
  handleStart,
  handleTextMessage,
  isAllowed,
} from "@/lib/handlers";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Telegram webhook auth via secret_token header set when registering
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  // Telegram expects a quick 200 OK. We acknowledge immediately and process
  // in the background via `after()` so long image generations don't time out.
  after(async () => {
    try {
      await processUpdate(update);
    } catch (err) {
      console.error("processUpdate failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message) {
    const m = update.message;
    const userId = m.from?.id ?? 0;
    const chatId = m.chat.id;
    const text = m.text ?? "";

    if (!isAllowed(userId)) {
      await sendMessage(chatId, "⛔ No autorizado.");
      return;
    }

    if (text.startsWith("/start") || text.startsWith("/help")) {
      await handleStart(chatId);
      return;
    }
    if (text.startsWith("/historial")) {
      await handleHistorial(chatId);
      return;
    }
    if (text.startsWith("/post")) {
      const arg = text.replace(/^\/post(@\w+)?\s*/, "").trim();
      if (!arg) {
        await sendMessage(chatId, "Uso: /post [banda o músico]\nEjemplo: /post Freddie Mercury");
        return;
      }
      await handleTextMessage(chatId, userId, `Generá un post de: ${arg}`);
      return;
    }

    await handleTextMessage(chatId, userId, text);
    return;
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const userId = cq.from.id;
    const chatId = cq.message?.chat.id;
    const messageId = cq.message?.message_id;
    if (!chatId || !messageId || !cq.data) return;
    if (!isAllowed(userId)) return;
    await handleCallback(cq.id, userId, chatId, messageId, cq.data);
  }
}
