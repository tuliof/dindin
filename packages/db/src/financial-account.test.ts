import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { user } from "./schema/auth";
import { financialAccount } from "./schema/financial-account";
import { plaidItem, plaidSyncRun } from "./schema/plaid";

const migrationFolder = new URL("./migrations", import.meta.url).pathname;

describe("financial account schema", () => {
  it("applies the migration and defaults household inclusion to false", async () => {
    const client = createClient({ url: "file::memory:" });
    const database = drizzle({ client });

    await migrate(database, { migrationsFolder: migrationFolder });
    await database.insert(financialAccount).values({
      accountClass: "deposit",
      accountType: "chequing",
      currency: "CAD",
      displayName: "Primary chequing",
      id: "financial-account-1",
      institution: "synthetic-bank",
      owner: "partner_a",
      providerAccountId: "provider-account-1",
    });

    const rows = await database.select().from(financialAccount);
    expect(rows[0]?.includedInHousehold).toBe(false);
  });

  it("supports each ownership value and explicit household inclusion", async () => {
    const client = createClient({ url: "file::memory:" });
    const database = drizzle({ client });

    await migrate(database, { migrationsFolder: migrationFolder });
    await database.insert(financialAccount).values([
      {
        accountClass: "deposit",
        accountType: "savings",
        currency: "CAD",
        displayName: "Partner A savings",
        id: "financial-account-a",
        includedInHousehold: true,
        institution: "synthetic-bank",
        owner: "partner_a",
        providerAccountId: "provider-account-a",
      },
      {
        accountClass: "deposit",
        accountType: "savings",
        currency: "CAD",
        displayName: "Partner B savings",
        id: "financial-account-b",
        institution: "synthetic-bank",
        owner: "partner_b",
        providerAccountId: "provider-account-b",
      },
      {
        accountClass: "deposit",
        accountType: "savings",
        currency: "CAD",
        displayName: "Joint savings",
        id: "financial-account-joint",
        institution: "synthetic-bank",
        owner: "joint",
        providerAccountId: "provider-account-joint",
      },
    ]);

    const rows = await database.select().from(financialAccount);
    expect(
      rows.map(({ owner, includedInHousehold }) => ({
        includedInHousehold,
        owner,
      }))
    ).toEqual([
      { includedInHousehold: true, owner: "partner_a" },
      { includedInHousehold: false, owner: "partner_b" },
      { includedInHousehold: false, owner: "joint" },
    ]);
  });

  it("rejects duplicate physical accounts for a provider identity", async () => {
    const client = createClient({ url: "file::memory:" });
    const database = drizzle({ client });

    await migrate(database, { migrationsFolder: migrationFolder });
    const account = {
      accountClass: "deposit",
      accountType: "chequing",
      currency: "CAD",
      displayName: "Primary chequing",
      institution: "synthetic-bank",
      owner: "partner_a" as const,
      providerAccountId: "provider-account-1",
    };

    await database.insert(financialAccount).values({
      ...account,
      id: "financial-account-1",
    });

    await expect(
      database
        .insert(financialAccount)
        .values({
          ...account,
          id: "financial-account-2",
        })
        .execute()
    ).rejects.toThrow();
  });

  it("supports the paginated sync activity projection after migration", async () => {
    const client = createClient({ url: "file::memory:" });
    const database = drizzle({ client });

    await migrate(database, { migrationsFolder: migrationFolder });
    await database.insert(user).values({
      email: "sync-test@example.test",
      id: "sync-test-user",
      name: "Sync Test User",
    });
    await database.insert(plaidItem).values({
      accessToken: "test-access-token",
      id: "sync-test-item",
      institutionName: null,
      itemId: "test-item",
      updatedAt: new Date(),
      userId: "sync-test-user",
    });
    await database.insert(plaidSyncRun).values([
      {
        action: "manual_sync",
        completedAt: null,
        id: "sync-run-1",
        plaidItemId: "sync-test-item",
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
        status: "running",
        trigger: "manual",
        updatedAt: new Date(),
      },
      {
        action: "initial_connection",
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "sync-run-2",
        plaidItemId: "sync-test-item",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        status: "complete",
        trigger: "initial_connection",
        updatedAt: new Date(),
      },
    ]);

    const runs = await database
      .select({
        action: plaidSyncRun.action,
        addedCount: plaidSyncRun.addedCount,
        completedAt: plaidSyncRun.completedAt,
        institutionName: plaidItem.institutionName,
        itemId: plaidItem.itemId,
        modifiedCount: plaidSyncRun.modifiedCount,
        removedCount: plaidSyncRun.removedCount,
        startedAt: plaidSyncRun.startedAt,
        status: plaidSyncRun.status,
        trigger: plaidSyncRun.trigger,
      })
      .from(plaidSyncRun)
      .innerJoin(plaidItem, eq(plaidSyncRun.plaidItemId, plaidItem.id))
      .where(eq(plaidItem.userId, "sync-test-user"))
      .orderBy(desc(plaidSyncRun.startedAt))
      .limit(1)
      .offset(0);

    expect(runs).toEqual([
      {
        action: "manual_sync",
        addedCount: 0,
        completedAt: null,
        institutionName: null,
        itemId: "test-item",
        modifiedCount: 0,
        removedCount: 0,
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
        status: "running",
        trigger: "manual",
      },
    ]);
  });
});
