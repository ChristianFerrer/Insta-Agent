import logging
from collections import defaultdict

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from . import db
from .agent import run_agent
from .config import settings
from .tools.caption import generate_caption
from .tools.image_gen import regenerate_with_variation
from .tools.instagram import InstagramError, publish_image

logger = logging.getLogger(__name__)

# In-memory per-user conversation history (resets on bot restart — fine for MVP)
_history: dict[int, list[dict]] = defaultdict(list)
# Pending caption-edit state: user_id -> proposal_id
_awaiting_caption_edit: dict[int, int] = {}


def _is_allowed(user_id: int) -> bool:
    allowed = settings.allowed_user_ids
    return not allowed or user_id in allowed


def _proposal_keyboard(proposal_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Publicar", callback_data=f"publish:{proposal_id}"),
            InlineKeyboardButton("🔄 Regenerar imagen", callback_data=f"regen:{proposal_id}"),
        ],
        [
            InlineKeyboardButton("✏️ Editar caption", callback_data=f"editcap:{proposal_id}"),
            InlineKeyboardButton("❌ Descartar", callback_data=f"discard:{proposal_id}"),
        ],
    ])


def _format_caption_preview(caption: str, hashtags: str) -> str:
    return f"<b>Caption:</b>\n{caption}\n\n<b>Hashtags:</b>\n<code>{hashtags}</code>"


async def _send_proposal(update_or_chat, context: ContextTypes.DEFAULT_TYPE, proposal: dict, chat_id: int) -> None:
    proposal_id = await db.save_proposal(
        chat_id=chat_id,
        subject=proposal["subject"],
        caption=proposal["caption"],
        hashtags=proposal["hashtags"],
        image_url=proposal["image_url"],
        image_prompt=proposal["image_prompt"],
    )

    caption_text = (
        f"<b>📌 Propuesta #{proposal_id} — {proposal['subject']}</b>\n\n"
        + _format_caption_preview(proposal["caption"], proposal["hashtags"])
    )
    await context.bot.send_photo(
        chat_id=chat_id,
        photo=proposal["image_url"],
        caption=caption_text,
        parse_mode=ParseMode.HTML,
        reply_markup=_proposal_keyboard(proposal_id),
    )


# ============ Command handlers ============

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update.effective_user.id):
        await update.message.reply_text("⛔ No autorizado.")
        return

    await update.message.reply_text(
        "👋 Soy el agente de @bandtoons.\n\n"
        "Pedime un post sobre cualquier músico o banda y te genero una propuesta.\n\n"
        "<b>Comandos:</b>\n"
        "/post [banda] — generar propuesta\n"
        "/historial — últimos posts publicados\n"
        "/help — ayuda\n\n"
        "También podés hablarme normal: <i>'hacé un post tributo a Lemmy'</i>",
        parse_mode=ParseMode.HTML,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await cmd_start(update, context)


async def cmd_post(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update.effective_user.id):
        return
    if not context.args:
        await update.message.reply_text("Uso: /post [banda o músico]\nEjemplo: /post Freddie Mercury")
        return
    text = "Generá un post de: " + " ".join(context.args)
    await _handle_message(update, context, text)


async def cmd_historial(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update.effective_user.id):
        return
    posts = await db.recent_posts(limit=10)
    if not posts:
        await update.message.reply_text("📭 Todavía no hay posts publicados.")
        return

    lines = ["<b>📅 Últimos posts publicados:</b>\n"]
    for p in posts:
        date = p["published_at"][:10] if p["published_at"] else "—"
        link = p.get("ig_permalink") or "(sin link)"
        lines.append(f"• <b>{p['subject']}</b> — {date}\n  {link}")
    await update.message.reply_text("\n\n".join(lines), parse_mode=ParseMode.HTML)


# ============ Text message handler ============

async def on_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update.effective_user.id):
        return

    user_id = update.effective_user.id

    # Caption-edit mode: next message replaces the caption
    if user_id in _awaiting_caption_edit:
        proposal_id = _awaiting_caption_edit.pop(user_id)
        new_text = update.message.text or ""
        # Allow user to send "caption | hashtags" or just caption
        if "|" in new_text:
            cap, tags = new_text.split("|", 1)
            await db.update_proposal_caption(proposal_id, cap.strip(), tags.strip())
        else:
            proposal = await db.get_proposal(proposal_id)
            if proposal:
                await db.update_proposal_caption(proposal_id, new_text.strip(), proposal["hashtags"])

        proposal = await db.get_proposal(proposal_id)
        if proposal:
            await update.message.reply_text(
                f"✏️ Caption actualizada para propuesta #{proposal_id}.\n\n"
                + _format_caption_preview(proposal["caption"], proposal["hashtags"]),
                parse_mode=ParseMode.HTML,
                reply_markup=_proposal_keyboard(proposal_id),
            )
        return

    await _handle_message(update, context, update.message.text)


