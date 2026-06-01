import asyncio
import logging

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

GRAPH_API = "https://graph.facebook.com/v21.0"


class InstagramError(Exception):
    pass


async def publish_image(image_url: str, caption_with_tags: str) -> dict:
    """Publish a single-image post to Instagram.

    Returns dict with `media_id` and `permalink`.
    Raises InstagramError on failure.
    """
    if not settings.ig_access_token or not settings.ig_business_account_id:
        raise InstagramError("Instagram credentials not configured")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Create media container
        create_resp = await client.post(
            f"{GRAPH_API}/{settings.ig_business_account_id}/media",
            data={
                "image_url": image_url,
                "caption": caption_with_tags,
                "access_token": settings.ig_access_token,
            },
        )
        if create_resp.status_code != 200:
            raise InstagramError(f"create container failed: {create_resp.text}")
        container_id = create_resp.json()["id"]
        logger.info("IG container created: %s", container_id)

        # Step 2: Poll container status until ready (max ~30s)
        for _ in range(15):
            status_resp = await client.get(
                f"{GRAPH_API}/{container_id}",
                params={
                    "fields": "status_code",
                    "access_token": settings.ig_access_token,
                },
            )
            status = status_resp.json().get("status_code")
            if status == "FINISHED":
                break
            if status == "ERROR":
                raise InstagramError(f"container processing error: {status_resp.text}")
            await asyncio.sleep(2)
        else:
            raise InstagramError("container never reached FINISHED status")

        # Step 3: Publish
        publish_resp = await client.post(
            f"{GRAPH_API}/{settings.ig_business_account_id}/media_publish",
            data={
                "creation_id": container_id,
                "access_token": settings.ig_access_token,
            },
        )
        if publish_resp.status_code != 200:
            raise InstagramError(f"publish failed: {publish_resp.text}")
        media_id = publish_resp.json()["id"]

        # Step 4: Get permalink
        perma_resp = await client.get(
            f"{GRAPH_API}/{media_id}",
            params={
                "fields": "permalink",
                "access_token": settings.ig_access_token,
            },
        )
        permalink = perma_resp.json().get("permalink", "")

        logger.info("Published IG media %s: %s", media_id, permalink)
        return {"media_id": media_id, "permalink": permalink}
