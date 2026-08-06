import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const plaidItem = sqliteTable(
  "plaid_item",
  {
    accessToken: text("access_token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    cursor: text("cursor"),
    id: text("id").primaryKey(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    itemErrorCode: text("item_error_code"),
    itemErrorMessage: text("item_error_message"),
    itemId: text("item_id").notNull(),
    lastSyncCompletedAt: integer("last_sync_completed_at", {
      mode: "timestamp_ms",
    }),
    lastSyncError: text("last_sync_error"),
    syncStatus: text("sync_status").default("pending").notNull(),
    transactionLastFailedAt: text("transaction_last_failed_at"),
    transactionLastSuccessfulAt: text("transaction_last_successful_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    webhookCode: text("webhook_code"),
    webhookSentAt: text("webhook_sent_at"),
    webhookUrl: text("webhook_url"),
  },
  (table) => [
    index("plaid_item_user_id_idx").on(table.userId),
    uniqueIndex("plaid_item_item_id_unique").on(table.itemId),
  ]
);

export const plaidAccount = sqliteTable(
  "plaid_account",
  {
    accountId: text("account_id").notNull(),
    balances: text("balances").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    id: text("id").primaryKey(),
    mask: text("mask"),
    name: text("name").notNull(),
    officialName: text("official_name"),
    plaidItemId: text("plaid_item_id")
      .notNull()
      .references(() => plaidItem.id, { onDelete: "cascade" }),
    subtype: text("subtype"),
    type: text("type").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("plaid_account_item_id_idx").on(table.plaidItemId),
    uniqueIndex("plaid_account_item_account_id_unique").on(
      table.plaidItemId,
      table.accountId
    ),
  ]
);

export const plaidSyncRun = sqliteTable(
  "plaid_sync_run",
  {
    action: text("action").notNull(),
    addedCount: integer("added_count").default(0).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    modifiedCount: integer("modified_count").default(0).notNull(),
    pageCount: integer("page_count").default(0).notNull(),
    plaidItemId: text("plaid_item_id")
      .notNull()
      .references(() => plaidItem.id, { onDelete: "cascade" }),
    removedCount: integer("removed_count").default(0).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    status: text("status").notNull(),
    trigger: text("trigger").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("plaid_sync_run_item_id_idx").on(table.plaidItemId),
    index("plaid_sync_run_started_at_idx").on(table.startedAt),
  ]
);

export const plaidTransaction = sqliteTable(
  "plaid_transaction",
  {
    accountId: text("account_id").notNull(),
    amount: real("amount").notNull(),
    authorizedDate: text("authorized_date"),
    category: text("category"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    date: text("date").notNull(),
    id: text("id").primaryKey(),
    isoCurrencyCode: text("iso_currency_code"),
    merchantName: text("merchant_name"),
    name: text("name").notNull(),
    pending: integer("pending", { mode: "boolean" }).notNull(),
    plaidItemId: text("plaid_item_id")
      .notNull()
      .references(() => plaidItem.id, { onDelete: "cascade" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("plaid_transaction_item_id_idx").on(table.plaidItemId),
    index("plaid_transaction_account_id_idx").on(table.accountId),
    index("plaid_transaction_date_idx").on(table.date),
  ]
);
