"""Validate environment configuration before running the bot.

Usage:
    python scripts/check_env.py

Reports which capabilities are available based on the credentials present.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def status(label: str, ok: bool, note: str = "") -> None:
    icon = "✅" if ok else "❌"
    line = f"{icon} {label}"
    if note:
        line += f" — {note}"
    print(line)


def main() -> None:
    try:
        from src.config import settings
    except Exception as e:
        print(f"❌ Could not load settings: {e}")
        print("Make sure .env exists (cp .env.example .env) and required vars are set.")
        sys.exit(1)

    print("\n=== Insta-Agent env check ===\n")

    status("Telegram bot token", bool(settings.telegram_bot_token and settings.telegram_bot_token != "your_telegram_bot_token_here"))
    status(
        f"Allowed users ({len(settings.allowed_user_ids)})",
        bool(settings.allowed_user_ids),
        "if empty, everyone can use the bot (NOT recommended)" if not settings.allowed_user_ids else "",
    )
    status("Anthropic API key", bool(settings.anthropic_api_key and settings.anthropic_api_key.startswith("sk-ant-")))
    status("fal.ai key", bool(settings.fal_key and settings.fal_key != "your_fal_key_here"))

    ig_ok = bool(settings.ig_access_token and settings.ig_business_account_id)
    status(
        "Instagram Graph API",
        ig_ok,
        "publishing disabled — proposals will still preview" if not ig_ok else "",
    )

    print("\n=== Capabilities ===")
    print(f"• Image generation:  {'YES' if settings.fal_key else 'NO'}")
    print(f"• Caption generation: {'YES' if settings.anthropic_api_key else 'NO'}")
    print(f"• Telegram bot run:   {'YES' if settings.telegram_bot_token else 'NO'}")
    print(f"• IG publishing:      {'YES' if ig_ok else 'NO (preview-only)'}")
    print()


if __name__ == "__main__":
    main()
