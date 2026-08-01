import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    LUNCHFLOW_API_KEY: z.string().min(1),
    LUNCHFLOW_API_URL: z.url().default("https://lunchflow.app/api/v1"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PLAID_DEV_CLIENT_ID: z.string().min(1).optional(),
    PLAID_DEV_SECRET: z.string().min(1).optional(),
    PLAID_ENV: z.enum(["sandbox", "dev", "prod"]).default("sandbox"),
    PLAID_PROD_CLIENT_ID: z.string().min(1).optional(),
    PLAID_PROD_SECRET: z.string().min(1).optional(),
    PLAID_SANDBOX_CLIENT_ID: z.string().min(1).optional(),
    PLAID_SANDBOX_SECRET: z.string().min(1).optional(),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
