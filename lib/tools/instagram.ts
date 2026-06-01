import { env } from "../config";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export class InstagramError extends Error {}

export function instagramConfigured(): boolean {
  return Boolean(env.IG_ACCESS_TOKEN && env.IG_BUSINESS_ACCOUNT_ID);
}

export async function publishImage(
  imageUrl: string,
  captionWithHashtags: string,
): Promise<{ mediaId: string; permalink: string }> {
  if (!instagramConfigured()) {
    throw new InstagramError("Instagram credentials not configured");
  }

  // 1. Create container
  const createResp = await fetch(`${GRAPH_API}/${env.IG_BUSINESS_ACCOUNT_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption: captionWithHashtags,
      access_token: env.IG_ACCESS_TOKEN,
    }),
  });
  if (!createResp.ok) throw new InstagramError(`create failed: ${await createResp.text()}`);
  const { id: containerId } = (await createResp.json()) as { id: string };

  // 2. Poll status
  for (let i = 0; i < 15; i++) {
    const sResp = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${env.IG_ACCESS_TOKEN}`,
    );
    const sBody = (await sResp.json()) as { status_code?: string };
    if (sBody.status_code === "FINISHED") break;
    if (sBody.status_code === "ERROR") {
      throw new InstagramError(`container processing error: ${JSON.stringify(sBody)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 3. Publish
  const pubResp = await fetch(`${GRAPH_API}/${env.IG_BUSINESS_ACCOUNT_ID}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: env.IG_ACCESS_TOKEN,
    }),
  });
  if (!pubResp.ok) throw new InstagramError(`publish failed: ${await pubResp.text()}`);
  const { id: mediaId } = (await pubResp.json()) as { id: string };

  // 4. Permalink
  const linkResp = await fetch(
    `${GRAPH_API}/${mediaId}?fields=permalink&access_token=${env.IG_ACCESS_TOKEN}`,
  );
  const linkBody = (await linkResp.json()) as { permalink?: string };
  return { mediaId, permalink: linkBody.permalink ?? "" };
}
