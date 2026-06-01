"""Quick test of caption + hashtag generation.

Usage:
    python scripts/test_caption.py "Freddie Mercury" "tribute - death anniversary"

Only needs ANTHROPIC_API_KEY in .env.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.tools.caption import generate_caption


async def main() -> None:
    subject = sys.argv[1] if len(sys.argv) > 1 else "Freddie Mercury"
    context = sys.argv[2] if len(sys.argv) > 2 else "tribute - death anniversary"

    print(f"Subject: {subject}\nContext: {context}\n")
    result = await generate_caption(subject, context)
    print("Caption:\n", result["caption"])
    print("\nHashtags:\n", result["hashtags"])


if __name__ == "__main__":
    asyncio.run(main())
