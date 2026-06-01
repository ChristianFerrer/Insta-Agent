from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_bot_token: str
    telegram_allowed_user_ids: str = ""

    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-6"

    fal_key: str

    ig_access_token: str = ""
    ig_business_account_id: str = ""

    database_path: str = "./data/insta_agent.db"

    proactive_hour: int = 10
    proactive_timezone: str = "America/Argentina/Buenos_Aires"

    log_level: str = "INFO"

    @property
    def allowed_user_ids(self) -> set[int]:
        if not self.telegram_allowed_user_ids:
            return set()
        return {int(x.strip()) for x in self.telegram_allowed_user_ids.split(",") if x.strip()}

    @property
    def db_path(self) -> Path:
        return Path(self.database_path)


settings = Settings()

# Style constants for image generation. These define the visual identity of @bandtoons-style cartoons.
STYLE_PROMPT_BASE = (
    "1930s rubber hose cartoon style, vintage Fleischer/Disney animation aesthetic, "
    "thick bold black outlines, simple flat shapes, expressive cartoon eyes, "
    "muted sepia and warm earth tones color palette, grainy film texture, "
    "minimalist solid color background, hand-drawn vintage poster look, "
    "high contrast, slightly rough linework, retro illustration"
)

NEGATIVE_PROMPT = (
    "photorealistic, modern 3d render, anime, manga, hyperrealistic, "
    "low quality, blurry, distorted faces, extra limbs, watermark, signature, text artifacts"
)

IMAGE_SIZE = "square_hd"  # 1024x1024, ideal for IG feed
