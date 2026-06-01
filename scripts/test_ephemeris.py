"""Test ephemeris lookup and Claude-powered suggestion picking.

Usage:
    python scripts/test_ephemeris.py            # Use today's date
    python scripts/test_ephemeris.py 11-24      # Force a specific MM-DD

Needs ANTHROPIC_API_KEY in .env.
"""
import asyncio
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.tools import ephemeris


async def main() -> None:
    if len(sys.argv) > 1:
        mm, dd = sys.argv[1].split("-")
        forced = datetime.now().replace(month=int(mm), day=int(dd))
    else:
        forced = None

    today = forced or datetime.now()
    events = ephemeris.events_for_today(today)
    print(f"Date: {today.strftime('%Y-%m-%d')}")
    print(f"Raw events: {events}\n")

    if not events:
        print("No events for this date.")
        return

    # Monkey-patch the date for pick_suggestion if needed
    if forced:
        import src.tools.ephemeris as eph
        original = eph.events_for_today
        eph.events_for_today = lambda t=None: events
        try:
            suggestion = await ephemeris.pick_suggestion(recent_subjects=[])
        finally:
            eph.events_for_today = original
    else:
        suggestion = await ephemeris.pick_suggestion(recent_subjects=[])

    print("Claude suggestion:", suggestion)


if __name__ == "__main__":
    asyncio.run(main())