async def _handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    thinking = await update.message.reply_text("🎨 Pensando…")
    try:
        history = _history[user_id]
        result = await run_agent(text, history)

        if result.kind == "proposal" and result.proposal:
            await thinking.delete()
            await _send_proposal(update, context, result.proposal, chat_id)
            # Reset history after a successful proposal so each post starts fresh
            _history[user_id] = []
        else:
            await thinking.edit_text(result.text or "(sin respuesta)")
            # Persist short history
            _history[user_id].append({"role": "user", "content": text})
            _history[user_id].append({"role": "assistant", "content": result.text})
            # Keep last 10 turns
            _history[user_id] = _history[user_id][-20:]
    except Exception as e:
        logger.exception("agent error")
        await thinking.edit_text(f"❌ Error: {e}")


# ============ Callback (inline buttons) ============

async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    if not _is_allowed(query.from_user.id):
        return

    data = query.data
    action, _, proposal_id_str = data.partition(":")
    proposal_id = int(proposal_id_str)
    proposal = await db.get_proposal(proposal_id)

    if not proposal:
        await query.edit_message_caption(
            caption="⚠️ Propuesta expirada o no encontrada.",
            reply_markup=None,
        )
        return

    if action == "publish":
        await query.edit_message_caption(
            caption=query.message.caption + "\n\n⏳ Publicando en Instagram…",
            parse_mode=ParseMode.HTML,
        )
        try:
            full_caption = f"{proposal['caption']}\n\n{proposal['hashtags']}"
            result = await publish_image(proposal["image_url"], full_caption)
            await db.archive_published(proposal_id, result["media_id"], result["permalink"])
            await query.edit_message_caption(
                caption=(
                    f"✅ <b>Publicado en Instagram</b>\n"
                    f"<b>{proposal['subject']}</b>\n\n"
                    f"🔗 {result['permalink']}"
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=None,
            )
        except InstagramError as e:
            await query.edit_message_caption(
                caption=query.message.caption_html + f"\n\n❌ Error al publicar: {e}",
                parse_mode=ParseMode.HTML,
                reply_markup=_proposal_keyboard(proposal_id),
            )

    elif action == "regen":
        await query.edit_message_caption(
            caption=query.message.caption + "\n\n🔄 Regenerando imagen…",
            parse_mode=ParseMode.HTML,
        )
        try:
            new_img = await regenerate_with_variation(proposal["image_prompt"])
            await db.update_proposal_image(proposal_id, new_img["url"], new_img["prompt"])

            await query.message.delete()
            await context.bot.send_photo(
                chat_id=query.message.chat_id,
                photo=new_img["url"],
                caption=(
                    f"<b>📌 Propuesta #{proposal_id} — {proposal['subject']}</b> (regenerada)\n\n"
                    + _format_caption_preview(proposal["caption"], proposal["hashtags"])
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=_proposal_keyboard(proposal_id),
            )
        except Exception as e:
            logger.exception("regen error")
            await context.bot.send_message(query.message.chat_id, f"❌ Error regenerando: {e}")

    elif action == "editcap":
        _awaiting_caption_edit[query.from_user.id] = proposal_id
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=(
                "✏️ Mandame la nueva caption.\n\n"
                "Para cambiar también los hashtags, usá el formato:\n"
                "<code>caption | hashtags</code>"
            ),
            parse_mode=ParseMode.HTML,
        )

    elif action == "discard":
        await db.delete_proposal(proposal_id)
        await query.edit_message_caption(
            caption=f"🗑 Propuesta #{proposal_id} descartada.",
            reply_markup=None,
        )


# ============ Bootstrap ============

def build_application() -> Application:
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("post", cmd_post))
    app.add_handler(CommandHandler("historial", cmd_historial))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    return app
