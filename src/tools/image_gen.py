import asyncio
import logging
import os

import fal_client

from ..config import settings, STYLE_PROMPT_BASE, NEGATIVE_PROMPT, IMAGE_SIZE
from ..prompts import IMAGE_PROMPT_TEMPLATE

logger = logging.getLogger(__name__)

os.environ["FAL_KEY"] = settings.fal_key


def build_image_prompt(subject_description: str, composition: str = "centered portrait") -> str:
    return IMAGE_PROMPT_TEMPLATE.format(
        style_base=STYLE_PROMPT_BASE,
        subject_description=subject_description,
        composition=composition,
    )


async def generate_image(subject_description: str, composition: str = "centered portrait") -> dict:
    """Generate a cartoon-style image. Returns dict with `url` and `prompt`."""
    prompt = build_image_prompt(subject_description, composition)
    logger.info("Generating image: %s", prompt[:120])

    handler = await fal_client.submit_async(
        "fal-ai/flux/dev",
        arguments={
            "prompt": prompt,
            "image_size": IMAGE_SIZE,
            "num_inference_steps": 28,
            "guidance_scale": 3.5,
            "num_images": 1,
            "enable_safety_checker": True,
        },
    )

    result = await handler.get()
    image_url = result["images"][0]["url"]
    logger.info("Image generated: %s", image_url)
    return {"url": image_url, "prompt": prompt}


async def regenerate_with_variation(previous_prompt: str, variation_hint: str = "") -> dict:
    """Regenerate using same prompt but with new seed; optional variation hint appended."""
    prompt = previous_prompt
    if variation_hint:
        prompt = f"{previous_prompt}, {variation_hint}"

    handler = await fal_client.submit_async(
        "fal-ai/flux/dev",
        arguments={
            "prompt": prompt,
            "image_size": IMAGE_SIZE,
            "num_inference_steps": 28,
            "guidance_scale": 3.5,
            "num_images": 1,
            "enable_safety_checker": True,
        },
    )
    result = await handler.get()
    return {"url": result["images"][0]["url"], "prompt": prompt}
