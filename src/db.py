import aiosqlite
from datetime import datetime, timedelta
from pathlib import Path

from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    ig_media_id TEXT,
    ig_permalink TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    telegram_chat_id INTEGER,
    telegram_message_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_posts_subject ON posts(subject);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE TABLE IF NOT EXISTS pending_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    message_id INTEGER,
    subject TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_prompt TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proactive_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    suggestion TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


async def init_db() -> None:
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.executescript(SCHEMA)
        await conn.commit()


async def recent_subjects(days: int = 30) -> list[str]:
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    async with aiosqlite.connect(settings.db_path) as conn:
        async with conn.execute(
            "SELECT DISTINCT subject FROM posts WHERE created_at >= ? AND status = 'published'",
            (cutoff,),
        ) as cur:
            rows = await cur.fetchall()
    return [r[0] for r in rows]


async def save_proposal(
    chat_id: int,
    subject: str,
    caption: str,
    hashtags: str,
    image_url: str,
    image_prompt: str,
) -> int:
    async with aiosqlite.connect(settings.db_path) as conn:
        cur = await conn.execute(
            """INSERT INTO pending_proposals
               (chat_id, subject, caption, hashtags, image_url, image_prompt)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (chat_id, subject, caption, hashtags, image_url, image_prompt),
        )
        await conn.commit()
        return cur.lastrowid


async def get_proposal(proposal_id: int) -> dict | None:
    async with aiosqlite.connect(settings.db_path) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT * FROM pending_proposals WHERE id = ?", (proposal_id,)
        ) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def update_proposal_image(proposal_id: int, image_url: str, image_prompt: str) -> None:
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.execute(
            "UPDATE pending_proposals SET image_url = ?, image_prompt = ? WHERE id = ?",
            (image_url, image_prompt, proposal_id),
        )
        await conn.commit()


async def update_proposal_caption(proposal_id: int, caption: str, hashtags: str) -> None:
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.execute(
            "UPDATE pending_proposals SET caption = ?, hashtags = ? WHERE id = ?",
            (caption, hashtags, proposal_id),
        )
        await conn.commit()


async def delete_proposal(proposal_id: int) -> None:
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.execute("DELETE FROM pending_proposals WHERE id = ?", (proposal_id,))
        await conn.commit()


async def archive_published(
    proposal_id: int,
    ig_media_id: str,
    ig_permalink: str,
) -> int:
    proposal = await get_proposal(proposal_id)
    if not proposal:
        raise ValueError(f"Proposal {proposal_id} not found")

    async with aiosqlite.connect(settings.db_path) as conn:
        cur = await conn.execute(
            """INSERT INTO posts
               (subject, caption, hashtags, image_url, image_prompt,
                status, ig_media_id, ig_permalink, published_at, telegram_chat_id)
               VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)""",
            (
                proposal["subject"],
                proposal["caption"],
                proposal["hashtags"],
                proposal["image_url"],
                proposal["image_prompt"],
                ig_media_id,
                ig_permalink,
                datetime.utcnow().isoformat(),
                proposal["chat_id"],
            ),
        )
        await conn.execute("DELETE FROM pending_proposals WHERE id = ?", (proposal_id,))
        await conn.commit()
        return cur.lastrowid


async def recent_posts(limit: int = 10) -> list[dict]:
    async with aiosqlite.connect(settings.db_path) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT * FROM posts ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def log_proactive(chat_id: int, suggestion: str) -> None:
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.execute(
            "INSERT INTO proactive_log (chat_id, suggestion) VALUES (?, ?)",
            (chat_id, suggestion),
        )
        await conn.commit()
