import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const DEVELOPMENT_BASE_PATH = "https://development.plaid.com";
const PRODUCTION_BASE_PATH =
  PlaidEnvironments.production ?? "https://production.plaid.com";
const SANDBOX_BASE_PATH =
  PlaidEnvironments.sandbox ?? "https://sandbox.plaid.com";

export type PlaidEnvironment = "sandbox" | "dev" | "prod";

export type PlaidRuntimeConfig = Readonly<Record<string, string | undefined>>;

interface PlaidEnvironmentConfig {
  basePath: string;
  clientIdKey: string;
  secretKey: string;
}

const PLAID_CONFIG_BY_ENV: Record<PlaidEnvironment, PlaidEnvironmentConfig> = {
  dev: {
    basePath: DEVELOPMENT_BASE_PATH,
    clientIdKey: "PLAID_DEV_CLIENT_ID",
    secretKey: "PLAID_DEV_SECRET",
  },
  prod: {
    basePath: PRODUCTION_BASE_PATH,
    clientIdKey: "PLAID_PROD_CLIENT_ID",
    secretKey: "PLAID_PROD_SECRET",
  },
  sandbox: {
    basePath: SANDBOX_BASE_PATH,
    clientIdKey: "PLAID_SANDBOX_CLIENT_ID",
    secretKey: "PLAID_SANDBOX_SECRET",
  },
};

export class PlaidConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaidConfigurationError";
  }
}

export function createPlaidConfigurationFromRuntimeConfig(
  runtimeConfig: PlaidRuntimeConfig = process.env
): Configuration {
  const environment = runtimeConfig.PLAID_ENV ?? "sandbox";
  if (!isPlaidEnvironment(environment)) {
    throw new PlaidConfigurationError(
      "PLAID_ENV must be one of sandbox, dev, or prod."
    );
  }

  const environmentConfig = PLAID_CONFIG_BY_ENV[environment];
  const clientId = runtimeConfig[environmentConfig.clientIdKey]?.trim();
  const secret = runtimeConfig[environmentConfig.secretKey]?.trim();

  if (!(clientId && secret)) {
    throw new PlaidConfigurationError(
      `Plaid credentials are missing for PLAID_ENV=${environment}.`
    );
  }

  return new Configuration({
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
    basePath: environmentConfig.basePath,
  });
}

export function createPlaidClientFromRuntimeConfig(
  runtimeConfig: PlaidRuntimeConfig = process.env
): PlaidApi {
  return new PlaidApi(createPlaidConfigurationFromRuntimeConfig(runtimeConfig));
}

function isPlaidEnvironment(value: string): value is PlaidEnvironment {
  return value in PLAID_CONFIG_BY_ENV;
}
