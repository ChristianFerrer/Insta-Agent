import { NextResponse } from "next/server";
import { instagramConfigured } from "@/lib/tools/instagram";
import { allowedUserIdsSet, env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    service: "insta-agent",
    capabilities: {
      telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
      anthropic: Boolean(env.ANTHROPIC_API_KEY),
      image_gen: "pollinations (free)",
      supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      instagram: instagramConfigured(),
    },
    allowed_users: allowedUserIdsSet().size,
  });
}
