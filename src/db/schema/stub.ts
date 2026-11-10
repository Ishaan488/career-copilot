import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const systemSettingsStub = pgTable('system_settings', {
  key: text('key').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
