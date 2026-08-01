import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { financialAccount } from "./schema/financial-account";

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
});
