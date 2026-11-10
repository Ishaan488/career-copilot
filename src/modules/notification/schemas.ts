import { z } from 'zod';

export const notificationInputSchema = z.object({
  type: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().optional(),
  severity: z.enum(['info', 'success', 'warn', 'error']).default('info'),
  dedupeKey: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  channels: z.array(z.enum(['in_app', 'telegram', 'email'])).default(['in_app']),
});

export type NotificationInput = z.infer<typeof notificationInputSchema>;
