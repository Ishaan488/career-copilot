// Notification Outbox Engine (Doc 03 FR-NOT-3, Doc 08 §81, Doc 10 §8)
import { getDb } from '@/shared/db';
import { notifications, notificationDeliveries } from '@/db/schema/infra';
import { eq, and, lt } from 'drizzle-orm';
import { sendTelegramMessage } from './deliverers/telegram';
import { sendSmtpEmail } from './deliverers/email';
import { logger } from '@/shared/logger';

const MAX_DELIVERY_ATTEMPTS = 5;

export interface OutboxProcessSummary {
  processed: number;
  sent: number;
  failed: number;
  pendingRetry: number;
}

/**
 * Processes pending notification deliveries from the outbox.
 * Enforces the invariant: A failed channel delivery never blocks other channels or operations (FR-NOT-3).
 */
export async function processNotificationOutbox(batchSize = 25): Promise<OutboxProcessSummary> {
  const db = getDb();
  const summary: OutboxProcessSummary = {
    processed: 0,
    sent: 0,
    failed: 0,
    pendingRetry: 0,
  };

  const pendingDeliveries = await db
    .select({
      deliveryId: notificationDeliveries.id,
      channel: notificationDeliveries.channel,
      attempts: notificationDeliveries.attempts,
      notificationId: notifications.id,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      severity: notifications.severity,
    })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
    .where(
      and(
        eq(notificationDeliveries.status, 'pending'),
        lt(notificationDeliveries.attempts, MAX_DELIVERY_ATTEMPTS)
      )
    )
    .limit(batchSize);

  for (const item of pendingDeliveries) {
    summary.processed++;
    let result: { success: boolean; error?: string } = { success: false };

    try {
      if (item.channel === 'telegram') {
        result = await sendTelegramMessage(item.title, item.body, item.link);
      } else if (item.channel === 'email') {
        result = await sendSmtpEmail(item.title, item.body, item.link);
      } else if (item.channel === 'in_app') {
        result = { success: true };
      } else {
        result = { success: false, error: `Unsupported notification channel: ${item.channel}` };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result = { success: false, error: errMsg };
    }

    const nextAttempts = item.attempts + 1;

    if (result.success) {
      await db
        .update(notificationDeliveries)
        .set({
          status: 'sent',
          sentAt: new Date(),
          attempts: nextAttempts,
          lastError: null,
        })
        .where(eq(notificationDeliveries.id, item.deliveryId));
      summary.sent++;
    } else {
      const isTerminalFailure = nextAttempts >= MAX_DELIVERY_ATTEMPTS;
      await db
        .update(notificationDeliveries)
        .set({
          status: isTerminalFailure ? 'failed' : 'pending',
          attempts: nextAttempts,
          lastError: result.error || 'Delivery failed',
        })
        .where(eq(notificationDeliveries.id, item.deliveryId));

      if (isTerminalFailure) {
        summary.failed++;
        logger.warn(
          { deliveryId: item.deliveryId, channel: item.channel, attempts: nextAttempts, error: result.error },
          '[NotificationOutbox] Delivery reached maximum attempts and marked failed'
        );
      } else {
        summary.pendingRetry++;
      }
    }
  }

  return summary;
}
