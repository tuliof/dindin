import { describe, expect, it } from "bun:test";

import {
  createPlaidClientFromRuntimeConfig,
  createPlaidConfigurationFromRuntimeConfig,
  PlaidConfigurationError,
} from "./plaid";

describe("Plaid configuration", () => {
  it("configures the sandbox base path and required headers", () => {
    const configuration = createPlaidConfigurationFromRuntimeConfig({
      PLAID_ENV: "sandbox",
      PLAID_SANDBOX_CLIENT_ID: "synthetic-sandbox-client-id",
      PLAID_SANDBOX_SECRET: "synthetic-sandbox-secret",
    });

    expect(configuration.basePath).toBe("https://sandbox.plaid.com");
    expect(configuration.baseOptions.headers).toMatchObject({
      "PLAID-CLIENT-ID": "synthetic-sandbox-client-id",
      "PLAID-SECRET": "synthetic-sandbox-secret",
    });
    expect(
      createPlaidClientFromRuntimeConfig({
        PLAID_ENV: "sandbox",
        PLAID_SANDBOX_CLIENT_ID: "synthetic-sandbox-client-id",
        PLAID_SANDBOX_SECRET: "synthetic-sandbox-secret",
      })
    ).toBeDefined();
  });

  it.each([
    ["dev", "https://development.plaid.com"],
    ["prod", "https://production.plaid.com"],
  ] as const)("selects the %s base path", (environment, basePath) => {
    const configuration = createPlaidConfigurationFromRuntimeConfig({
      PLAID_ENV: environment,
      [`PLAID_${environment === "dev" ? "DEV" : "PROD"}_CLIENT_ID`]:
        "synthetic-client-id",
      [`PLAID_${environment === "dev" ? "DEV" : "PROD"}_SECRET`]:
        "synthetic-secret",
    });

    expect(configuration.basePath).toBe(basePath);
  });

  it("rejects an unsupported environment without including credentials", () => {
    expect(() =>
      createPlaidConfigurationFromRuntimeConfig({
        PLAID_ENV: "invalid",
        PLAID_SANDBOX_SECRET: "synthetic-secret",
      })
    ).toThrow("PLAID_ENV must be one of sandbox, dev, or prod.");
  });

  it("rejects missing selected credentials without exposing their values", () => {
    const error = (() => {
      try {
        createPlaidConfigurationFromRuntimeConfig({
          PLAID_ENV: "sandbox",
          PLAID_SANDBOX_CLIENT_ID: "synthetic-client-id",
        });
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(PlaidConfigurationError);
    expect(error).toHaveProperty(
      "message",
      "Plaid credentials are missing for PLAID_ENV=sandbox."
    );
  });
});
