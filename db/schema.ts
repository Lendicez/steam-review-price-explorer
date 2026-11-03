import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const cache=sqliteTable('cache',{key:text('key').primaryKey(),value:text('value'),expires:integer('expires').notNull(),retainUntil:integer('retain_until').notNull(),leaseUntil:integer('lease_until').notNull().default(0),owner:text('owner')},t=>[index('cache_retention').on(t.retainUntil)]);
export const budgets=sqliteTable('budgets',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()},t=>[index('budget_expiry').on(t.expires)]);
export const slots=sqliteTable('slots',{key:text('key').primaryKey(),expires:integer('expires').notNull(),owner:text('owner')});
