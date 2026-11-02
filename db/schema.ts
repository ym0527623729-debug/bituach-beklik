// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const agencies = sqliteTable('agencies', { id: text('id').primaryKey(), owner: text('owner').notNull().unique(), name: text('name').notNull() });
export const members = sqliteTable('members', { id: text('id').primaryKey(), agency: text('agency').notNull().references(()=>agencies.id), email: text('email').notNull(), userId: text('user_id'), name: text('name').notNull(), role: text('role').notNull(), active: integer('active').notNull().default(1), assignedOnly: integer('assigned_only').notNull().default(0), permissions: text('permissions').notNull().default('{}') }, t=>[uniqueIndex('agency_email').on(t.agency,t.email)]);
export const records = sqliteTable('records', { id: text('id').primaryKey(), agency: text('agency').notNull().references(()=>agencies.id), module: text('module').notNull(), clientId: text('client_id'), data: text('data').notNull(), updated: text('updated').notNull() });
export const audit = sqliteTable('audit', { id: text('id').primaryKey(), agency: text('agency').notNull().references(()=>agencies.id), actor: text('actor').notNull(), action: text('action').notNull(), recordId: text('record_id').notNull(), at: text('at').notNull() });
