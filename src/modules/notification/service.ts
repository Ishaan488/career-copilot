import { getDb } from '@/shared/db';
import { notifications, notificationDeliveries } from '@/db/schema/infra';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { NotificationInput } from './schemas';
import { processNotificationOutbox, OutboxProcessSummary } from './outbox';
import { logger } from '@/shared/logger';

export interface NotifyParams {
  type: string;
  title: string;
  body: string;
  link?: string | null;
  severity?: 'info' | 'success' | 'warn' | 'error';
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
  channels?: ('in_app' | 'telegram' | 'email')[];
}

/**
 * Public notification dispatcher (Doc 07 §notification, Doc 03 FR-NOT-1, FR-NOT-2)
 */
export async function notify(params: NotifyParams): Promise<string | null> {
  const channels: ('in_app' | 'telegram' | 'email')[] = params.channels && params.channels.length > 0
    ? params.channels
    : ['in_app'];

  // If external channels aren't explicitly passed, auto-detect configured channels
  if (!params.channels) {
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      if (!channels.includes('telegram')) channels.push('telegram');
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      if (!channels.includes('email')) channels.push('email');
    }
  }

  return createNotification({
    type: params.type,
    severity: params.severity || 'info',
    title: params.title,
    body: params.body,
    link: params.link || undefined,
    dedupeKey: params.dedupeKey,
    entityType: params.entityType,
    entityId: params.entityId,
    channels,
  });
}

export async function createNotification(input: NotificationInput): Promise<string | null> {
  const db = getDb();

  // Deduplication check: unique among active un-dismissed notifications
  if (input.dedupeKey) {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.dedupeKey, input.dedupeKey), isNull(notifications.dismissedAt)))
      .limit(1);

    if (existing) {
      logger.debug({ dedupeKey: input.dedupeKey }, '[Notification] Deduplicated notification skipped');
      return existing.id;
    }
  }

  const [notif] = await db
    .insert(notifications)
    .values({
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      link: input.link,
      dedupeKey: input.dedupeKey,
      entityType: input.entityType,
      entityId: input.entityId,
    })
    .returning({ id: notifications.id });

  if (!notif) return null;

  for (const channel of input.channels) {
    await db.insert(notificationDeliveries).values({
      notificationId: notif.id,
      channel,
      status: channel === 'in_app' ? 'sent' : 'pending',
      sentAt: channel === 'in_app' ? new Date() : null,
    });
  }

  return notif.id;
}

export async function listNotifications(limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(isNull(notifications.dismissedAt))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const db = getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}

export async function dismissNotification(id: string): Promise<void> {
  const db = getDb();
  await db.update(notifications).set({ dismissedAt: new Date() }).where(eq(notifications.id, id));
}

export async function deliverPendingNotifications(batchSize = 25): Promise<OutboxProcessSummary> {
  return processNotificationOutbox(batchSize);
}
