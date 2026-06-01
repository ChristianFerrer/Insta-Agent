import json
import logging

from anthropic import AsyncAnthropic

from ..config import settings
from ..prompts import CAPTION_GENERATION_PROMPT

logger = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)


async def generate_caption(subject: str, context: str = "tribute / homage") -> dict:
    """Generate caption + hashtags via Claude. Returns dict with `caption` and `hashtags`."""
    prompt = CAPTION_GENERATION_PROMPT.format(subject=subject, context=context)

    response = await _client.messages.create(
        model=settings.anthropic_model,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    try:
        data = json.loads(text)
        return {
            "caption": data["caption"].strip(),
            "hashtags": data["hashtags"].strip(),
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.error("Failed to parse caption JSON: %s | raw: %s", e, text)
        # Fallback
        return {
            "caption": f"Thank you {subject}.",
            "hashtags": "#bandtoons #cartoon #vintageart #rubberhose #music",
        }
