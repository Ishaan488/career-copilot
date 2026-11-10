import { getDb } from '@/shared/db';
import { notifications, notificationDeliveries } from '@/db/schema/infra';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { NotificationInput } from './schemas';
import { logger } from '@/shared/logger';

export async function createNotification(input: NotificationInput): Promise<string | null> {
  const db = getDb();

  // Deduplication check
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
