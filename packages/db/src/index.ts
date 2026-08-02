import { env } from "@dindin/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema/auth";
import { financialAccount } from "./schema/financial-account";
import { plaidAccount, plaidItem } from "./schema/plaid";

const schema = {
  account,
  accountRelations,
  financialAccount,
  plaidAccount,
  plaidItem,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};

export function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
  });

  return drizzle({ client, schema });
}

export const db = createDb();
