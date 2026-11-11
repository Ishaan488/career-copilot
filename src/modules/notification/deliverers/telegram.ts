// Telegram Channel Deliverer (Doc 03 FR-NOT-2, Doc 07 §notification)
import { logger } from '@/shared/logger';

export interface TelegramDeliveryResult {
  success: boolean;
  error?: string;
  messageId?: number;
}

export async function sendTelegramMessage(
  title: string,
  body: string,
  link?: string | null
): Promise<TelegramDeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.debug('[Telegram] Token or Chat ID not configured; skipping delivery');
    return { success: false, error: 'Telegram credentials not configured' };
  }

  // Format message with basic HTML
  let formattedText = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
  if (link) {
    formattedText += `\n\n<a href="${escapeHtml(link)}">View Details</a>`;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedText,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      const errMsg = data.description || `HTTP ${response.status}: Failed to dispatch Telegram message`;
      logger.warn({ error: errMsg }, '[Telegram] Delivery failed');
      return { success: false, error: errMsg };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, '[Telegram] Network error during delivery');
    return { success: false, error: errMsg };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
