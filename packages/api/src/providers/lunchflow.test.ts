import { describe, expect, it } from "bun:test";

import {
  createLunchflowClientFromRuntimeConfig,
  LunchflowClient,
  LunchflowConfigurationError,
  LunchflowProviderError,
} from "./lunchflow";

describe("LunchflowClient", () => {
  it("loads credentials and base URL from runtime configuration", async () => {
    let request: Request | undefined;
    const client = createLunchflowClientFromRuntimeConfig({
      LUNCHFLOW_API_KEY: "synthetic-api-key",
      LUNCHFLOW_API_URL: "https://provider.invalid/api/v1",
    });
    const fetcher: typeof fetch = (input, init) => {
      request = new Request(input, init);
      return Promise.resolve(Response.json({ accounts: [] }));
    };
    const configuredClient = new LunchflowClient({
      apiKey: "synthetic-api-key",
      baseUrl: "https://provider.invalid/api/v1",
      fetch: fetcher,
    });

    await configuredClient.listAccounts();

    expect(request?.url).toBe("https://provider.invalid/api/v1/accounts");
    expect(request?.headers.get("x-api-key")).toBe("synthetic-api-key");
    expect(request?.headers.get("authorization")).toBeNull();
    expect(client).toBeInstanceOf(LunchflowClient);
  });

  it("fails with an actionable error when the API key is missing", () => {
    expect(() => createLunchflowClientFromRuntimeConfig({})).toThrow(
      "LUNCHFLOW_API_KEY is missing"
    );
  });

  it("surfaces provider status without including credentials", async () => {
    const client = new LunchflowClient({
      apiKey: "synthetic-api-key",
      fetch: async () => new Response(null, { status: 401 }),
    });

    const error = await client
      .listAccounts()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LunchflowProviderError);
    expect((error as Error).message).toContain("HTTP 401");
    expect((error as Error).message).not.toContain("synthetic-api-key");
  });

  it("rejects an invalid runtime API URL", () => {
    expect(
      () =>
        new LunchflowClient({
          apiKey: "synthetic-api-key",
          baseUrl: "not-a-url",
        })
    ).toThrow(LunchflowConfigurationError);
  });
});
