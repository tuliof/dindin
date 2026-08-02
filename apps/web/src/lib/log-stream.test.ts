import { describe, expect, it } from "bun:test";

import { handleAuthBoundaryRequest } from "./auth-boundary";
import {
  getLogStream,
  publishApplicationEvent,
  toLogEntry,
} from "./log-stream";

describe("application log stream", () => {
  it("publishes a sanitized failed login event from the auth boundary", async () => {
    const stream = getLogStream();
    const iterator = stream.events();
    const request = new Request("https://example.test/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "private@example.test",
        password: "not-a-real-password",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await handleAuthBoundaryRequest(
      request,
      async () => new Response(null, { status: 401 })
    );
    const result = await iterator.next();
    await iterator.return?.();
    const entry = toLogEntry(result.value);

    expect(response.status).toBe(401);
    expect(entry.level).toBe("warn");
    expect(entry.message).toBe("Authentication login failed");
    expect(entry.metadata).toEqual({
      action: "login",
      endpoint: "/api/auth/sign-in/email",
      errorClass: "unauthorized",
      identifierSupplied: true,
      outcome: "failed",
      status: 401,
    });
    expect(JSON.stringify(entry)).not.toContain("private@example.test");
    expect(JSON.stringify(entry)).not.toContain("not-a-real-password");
  });

  it("publishes to the shared stream and sanitizes sensitive metadata", async () => {
    const stream = getLogStream();
    const iterator = stream.events();

    publishApplicationEvent({
      message: "Sync request completed",
      metadata: {
        accountId: "should-not-appear",
        endpoint: "/api/rpc/plaid.syncItem",
        outcome: "completed",
      },
    });

    const result = await iterator.next();
    await iterator.return?.();
    const entry = toLogEntry(result.value);

    expect(entry.message).toBe("Sync request completed");
    expect(entry.metadata).toEqual({
      endpoint: "/api/rpc/plaid.syncItem",
      outcome: "completed",
    });
  });

  it("keeps failed AI events free of request and provider data", async () => {
    const stream = getLogStream();
    const iterator = stream.events();

    publishApplicationEvent({
      level: "error",
      message: "AI request failed",
      metadata: {
        endpoint: "/api/ai",
        error: "Error",
        outcome: "failed",
        providerPayload: "secret",
        requestBody: "prompt",
      },
    });

    const result = await iterator.next();
    await iterator.return?.();
    const entry = toLogEntry(result.value);

    expect(entry.level).toBe("error");
    expect(entry.metadata).toEqual({
      endpoint: "/api/ai",
      error: "Error",
      outcome: "failed",
    });
  });
});
