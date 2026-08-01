import type { ProviderAdapter } from "./index";

const DEFAULT_API_URL = "https://lunchflow.app/api/v1";
const API_KEY_HEADER = "x-api-key";
const TRAILING_SLASH_PATTERN = /\/$/;

export type RuntimeConfig = Record<string, string | undefined>;

export type PhysicalAccountOwner = "partner_a" | "partner_b" | "joint";

export interface LunchflowAccountRecord {
  account_class?: string | null;
  account_type?: string | null;
  class?: string | null;
  currency?: string | null;
  id: string | number;
  institution_name?: string | null;
  name?: string | null;
  owner?: string | null;
  ownership?: string | null;
  type?: string | null;
}

export interface PhysicalAccountMetadata {
  accountClass: string | null;
  accountType: string | null;
  currency: string | null;
  displayName: string | null;
  institution: string | null;
  owner: PhysicalAccountOwner | null;
  providerAccountId: string;
}

export interface LunchflowClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class LunchflowConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LunchflowConfigurationError";
  }
}

export class LunchflowProviderError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, cause?: unknown) {
    super(`Lunchflow request failed with HTTP ${status} for ${path}`, {
      cause,
    });
    this.name = "LunchflowProviderError";
    this.status = status;
    this.path = path;
  }
}

export class LunchflowClient implements ProviderAdapter {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: LunchflowClientOptions) {
    if (!options.apiKey.trim()) {
      throw new LunchflowConfigurationError(
        "LUNCHFLOW_API_KEY is missing. Set it in the server runtime environment."
      );
    }

    const baseUrl = options.baseUrl ?? DEFAULT_API_URL;
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch (error) {
      throw new LunchflowConfigurationError(
        "LUNCHFLOW_API_URL must be a valid absolute URL.",
        { cause: error }
      );
    }

    if (
      parsedBaseUrl.protocol !== "http:" &&
      parsedBaseUrl.protocol !== "https:"
    ) {
      throw new LunchflowConfigurationError(
        "LUNCHFLOW_API_URL must use http or https."
      );
    }

    this.#apiKey = options.apiKey;
    this.#baseUrl = baseUrl.replace(TRAILING_SLASH_PATTERN, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async listAccounts(): Promise<PhysicalAccountMetadata[]> {
    const response = await this.#request("/accounts");

    if (!isAccountListResponse(response)) {
      throw new LunchflowConfigurationError(
        "Lunchflow /accounts response must contain an accounts array."
      );
    }

    return response.accounts.map(normalizeLunchflowAccount);
  }

  getAccountBalance(accountId: string): Promise<unknown> {
    return this.#request(`/accounts/${encodeURIComponent(accountId)}/balance`);
  }

  getAccountTransactions(accountId: string): Promise<unknown> {
    return this.#request(
      `/accounts/${encodeURIComponent(accountId)}/transactions`
    );
  }

  getAccountHoldings(accountId: string): Promise<unknown> {
    return this.#request(`/accounts/${encodeURIComponent(accountId)}/holdings`);
  }

  async #request(path: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      headers: {
        accept: "application/json",
        [API_KEY_HEADER]: this.#apiKey,
      },
    });

    if (!response.ok) {
      throw new LunchflowProviderError(response.status, path);
    }

    return response.json();
  }
}

export function normalizeLunchflowAccount(
  account: LunchflowAccountRecord
): PhysicalAccountMetadata {
  return {
    accountClass: normalizeEnumText(account.account_class ?? account.class),
    accountType: normalizeEnumText(account.account_type ?? account.type),
    currency: normalizeText(account.currency)?.toUpperCase() ?? null,
    displayName: normalizeText(account.name),
    institution: normalizeText(account.institution_name),
    owner: normalizeOwner(account.ownership ?? account.owner),
    providerAccountId: String(account.id),
  };
}

function isAccountListResponse(
  value: unknown
): value is { accounts: LunchflowAccountRecord[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { accounts?: unknown }).accounts)
  );
}

function normalizeText(
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeEnumText(value: string | null | undefined): string | null {
  return (
    normalizeText(value)
      ?.toLowerCase()
      .replace(/[\s-]+/g, "_") ?? null
  );
}

function normalizeOwner(
  value: string | null | undefined
): PhysicalAccountOwner | null {
  const normalized = normalizeEnumText(value);

  if (
    normalized === "partner_a" ||
    normalized === "partner_b" ||
    normalized === "joint"
  ) {
    return normalized;
  }

  return null;
}

export function createLunchflowClientFromRuntimeConfig(
  runtimeConfig: RuntimeConfig = process.env
): LunchflowClient {
  return new LunchflowClient({
    apiKey: runtimeConfig.LUNCHFLOW_API_KEY ?? "",
    baseUrl: runtimeConfig.LUNCHFLOW_API_URL,
  });
}
