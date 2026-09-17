import { pgTable, serial, text, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { ModuleReport } from '../pronote/contracts';
export const apiChecks = pgTable('api_checks', {
  id: serial('id').primaryKey(),
  version: text('version').notNull(),
  mode: text('mode').notNull(),
  success: boolean('success').notNull(),
  durationMs: integer('duration_ms').notNull(),
  modules: jsonb('modules').$type<ModuleReport[]>().notNull(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
