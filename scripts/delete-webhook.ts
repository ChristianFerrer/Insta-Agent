/**
 * Remove the Telegram webhook (useful when switching between dev/prod).
 *
 * Usage:
 *   npx tsx scripts/delete-webhook.ts
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const resp = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`, {
  method: "POST",
});
console.log(await resp.json());
