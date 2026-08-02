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
  const requestWithContext = getRequest() as RequestWithEvlogContext;
  const { context: requestContext } = requestWithContext;
  const { log } = requestContext;
  const rpcResult = await rpcHandler.handle(request, {
    context: await createContext({ log, req: request }),
    prefix: "/api/rpc",
  });
  if (rpcResult.response) {
    return rpcResult.response;
  }

  const apiResult = await apiHandler.handle(request, {
    context: await createContext({ log, req: request }),
    prefix: "/api/rpc/api-reference",
  });
  if (apiResult.response) {
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
