/**
 * Telegram notification service for failure alerts
 * 
 * Setup:
 * 1. Create a bot via @BotFather on Telegram → get TELEGRAM_BOT_TOKEN
 * 2. Add the bot to a group or message it directly
 * 3. Get the chat ID → set TELEGRAM_CHAT_ID
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[TELEGRAM] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID, skipping notification");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[TELEGRAM] Failed to send message: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[TELEGRAM] Error sending message:", err);
  }
}

export const TelegramService = {
  /** Generic notification — used by autoscaler and other services */
  notify: async (text: string) => {
    await sendMessage(text);
  },

  notifyVideoFailed: async (opts: {
    videoId: string;
    title?: string;
    errorMessage: string;
    sourceType?: string;
    sourceUrl?: string;
  }) => {
    const lines = [
      `🔴 <b>Video Failed</b>`,
      ``,
      `<b>ID:</b> <code>${opts.videoId}</code>`,
      opts.title ? `<b>Title:</b> ${opts.title}` : null,
      opts.sourceType ? `<b>Source:</b> ${opts.sourceType}` : null,
      opts.sourceUrl ? `<b>URL:</b> ${opts.sourceUrl}` : null,
      `<b>Error:</b> ${opts.errorMessage}`,
    ].filter(Boolean).join("\n");

    await sendMessage(lines);
  },

  notifyClipFailed: async (opts: {
    clipId: string;
    videoId: string;
    errorMessage: string;
    title?: string;
  }) => {
    const lines = [
      `🟠 <b>Clip Failed</b>`,
      ``,
      `<b>Clip ID:</b> <code>${opts.clipId}</code>`,
      `<b>Video ID:</b> <code>${opts.videoId}</code>`,
      opts.title ? `<b>Title:</b> ${opts.title}` : null,
      `<b>Error:</b> ${opts.errorMessage}`,
    ].filter(Boolean).join("\n");

    await sendMessage(lines);
  },
};
