import { allowedUserIds } from "./config";
import * as db from "./db";
import { runAgent } from "./agent";
import { regenerateImage } from "./tools/image-gen";
import { instagramConfigured, publishImage } from "./tools/instagram";
import {
  answerCallbackQuery,
  deleteMessage,
  editMessageCaption,
  formatProposalCaption,
  proposalKeyboard,
  sendMessage,
  sendPhoto,
} from "./telegram";

export function isAllowed(userId: number): boolean {
  return allowedUserIds.size === 0 || allowedUserIds.has(userId);
}

// ---------------- Commands & text ----------------

export async function handleStart(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    [
      "👋 Soy el agente de <b>@bandtoons</b>.",
      "",
      "Pedime un post sobre cualquier músico o banda y te genero una propuesta.",
      "",
      "<b>Comandos:</b>",
      "/post [banda] — generar propuesta",
      "/historial — últimos posts",
      "/help — ayuda",
      "",
      "También entiendo lenguaje natural: <i>hacé un post tributo a Lemmy</i>",
    ].join("\n"),
  );
}

export async function handleHistorial(chatId: number): Promise<void> {
  const posts = await db.recentPosts(10);
  if (posts.length === 0) {
    await sendMessage(chatId, "📭 Todavía no hay posts aprobados.");
    return;
  }
  const lines = ["<b>📅 Últimos posts:</b>", ""];
  for (const p of posts) {
    const date = (p.published_at ?? p.created_at).slice(0, 10);
    const link = p.ig_permalink || "(no publicado en IG)";
    lines.push(`• <b>${p.subject}</b> — ${date}\n  ${link}`);
  }
  await sendMessage(chatId, lines.join("\n"));
}

export async function handleTextMessage(
  chatId: number,
  userId: number,
  text: string,
): Promise<void> {
  // Caption-edit mode
  const awaitingFor = await db.popAwaitingCaptionEdit(userId);
  if (awaitingFor !== null) {
    let cap = text;
    let tags: string | null = null;
    if (text.includes("|")) {
      const [c, t] = text.split("|", 2);
      cap = c.trim();
      tags = (t ?? "").trim();
    }
    const existing = await db.getProposal(awaitingFor);
    if (!existing) {
      await sendMessage(chatId, "⚠️ La propuesta original ya no existe.");
      return;
    }
    await db.updateProposalCaption(awaitingFor, cap, tags ?? existing.hashtags);
    const updated = await db.getProposal(awaitingFor);
    if (updated) {
      await sendPhoto(
        chatId,
        updated.image_url,
        formatProposalCaption(updated.id, updated.subject, updated.caption, updated.hashtags),
        proposalKeyboard(updated.id, instagramConfigured()),
      );
    }
    return;
  }

  const thinking = await sendMessage(chatId, "🎨 Pensando…");
  try {
    const history = await db.getConversation(userId);
    const result = await runAgent(text, history);

    await deleteMessage(chatId, thinking.message_id).catch(() => {});

    if (result.kind === "proposal") {
      const p = result.proposal;
      const proposalId = await db.saveProposal(chatId, p);
      const photoMsg = await sendPhoto(
        chatId,
        p.image_url,
        formatProposalCaption(proposalId, p.subject, p.caption, p.hashtags),
        proposalKeyboard(proposalId, instagramConfigured()),
      );
      await db.setProposalMessageId(proposalId, photoMsg.message_id);
      await db.setConversation(userId, []);
    } else {
      await sendMessage(chatId, result.text);
      await db.setConversation(userId, result.newHistory);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("agent error", err);
    await sendMessage(chatId, `❌ Error: ${msg}`);
  }
}

// ---------------- Callbacks ----------------

export async function handleCallback(
  callbackQueryId: string,
  userId: number,
  chatId: number,
  messageId: number,
  data: string,
): Promise<void> {
  await answerCallbackQuery(callbackQueryId);

  const [action, idStr] = data.split(":");
  const proposalId = Number(idStr);
  if (!action || !proposalId) return;

  const proposal = await db.getProposal(proposalId);
  if (!proposal) {
    await editMessageCaption(chatId, messageId, "⚠️ Propuesta expirada o no encontrada.", null);
    return;
  }

  if (action === "publish" || action === "approve") {
    await editMessageCaption(
      chatId,
      messageId,
      formatProposalCaption(
        proposal.id,
        proposal.subject,
        proposal.caption,
        proposal.hashtags,
        "\n⏳ Procesando…",
      ),
    );
    try {
      const archived = await db.archiveImage(proposal.image_url, proposal.subject);

      if (action === "publish" && instagramConfigured()) {
        const full = `${proposal.caption}\n\n${proposal.hashtags}`;
        const res = await publishImage(archived, full);
        await db.archivePublished(proposalId, archived, res.mediaId, res.permalink);
        await editMessageCaption(
          chatId,
          messageId,
          `✅ <b>Publicado en Instagram</b>\n<b>${proposal.subject}</b>\n\n🔗 ${res.permalink}`,
          null,
        );
      } else {
        // Approve preview-only (no IG)
        await db.archivePreviewOnly(proposalId, archived);
        await editMessageCaption(
          chatId,
          messageId,
          `✅ <b>Aprobado (modo preview, IG no configurado)</b>\n<b>${proposal.subject}</b>\n\nImagen archivada en Supabase Storage:\n${archived}`,
          null,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("publish error", err);
      await editMessageCaption(
        chatId,
        messageId,
        formatProposalCaption(
          proposal.id,
          proposal.subject,
          proposal.caption,
          proposal.hashtags,
          `\n❌ Error: ${msg}`,
        ),
        proposalKeyboard(proposal.id, instagramConfigured()),
      );
    }
    return;
  }

  if (action === "regen") {
    await editMessageCaption(
      chatId,
      messageId,
      formatProposalCaption(
        proposal.id,
        proposal.subject,
        proposal.caption,
        proposal.hashtags,
        "\n🔄 Regenerando imagen…",
      ),
    );
    try {
      const fresh = await regenerateImage(proposal.image_prompt);
      await db.updateProposalImage(proposal.id, fresh.url, fresh.prompt);
      await deleteMessage(chatId, messageId).catch(() => {});
      const photoMsg = await sendPhoto(
        chatId,
        fresh.url,
        formatProposalCaption(
          proposal.id,
          proposal.subject,
          proposal.caption,
          proposal.hashtags,
          "(regenerada)",
        ),
        proposalKeyboard(proposal.id, instagramConfigured()),
      );
      await db.setProposalMessageId(proposal.id, photoMsg.message_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sendMessage(chatId, `❌ Error regenerando: ${msg}`);
    }
    return;
  }

  if (action === "editcap") {
    await db.setAwaitingCaptionEdit(userId, proposalId);
    await sendMessage(
      chatId,
      "✏️ Mandame la nueva caption.\n\nPara cambiar también los hashtags, usá:\n<code>caption | hashtags</code>",
    );
    return;
  }

  if (action === "discard") {
    await db.deleteProposal(proposalId);
    await editMessageCaption(chatId, messageId, `🗑 Propuesta #${proposalId} descartada.`, null);
    return;
  }
}
