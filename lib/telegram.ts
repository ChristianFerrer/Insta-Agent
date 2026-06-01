import { env } from "./config";

function api(): string {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
}

export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

type ApiResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${api()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await resp.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(`Telegram ${method} failed (${body.error_code}): ${body.description}`);
  }
  return body.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  opts: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML" | "MarkdownV2" } = {},
): Promise<{ message_id: number }> {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    disable_web_page_preview: true,
  });
}

export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  reply_markup?: InlineKeyboardMarkup,
): Promise<{ message_id: number }> {
  return call("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
    reply_markup,
  });
}

export async function editMessageCaption(
  chatId: number,
  messageId: number,
  caption: string,
  reply_markup?: InlineKeyboardMarkup | null,
): Promise<unknown> {
  return call("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    reply_markup: reply_markup ?? undefined,
  });
}

export async function deleteMessage(chatId: number, messageId: number): Promise<unknown> {
  return call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function setMyCommands(commands: { command: string; description: string }[]): Promise<unknown> {
  return call("setMyCommands", { commands });
}

// ---------------- UI helpers ----------------

export function proposalKeyboard(proposalId: number, canPublish: boolean): InlineKeyboardMarkup {
  const publishBtn: InlineKeyboardButton = canPublish
    ? { text: "✅ Publicar", callback_data: `publish:${proposalId}` }
    : { text: "✅ Aprobar (preview)", callback_data: `approve:${proposalId}` };
  return {
    inline_keyboard: [
      [publishBtn, { text: "🔄 Regenerar imagen", callback_data: `regen:${proposalId}` }],
      [
        { text: "✏️ Editar caption", callback_data: `editcap:${proposalId}` },
        { text: "❌ Descartar", callback_data: `discard:${proposalId}` },
      ],
    ],
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatProposalCaption(
  proposalId: number,
  subject: string,
  caption: string,
  hashtags: string,
  suffix = "",
): string {
  const head = `<b>📌 Propuesta #${proposalId} — ${escapeHtml(subject)}</b>`;
  const cap = `<b>Caption:</b>\n${escapeHtml(caption)}`;
  const tags = `<b>Hashtags:</b>\n<code>${escapeHtml(hashtags)}</code>`;
  return [head, "", cap, "", tags, suffix].filter(Boolean).join("\n");
}
