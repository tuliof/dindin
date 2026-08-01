import { describe, expect, it } from "bun:test";

import {
  createLunchflowClientFromRuntimeConfig,
  LunchflowClient,
  LunchflowConfigurationError,
  LunchflowProviderError,
  normalizeLunchflowAccount,
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

  it("normalizes supported account metadata without merging provider accounts", async () => {
    const client = new LunchflowClient({
      apiKey: "synthetic-api-key",
      fetch: async () =>
        Response.json({
          accounts: [
            {
              account_class: "Asset",
              account_type: "Chequing Account",
              currency: "cad",
              id: 101,
              institution_name: "Synthetic Bank",
              name: " Primary Chequing ",
              ownership: "Partner A",
            },
            {
              class: "liability",
              currency: "CAD",
              id: "102",
              institution_name: "Synthetic Bank",
              name: "Rewards Card",
              owner: "joint",
              type: "credit-card",
            },
          ],
          total: 2,
        }),
    });

    await expect(client.listAccounts()).resolves.toEqual([
      {
        accountClass: "asset",
        accountType: "chequing_account",
        currency: "CAD",
        displayName: "Primary Chequing",
        institution: "Synthetic Bank",
        owner: "partner_a",
        providerAccountId: "101",
      },
      {
        accountClass: "liability",
        accountType: "credit_card",
        currency: "CAD",
        displayName: "Rewards Card",
        institution: "Synthetic Bank",
        owner: "joint",
        providerAccountId: "102",
      },
    ]);
  });

  it("represents provider metadata that is unavailable as null", async () => {
    const client = new LunchflowClient({
      apiKey: "synthetic-api-key",
      fetch: async () =>
        Response.json({
          accounts: [
            {
              currency: "CAD",
              id: 103,
              institution_name: "Synthetic Brokerage",
              name: "Investment Account",
              provider: "snaptrade",
              status: "ACTIVE",
            },
          ],
          total: 1,
        }),
    });

    await expect(client.listAccounts()).resolves.toEqual([
      {
        accountClass: null,
        accountType: null,
        currency: "CAD",
        displayName: "Investment Account",
        institution: "Synthetic Brokerage",
        owner: null,
        providerAccountId: "103",
      },
    ]);
  });

  it("normalizes an account record independently", () => {
    expect(
      normalizeLunchflowAccount({
        account_class: "asset",
        account_type: "savings",
        currency: " usd ",
        id: "synthetic-account",
        institution_name: "Synthetic Credit Union",
        name: "  Savings  ",
        ownership: "unsupported owner",
      })
    ).toEqual({
      accountClass: "asset",
      accountType: "savings",
      currency: "USD",
      displayName: "Savings",
      institution: "Synthetic Credit Union",
      owner: null,
      providerAccountId: "synthetic-account",
    });
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
