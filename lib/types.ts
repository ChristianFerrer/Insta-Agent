export type Proposal = {
  subject: string;
  caption: string;
  hashtags: string;
  image_url: string;
  image_prompt: string;
};

export type StoredProposal = Proposal & {
  id: number;
  chat_id: number;
  message_id: number | null;
  created_at: string;
};

export type StoredPost = {
  id: number;
  subject: string;
  caption: string;
  hashtags: string;
  image_url: string;
  source_url: string | null;
  image_prompt: string;
  status: string;
  ig_media_id: string | null;
  ig_permalink: string | null;
  created_at: string;
  published_at: string | null;
  chat_id: number | null;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: unknown; // Anthropic message content (string or array of blocks)
};
