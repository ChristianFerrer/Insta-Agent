import asyncio
import logging

from src import db
from src.bot import build_application
from src.config import settings
from src.scheduler import setup_scheduler


async def main() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    await db.init_db()

    app = build_application()
    scheduler = setup_scheduler(app)

    async with app:
        await app.start()
        scheduler.start()
        await app.updater.start_polling()
        logging.info("Insta-Agent up and running. Press Ctrl-C to stop.")
        try:
            await asyncio.Event().wait()
        finally:
            scheduler.shutdown(wait=False)
            await app.updater.stop()
            await app.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
