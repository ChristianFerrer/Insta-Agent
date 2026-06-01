"""Quick smoke test of image generation.

Usage:
    python scripts/test_image_gen.py "Freddie Mercury with iconic mustache, white tank top, holding microphone stand, dynamic stage pose"

Saves the generated image URL to stdout and downloads it to ./test_output/.
Only needs FAL_KEY in .env.
"""
import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.tools.image_gen import generate_image


async def main() -> None:
    description = sys.argv[1] if len(sys.argv) > 1 else (
        "Freddie Mercury with iconic mustache, white tank top, "
        "holding microphone stand, dynamic stage pose"
    )
    composition = sys.argv[2] if len(sys.argv) > 2 else "centered portrait"

    print(f"Generating image for: {description}\nComposition: {composition}\n")
    result = await generate_image(description, composition)
    print("URL:", result["url"])
    print("\nFull prompt used:\n", result["prompt"])

    out_dir = Path("test_output")
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "last_image.png"
    async with httpx.AsyncClient() as client:
        resp = await client.get(result["url"])
        out_path.write_bytes(resp.content)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
