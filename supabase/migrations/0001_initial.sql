-- Insta-Agent initial schema
-- Run this in the Supabase SQL editor or via `supabase db push`.

create table if not exists posts (
  id            bigserial primary key,
  subject       text not null,
  caption       text not null,
  hashtags      text not null,
  image_url     text not null,             -- archived Supabase Storage URL
  source_url    text,                      -- original fal.ai URL (may expire)
  image_prompt  text not null,
  status        text not null default 'published',
  ig_media_id   text,
  ig_permalink  text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  chat_id       bigint
);

create index if not exists idx_posts_subject     on posts (lower(subject));
create index if not exists idx_posts_created_at  on posts (created_at desc);
create index if not exists idx_posts_status      on posts (status);

create table if not exists pending_proposals (
  id            bigserial primary key,
  chat_id       bigint not null,
  message_id    bigint,
  subject       text not null,
  caption       text not null,
  hashtags      text not null,
  image_url     text not null,
  image_prompt  text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pending_chat on pending_proposals (chat_id);

-- Short-lived conversation state per Telegram user (used between turns)
create table if not exists conversation_state (
  user_id       bigint primary key,
  history       jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists proactive_log (
  id          bigserial primary key,
  chat_id     bigint not null,
  subject     text not null,
  sent_at     timestamptz not null default now()
);

-- Auto-cleanup of stale conversation state (older than 1 hour)
-- Run periodically via pg_cron if available; otherwise the webhook prunes on read.
