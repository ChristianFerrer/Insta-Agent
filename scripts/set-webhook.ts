/**
 * Register the Telegram webhook to point at your deployed Vercel URL.
 *
 * Usage:
 *   WEBHOOK_BASE_URL=https://<your-app>.vercel.app npx tsx scripts/set-webhook.ts
 *
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in env (or .env.local).
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = process.env.WEBHOOK_BASE_URL;

if (!token || !secret || !base) {
  console.error("Missing env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_BASE_URL");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram`;

const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});
const body = await resp.json();
console.log("setWebhook response:", body);

// Also set bot commands for the menu
await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    commands: [
      { command: "post", description: "Generar propuesta de post" },
      { command: "historial", description: "Últimos posts" },
      { command: "help", description: "Ayuda" },
    ],
  }),
});

console.log(`\n✅ Webhook set to ${url}`);
