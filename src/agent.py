"""Conversational agent using Claude with tool use.

Handles the conversation in Telegram. When the user requests a post,
the agent uses tools to: (a) generate a physical description of the subject,
(b) trigger image generation, (c) trigger caption generation.

The actual sending of the preview back to Telegram is done by the bot layer —
this module just orchestrates the LLM reasoning and returns a structured result.
"""

import json
import logging
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from .config import settings
from .prompts import SYSTEM_PROMPT
from .tools.image_gen import generate_image
from .tools.caption import generate_caption

logger = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)


TOOLS = [
    {
        "name": "create_post_proposal",
        "description": (
            "Generates a full Instagram post proposal: image + caption + hashtags. "
            "Call this when the user has provided enough info (subject and optionally an occasion). "
            "If you need more info (e.g. should it be the whole band or one member, what occasion), "
            "ask the user in plain text BEFORE calling this tool."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "Name of the musician or band, e.g. 'Freddie Mercury' or 'Black Sabbath'",
                },
                "subject_description": {
                    "type": "string",
                    "description": (
                        "Detailed physical/visual description of the subject for the image generator. "
                        "Include iconic features (hair, clothing, instrument, pose). "
                        "Example: 'Freddie Mercury with iconic mustache, white tank top, holding microphone stand, dynamic stage pose'"
                    ),
                },
                "composition": {
                    "type": "string",
                    "description": "Composition hint: 'centered portrait', 'group of 4 figures', 'medium shot', etc.",
                },
                "context": {
                    "type": "string",
                    "description": "Occasion/context for caption: 'tribute - death anniversary', 'birthday celebration', 'album anniversary', 'general tribute'",
                },
            },
            "required": ["subject", "subject_description", "composition", "context"],
        },
    }
]


@dataclass
class AgentResult:
    kind: str  # "message" or "proposal"
    text: str = ""
    proposal: dict | None = None


async def run_agent(user_message: str, history: list[dict] | None = None) -> AgentResult:
    """Process one user turn. Returns either a text message or a proposal dict.

    `history` is a list of {role, content} dicts representing prior turns of this conversation.
    """
    messages = list(history or [])
    messages.append({"role": "user", "content": user_message})

    # Loop until the agent stops calling tools
    for _ in range(5):
        response = await _client.messages.create(
            model=settings.anthropic_model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason == "tool_use":
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            tool_results = []
            proposal = None

            for block in tool_use_blocks:
                if block.name == "create_post_proposal":
                    args = block.input
                    logger.info("Tool call create_post_proposal: %s", args)

                    img = await generate_image(
                        subject_description=args["subject_description"],
                        composition=args.get("composition", "centered portrait"),
                    )
                    cap = await generate_caption(
                        subject=args["subject"],
                        context=args.get("context", "general tribute"),
                    )

                    proposal = {
                        "subject": args["subject"],
                        "image_url": img["url"],
                        "image_prompt": img["prompt"],
                        "caption": cap["caption"],
                        "hashtags": cap["hashtags"],
                    }
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps({
                            "status": "ok",
                            "subject": args["subject"],
                            "note": "Proposal created and shown to user for approval.",
                        }),
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            if proposal:
                return AgentResult(kind="proposal", proposal=proposal)
            continue

        # No tool use — final text response
        text_parts = [b.text for b in response.content if b.type == "text"]
        return AgentResult(kind="message", text="\n".join(text_parts).strip())

    return AgentResult(kind="message", text="No pude completar la tarea, probá de nuevo.")
