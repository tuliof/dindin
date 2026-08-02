import { createContext } from "@dindin/api/context";
import { appRouter } from "@dindin/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type { RequestLogger } from "evlog";

import { publishApplicationEvent } from "@/lib/log-stream";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logRpcError(error);
    }),
  ],
});

const apiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logRpcError(error);
    }),
  ],
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});

type RequestWithEvlogContext = Request & {
  context: { log?: RequestLogger };
};

async function handle({ request }: { request: Request }) {
  const path = new URL(request.url).pathname;
  publishApplicationEvent({
    message: "RPC request received",
    metadata: { endpoint: path, outcome: "started" },
  });
  const requestWithContext = getRequest() as RequestWithEvlogContext;
  const { context: requestContext } = requestWithContext;
  const { log } = requestContext;
  const rpcResult = await rpcHandler.handle(request, {
    context: await createContext({ log, req: request }),
    prefix: "/api/rpc",
  });
  if (rpcResult.response) {
    if (
      rpcResult.response.ok &&
      (path.includes("plaid.syncItem") ||
        path.includes("plaid.exchangePublicToken"))
    ) {
      publishApplicationEvent({
        message: "Sync request completed",
        metadata: { endpoint: path, outcome: "completed" },
      });
    }
    return rpcResult.response;
  }

  const apiResult = await apiHandler.handle(request, {
    context: await createContext({ log, req: request }),
    prefix: "/api/rpc/api-reference",
  });
  if (apiResult.response) {
    if (
      apiResult.response.ok &&
      (path.includes("plaid.syncItem") ||
        path.includes("plaid.exchangePublicToken"))
    ) {
      publishApplicationEvent({
        message: "Sync request completed",
        metadata: { endpoint: path, outcome: "completed" },
      });
    }
    return apiResult.response;
  }

  return new Response("Not found", { status: 404 });
}

function logRpcError(error: unknown) {
  const requestWithContext = getRequest() as RequestWithEvlogContext;
  const { context: requestContext } = requestWithContext;
  const { log } = requestContext;
  const message = error instanceof Error ? error.message : "Unknown oRPC error";
  log?.error(new Error(`oRPC request failed: ${message}`));
}

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      DELETE: handle,
      GET: handle,
      HEAD: handle,
      PATCH: handle,
      POST: handle,
      PUT: handle,
    },
  },
});
