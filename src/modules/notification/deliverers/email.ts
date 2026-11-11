// SMTP Email Channel Deliverer (Doc 03 FR-NOT-2, Doc 07 §notification)
import nodemailer from 'nodemailer';
import { logger } from '@/shared/logger';

export interface EmailDeliveryResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function sendSmtpEmail(
  title: string,
  body: string,
  link?: string | null
): Promise<EmailDeliveryResult> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'Career Copilot <noreply@career-copilot.local>';
  const to = process.env.SMTP_TO || user;

  if (!host || !user || !pass || !to) {
    logger.debug('[SMTP] SMTP credentials or recipient not configured; skipping delivery');
    return { success: false, error: 'SMTP credentials or recipient not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    let htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">${escapeHtml(title)}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${escapeHtml(body)}</p>
    `;

    if (link) {
      htmlContent += `
        <div style="margin-top: 24px;">
          <a href="${escapeHtml(link)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">View in Career Copilot</a>
        </div>
      `;
    }

    htmlContent += `
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #94a3b8;">Career Copilot &bull; Automated notification</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject: `[Career Copilot] ${title}`,
      text: link ? `${body}\n\nView details: ${link}` : body,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, '[SMTP] Error during email delivery');
    return { success: false, error: errMsg };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
