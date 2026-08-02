import { auth } from "@dindin/auth";
import type { RequestLogger } from "evlog";

export async function createContext({
  log,
  req,
}: {
  log?: RequestLogger;
  req: Request;
}) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    auth: null,
    log,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
