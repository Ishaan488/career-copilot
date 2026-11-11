import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import { notifications, notificationDeliveries } from '@/db/schema/infra';
import {
  notify,
  createNotification,
  listNotifications,
  markNotificationAsRead,
  dismissNotification,
} from '@/modules/notification/service';
import { processNotificationOutbox } from '@/modules/notification/outbox';
import { eq } from 'drizzle-orm';

describe('Notification Subsystem & Outbox Engine (Doc 03 FR-NOT-1..3, Doc 08 §80-81)', () => {
  const db = getDb();

  beforeEach(async () => {
    // Clean test notifications
    await db.delete(notificationDeliveries);
    await db.delete(notifications);
  });

  it('creates notification and dispatches to in_app and pending outbox channels', async () => {
    const notifId = await notify({
      type: 'review_request',
      severity: 'warn',
      title: 'Human Review Required',
      body: 'Please review salary expectations for Stripe.',
      link: '/review/123',
      dedupeKey: 'review:req-1',
      channels: ['in_app', 'telegram'],
    });

    expect(notifId).toBeTruthy();

    const deliveries = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notifId!));

    expect(deliveries.length).toBe(2);

    const inAppDelivery = deliveries.find((d) => d.channel === 'in_app');
    expect(inAppDelivery).toBeDefined();
    expect(inAppDelivery?.status).toBe('sent');
    expect(inAppDelivery?.sentAt).toBeTruthy();

    const telegramDelivery = deliveries.find((d) => d.channel === 'telegram');
    expect(telegramDelivery).toBeDefined();
    expect(telegramDelivery?.status).toBe('pending');
    expect(telegramDelivery?.attempts).toBe(0);
  });

  it('deduplicates identical active notifications by dedupe_key', async () => {
    const dedupeKey = 'test:dedupe:unique-key';

    const id1 = await createNotification({
      type: 'high_priority_job',
      severity: 'info',
      title: 'New High Priority Job',
      body: 'Found Software Engineer at Apple',
      dedupeKey,
      channels: ['in_app'],
    });

    const id2 = await createNotification({
      type: 'high_priority_job',
      severity: 'info',
      title: 'New High Priority Job',
      body: 'Found Software Engineer at Apple',
      dedupeKey,
      channels: ['in_app'],
    });

    // Returns existing ID without creating a duplicate row
    expect(id1).toBe(id2);

    const allNotifs = await listNotifications();
    expect(allNotifs.filter((n) => n.dedupeKey === dedupeKey).length).toBe(1);
  });

  it('processes outbox, increments attempts on delivery failure, and isolates channels', async () => {
    // Insert a pending delivery with no credentials configured (will fail safely)
    const notifId = await notify({
      type: 'company_risk',
      severity: 'error',
      title: 'High Risk Alert',
      body: 'Company domain not verified.',
      channels: ['telegram'],
    });

    const summary = await processNotificationOutbox();
    expect(summary.processed).toBeGreaterThanOrEqual(1);

    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notifId!));

    expect(delivery!.attempts).toBe(1);
    expect(delivery!.lastError).toContain('credentials');
    expect(delivery!.status).toBe('pending'); // Still pending retry because attempts < 5
  });

  it('marks delivery as failed after 5 unsuccessful attempts', async () => {
    const notifId = await notify({
      type: 'quota_exhausted',
      severity: 'warn',
      title: 'AI Quota Exhausted',
      body: 'Falling back to degraded mode.',
      channels: ['telegram'],
    });

    // Artificially set attempts to 4
    await db
      .update(notificationDeliveries)
      .set({ attempts: 4 })
      .where(eq(notificationDeliveries.notificationId, notifId!));

    const summary = await processNotificationOutbox();
    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notifId!));

    expect(delivery!.attempts).toBe(5);
    expect(delivery!.status).toBe('failed');
  });

  it('marks notifications as read and dismisses them', async () => {
    const notifId = await notify({
      type: 'submission_verified',
      severity: 'success',
      title: 'Submission Verified',
      body: 'Application verified on Greenhouse.',
      channels: ['in_app'],
    });

    expect(notifId).toBeTruthy();

    await markNotificationAsRead(notifId!);
    const [readNotif] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notifId!));
    expect(readNotif!.readAt).toBeTruthy();

    await dismissNotification(notifId!);
    const [dismissedNotif] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notifId!));
    expect(dismissedNotif!.dismissedAt).toBeTruthy();

    // Dismissed notifications should no longer appear in active list
    const activeNotifs = await listNotifications();
    expect(activeNotifs.some((n) => n.id === notifId)).toBe(false);
  });
});
