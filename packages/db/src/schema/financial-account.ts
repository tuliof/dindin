import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const ACCOUNT_OWNERS = ["partner_a", "partner_b", "joint"] as const;

export const financialAccount = sqliteTable(
  "financial_account",
  {
    accountClass: text("account_class").notNull(),
    accountType: text("account_type").notNull(),
    currency: text("currency").notNull(),
    displayName: text("display_name").notNull(),
    id: text("id").primaryKey(),
    includedInHousehold: integer("included_in_household", {
      mode: "boolean",
    })
      .default(false)
      .notNull(),
    institution: text("institution").notNull(),
    owner: text("owner", { enum: ACCOUNT_OWNERS }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
  },
  (table) => [
    uniqueIndex("financial_account_provider_identity_unique").on(
      table.institution,
      table.providerAccountId
    ),
  ]
);
