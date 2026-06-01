import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram.ext import Application

from . import db
from .config import settings
from .tools.ephemeris import pick_suggestion

logger = logging.getLogger(__name__)


async def _proactive_job(app: Application) -> None:
    logger.info("Running proactive ephemeris job")

    recent = await db.recent_subjects(days=30)
    suggestion = await pick_suggestion(recent)
    if not suggestion or not suggestion.get("subject"):
        logger.info("No ephemeris suggestion today")
        return

    text = (
        f"☀️ <b>Sugerencia del día</b>\n\n"
        f"<b>{suggestion['subject']}</b>\n"
        f"<i>{suggestion.get('reason', '')}</i>\n\n"
        f"¿Genero el post? Respondé sí o dame instrucciones específicas."
    )

    for chat_id in settings.allowed_user_ids:
        try:
            await app.bot.send_message(chat_id=chat_id, text=text, parse_mode="HTML")
            await db.log_proactive(chat_id, suggestion["subject"])
        except Exception:
            logger.exception("Failed to send proactive suggestion to %s", chat_id)


def setup_scheduler(app: Application) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=settings.proactive_timezone)
    scheduler.add_job(
        _proactive_job,
        CronTrigger(hour=settings.proactive_hour, minute=0),
        args=[app],
        id="proactive_ephemeris",
        replace_existing=True,
    )
    return scheduler
