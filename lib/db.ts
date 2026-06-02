import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./config";
import type { ConversationTurn, Proposal, StoredPost, StoredProposal } from "./types";

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _sb;
}

// ---------------- Pending proposals ----------------

export async function saveProposal(chatId: number, p: Proposal): Promise<number> {
  const { data, error } = await sb()
    .from("pending_proposals")
    .insert({
      chat_id: chatId,
      subject: p.subject,
      caption: p.caption,
      hashtags: p.hashtags,
      image_url: p.image_url,
      image_prompt: p.image_prompt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as number;
}

export async function setProposalMessageId(id: number, messageId: number): Promise<void> {
  const { error } = await sb()
    .from("pending_proposals")
    .update({ message_id: messageId })
    .eq("id", id);
  if (error) throw error;
}

export async function getProposal(id: number): Promise<StoredProposal | null> {
  const { data, error } = await sb()
    .from("pending_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredProposal | null) ?? null;
}

export async function updateProposalImage(id: number, imageUrl: string, imagePrompt: string): Promise<void> {
  const { error } = await sb()
    .from("pending_proposals")
    .update({ image_url: imageUrl, image_prompt: imagePrompt })
    .eq("id", id);
  if (error) throw error;
}

export async function updateProposalCaption(id: number, caption: string, hashtags: string): Promise<void> {
  const { error } = await sb()
    .from("pending_proposals")
    .update({ caption, hashtags })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProposal(id: number): Promise<void> {
  const { error } = await sb().from("pending_proposals").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Published posts ----------------

export async function recentSubjects(days = 30): Promise<string[]> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await sb()
    .from("posts")
    .select("subject")
    .gte("created_at", cutoff)
    .eq("status", "published");
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.subject as string)));
}

export async function recentPosts(limit = 10): Promise<StoredPost[]> {
  const { data, error } = await sb()
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StoredPost[];
}

export async function archivePublished(
  proposalId: number,
  archivedImageUrl: string,
  igMediaId: string,
  igPermalink: string,
): Promise<number> {
  const proposal = await getProposal(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const { data, error } = await sb()
    .from("posts")
    .insert({
      subject: proposal.subject,
      caption: proposal.caption,
      hashtags: proposal.hashtags,
      image_url: archivedImageUrl,
      source_url: proposal.image_url,
      image_prompt: proposal.image_prompt,
      status: "published",
      ig_media_id: igMediaId,
      ig_permalink: igPermalink,
      published_at: new Date().toISOString(),
      chat_id: proposal.chat_id,
    })
    .select("id")
    .single();
  if (error) throw error;

  await deleteProposal(proposalId);
  return data.id as number;
}

export async function archivePreviewOnly(
  proposalId: number,
  archivedImageUrl: string,
): Promise<number> {
  const proposal = await getProposal(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const { data, error } = await sb()
    .from("posts")
    .insert({
      subject: proposal.subject,
      caption: proposal.caption,
      hashtags: proposal.hashtags,
      image_url: archivedImageUrl,
      source_url: proposal.image_url,
      image_prompt: proposal.image_prompt,
      status: "approved_no_publish",
      published_at: new Date().toISOString(),
      chat_id: proposal.chat_id,
    })
    .select("id")
    .single();
  if (error) throw error;

  await deleteProposal(proposalId);
  return data.id as number;
}

// ---------------- Conversation state ----------------

const CONVERSATION_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getConversation(userId: number): Promise<ConversationTurn[]> {
  const { data, error } = await sb()
    .from("conversation_state")
    .select("history, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];

  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > CONVERSATION_TTL_MS) {
    await clearConversation(userId);
    return [];
  }
  return (data.history as ConversationTurn[]) ?? [];
}

export async function setConversation(userId: number, history: ConversationTurn[]): Promise<void> {
  const { error } = await sb().from("conversation_state").upsert({
    user_id: userId,
    history: history.slice(-20),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearConversation(userId: number): Promise<void> {
  const { error } = await sb().from("conversation_state").delete().eq("user_id", userId);
  if (error) throw error;
}

// ---------------- Pending caption-edit flag ----------------
// We piggy-back on conversation_state: store a marker in history.
// Simpler: separate column would be cleaner but adds migration cost. For MVP use
// a dedicated row in conversation_state.history with role='_awaiting_edit'.

export async function setAwaitingCaptionEdit(userId: number, proposalId: number): Promise<void> {
  const history = await getConversation(userId);
  const filtered = history.filter((t) => t.role !== ("_awaiting_edit" as unknown as ConversationTurn["role"]));
  filtered.push({ role: "_awaiting_edit" as unknown as ConversationTurn["role"], content: proposalId });
  await setConversation(userId, filtered);
}

export async function popAwaitingCaptionEdit(userId: number): Promise<number | null> {
  const history = await getConversation(userId);
  const marker = history.find((t) => t.role === ("_awaiting_edit" as unknown as ConversationTurn["role"]));
  if (!marker) return null;
  const remaining = history.filter((t) => t.role !== ("_awaiting_edit" as unknown as ConversationTurn["role"]));
  await setConversation(userId, remaining);
  return typeof marker.content === "number" ? marker.content : null;
}

// ---------------- Proactive log ----------------

export async function logProactive(chatId: number, subject: string): Promise<void> {
  const { error } = await sb().from("proactive_log").insert({ chat_id: chatId, subject });
  if (error) throw error;
}

// ---------------- Storage ----------------

export async function archiveImage(sourceUrl: string, subject: string): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`Failed to fetch source image: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const safeSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const path = `${new Date().getFullYear()}/${safeSubject}-${Date.now()}.${ext}`;

  const { error } = await sb().storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw error;

  const { data } = sb().storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
