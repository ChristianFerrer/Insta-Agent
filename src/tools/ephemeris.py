import json
import logging
from datetime import datetime
from pathlib import Path

from anthropic import AsyncAnthropic

from ..config import settings
from ..prompts import EPHEMERIS_AGENT_PROMPT

logger = logging.getLogger(__name__)

EPHEMERIS_PATH = Path(__file__).parent.parent.parent / "data" / "ephemeris.json"

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)


def load_ephemeris() -> dict:
    with EPHEMERIS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def events_for_today(today: datetime | None = None) -> list[dict]:
    today = today or datetime.now()
    key = today.strftime("%m-%d")
    data = load_ephemeris()
    return data.get(key, [])


async def pick_suggestion(recent_subjects: list[str]) -> dict | None:
    """Use Claude to pick the best ephemeris suggestion for today, avoiding recent posts."""
    today = datetime.now()
    events = events_for_today(today)
    if not events:
        return None

    events_str = "\n".join(f"- {e['subject']} ({e['type']}): {e['note']}" for e in events)
    recent_str = ", ".join(recent_subjects) if recent_subjects else "ninguno"

    prompt = EPHEMERIS_AGENT_PROMPT.format(
        date=today.strftime("%d %B %Y"),
        events=events_str,
        recent_subjects=recent_str,
    )

    response = await _client.messages.create(
        model=settings.anthropic_model,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    try:
        data = json.loads(text)
        if not data.get("subject"):
            return None
        return data
    except json.JSONDecodeError as e:
        logger.error("Failed to parse ephemeris suggestion: %s | raw: %s", e, text)
        return None
