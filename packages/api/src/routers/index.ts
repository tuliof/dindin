import { db } from "@dindin/db";
import { plaidAccount, plaidItem } from "@dindin/db/schema/plaid";
import type { RouterClient } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { CountryCode, Products } from "plaid";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { createPlaidClientFromRuntimeConfig } from "../providers/plaid";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  plaid: {
    createLinkToken: publicProcedure.handler(async ({ context }) => {
      const plaidClient = createPlaidClientFromRuntimeConfig();
      const response = await plaidClient.linkTokenCreate({
        client_name: "dindin sandbox",
        country_codes: [CountryCode.Us],
        language: "en",
        products: [Products.Transactions],
        user: {
          client_user_id: context.session?.user.id ?? "dindin-sandbox-user",
        },
      });

      return { linkToken: response.data.link_token };
    }),
    exchangePublicToken: publicProcedure
      .input(z.object({ publicToken: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const plaidClient = createPlaidClientFromRuntimeConfig();
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({
          public_token: input.publicToken,
        });
        const accessToken = exchangeResponse.data.access_token;
        const accountsResponse = await plaidClient.accountsGet({
          access_token: accessToken,
        });
        const itemDetails = await getItemDetails(
          plaidClient,
          accessToken,
          context.log
        );
        const institutionId =
          itemDetails?.institutionId ??
          accountsResponse.data.item.institution_id;
        const institutionName = itemDetails?.institutionName ?? null;
        const transactionResult = await getTransactions(
          plaidClient,
          accessToken,
          context.log
        );
        const itemId = exchangeResponse.data.item_id;
        const userId = context.session?.user.id;
        let savedConnectionId: string | null = null;

        if (userId) {
          const existingItem = await db
            .select({ id: plaidItem.id })
            .from(plaidItem)
            .where(eq(plaidItem.itemId, itemId))
            .get();
          const connectionId = existingItem?.id ?? crypto.randomUUID();
          savedConnectionId = connectionId;

          if (existingItem) {
            await db
              .update(plaidItem)
              .set({
                accessToken,
                institutionId,
                institutionName,
                transactionLastFailedAt: itemDetails?.transactionLastFailedAt,
                transactionLastSuccessfulAt:
                  itemDetails?.transactionLastSuccessfulAt,
                updatedAt: new Date(),
                userId,
                webhookCode: itemDetails?.webhookCode,
                webhookSentAt: itemDetails?.webhookSentAt,
                webhookUrl: itemDetails?.webhookUrl,
              })
              .where(eq(plaidItem.id, existingItem.id));
            await db
              .delete(plaidAccount)
              .where(eq(plaidAccount.plaidItemId, existingItem.id));
          } else {
            await db.insert(plaidItem).values({
              accessToken,
              id: connectionId,
              institutionId,
              institutionName,
              itemId,
              transactionLastFailedAt: itemDetails?.transactionLastFailedAt,
              transactionLastSuccessfulAt:
                itemDetails?.transactionLastSuccessfulAt,
              updatedAt: new Date(),
              userId,
              webhookCode: itemDetails?.webhookCode,
              webhookSentAt: itemDetails?.webhookSentAt,
              webhookUrl: itemDetails?.webhookUrl,
            });
          }

          if (accountsResponse.data.accounts.length > 0) {
            await db.insert(plaidAccount).values(
              accountsResponse.data.accounts.map((account) => ({
                accountId: account.account_id,
                balances: JSON.stringify(account.balances),
                id: crypto.randomUUID(),
                mask: account.mask,
                name: account.name,
                officialName: account.official_name,
                plaidItemId: connectionId,
                subtype: account.subtype,
                type: account.type,
                updatedAt: new Date(),
              }))
            );
          }
        }

        return {
          accounts: accountsResponse.data.accounts.map((account) => ({
            accountId: account.account_id,
            balances: account.balances,
            mask: account.mask,
            name: account.name,
            officialName: account.official_name,
            subtype: account.subtype,
            type: account.type,
          })),
          institution: institutionId,
          institutionName,
          itemId,
          itemStatus: itemDetails,
          savedConnectionId,
          transactions: transactionResult.transactions,
          transactionsPending: transactionResult.pending,
        };
      }),
    listConnections: protectedProcedure.handler(async ({ context }) => {
      const items = await db
        .select()
        .from(plaidItem)
        .where(eq(plaidItem.userId, context.session.user.id));
      const accounts = await db.select().from(plaidAccount);

      return Promise.all(
        items.map(async (item) => {
          const itemDetails = await getItemDetails(
            createPlaidClientFromRuntimeConfig(),
            item.accessToken,
            context.log
          );
          if (itemDetails) {
            await db
              .update(plaidItem)
              .set(itemDetails)
              .where(eq(plaidItem.id, item.id));
          }

          return {
            accounts: accounts
              .filter((account) => account.plaidItemId === item.id)
              .map((account) => ({
                accountId: account.accountId,
                balances: parseBalances(account.balances, context.log),
                mask: account.mask,
                name: account.name,
                officialName: account.officialName,
                subtype: account.subtype,
                type: account.type,
              })),
            institutionId: item.institutionId,
            institutionName:
              itemDetails?.institutionName ?? item.institutionName,
            itemId: item.itemId,
            savedAt: item.updatedAt,
            transactionLastFailedAt:
              itemDetails?.transactionLastFailedAt ??
              item.transactionLastFailedAt,
            transactionLastSuccessfulAt:
              itemDetails?.transactionLastSuccessfulAt ??
              item.transactionLastSuccessfulAt,
            webhookCode: itemDetails?.webhookCode ?? item.webhookCode,
            webhookSentAt: itemDetails?.webhookSentAt ?? item.webhookSentAt,
            webhookUrl: itemDetails?.webhookUrl ?? item.webhookUrl,
          };
        })
      );
    }),
    listTransactions: protectedProcedure
      .input(
        z.object({
          accountIds: z.array(z.string()).default([]),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          institutionIds: z.array(z.string()).default([]),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(10).max(100).default(25),
          search: z.string().trim().optional(),
          sort: z
            .enum(["date_desc", "date_asc", "amount_desc", "amount_asc"])
            .default("date_desc"),
          statuses: z.array(z.enum(["pending", "posted"])).default([]),
        })
      )
      .handler(async ({ context, input }) => {
        const items = await db
          .select()
          .from(plaidItem)
          .where(eq(plaidItem.userId, context.session.user.id));
        const accounts = await db.select().from(plaidAccount);
        const results = await Promise.all(
          items.map(async (item) => {
            const result = await getTransactions(
              createPlaidClientFromRuntimeConfig(),
              item.accessToken,
              context.log
            );
            return {
              institutionId: item.institutionId,
              institutionName: item.institutionName,
              itemId: item.itemId,
              pending: result.pending,
              transactions: result.transactions.map((transaction) => ({
                accountId: transaction.account_id,
                accountName:
                  accounts.find(
                    (account) =>
                      account.plaidItemId === item.id &&
                      account.accountId === transaction.account_id
                  )?.name ?? "Unknown account",
                amount: transaction.amount,
                category: transaction.category,
                currency: transaction.iso_currency_code,
                date: transaction.date,
                merchantName: transaction.merchant_name,
                name: transaction.name,
                pending: transaction.pending,
                transactionId: transaction.transaction_id,
              })),
            };
          })
        );

        const allTransactions = results.flatMap((result) =>
          result.transactions.map((transaction) => ({
            ...transaction,
            institutionId: result.institutionId,
            institutionName: result.institutionName,
          }))
        );
        const normalizedSearch = input.search?.toLowerCase();
        const filteredTransactions = allTransactions
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Server-side transaction filters intentionally share one predicate.
          .filter((transaction) => {
            if (
              input.institutionIds.length > 0 &&
              !input.institutionIds.includes(transaction.institutionId ?? "")
            ) {
              return false;
            }
            if (
              input.accountIds.length > 0 &&
              !input.accountIds.includes(transaction.accountId)
            ) {
              return false;
            }
            if (input.dateFrom && transaction.date < input.dateFrom) {
              return false;
            }
            if (input.dateTo && transaction.date > input.dateTo) {
              return false;
            }
            if (
              input.statuses.length > 0 &&
              !input.statuses.includes(
                transaction.pending ? "pending" : "posted"
              )
            ) {
              return false;
            }
            if (normalizedSearch) {
              const searchableText = [
                transaction.accountName,
                transaction.category?.join(" "),
                transaction.institutionName,
                transaction.merchantName,
                transaction.name,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              if (!searchableText.includes(normalizedSearch)) {
                return false;
              }
            }
            return true;
          })
          .sort((left, right) => {
            if (input.sort.startsWith("amount")) {
              return input.sort === "amount_desc"
                ? right.amount - left.amount
                : left.amount - right.amount;
            }
            return input.sort === "date_desc"
              ? right.date.localeCompare(left.date)
              : left.date.localeCompare(right.date);
          });
        const start = (input.page - 1) * input.pageSize;

        return {
          accounts: accounts.map((account) => ({
            accountId: account.accountId,
            accountName: account.name,
            institutionId: items.find((item) => item.id === account.plaidItemId)
              ?.institutionId,
          })),
          institutions: items.map((item) => ({
            id: item.institutionId,
            name: item.institutionName,
          })),
          page: input.page,
          pageSize: input.pageSize,
          pendingConnections: results
            .filter((result) => result.pending)
            .map(({ institutionId, itemId }) => ({ institutionId, itemId })),
          total: filteredTransactions.length,
          transactions: filteredTransactions.slice(
            start,
            start + input.pageSize
          ),
        };
      }),
    removeAccount: protectedProcedure
      .input(z.object({ accountId: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const account = await db
          .select({ id: plaidAccount.id })
          .from(plaidAccount)
          .innerJoin(plaidItem, eq(plaidAccount.plaidItemId, plaidItem.id))
          .where(
            and(
              eq(plaidAccount.accountId, input.accountId),
              eq(plaidItem.userId, context.session.user.id)
            )
          )
          .get();

        if (account) {
          await db.delete(plaidAccount).where(eq(plaidAccount.id, account.id));
        }

        return { removed: Boolean(account) };
      }),
    removeConnection: protectedProcedure
      .input(z.object({ itemId: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const item = await db
          .select()
          .from(plaidItem)
          .where(
            and(
              eq(plaidItem.itemId, input.itemId),
              eq(plaidItem.userId, context.session.user.id)
            )
          )
          .get();

        if (!item) {
          return { removed: false };
        }

        try {
          await createPlaidClientFromRuntimeConfig().itemRemove({
            access_token: item.accessToken,
          });
        } catch {
          context.log?.error(new Error("Plaid Item removal failed"));
        }

        await db.delete(plaidItem).where(eq(plaidItem.id, item.id));
        return { removed: true };
      }),
  },
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
};

function formatPlaidDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function twoYearsAgo(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);
  return date;
}

async function getItemDetails(
  plaidClient: ReturnType<typeof createPlaidClientFromRuntimeConfig>,
  accessToken: string,
  log?: RequestLogger
): Promise<PlaidItemDetails | null> {
  try {
    const response = await plaidClient.itemGet({
      access_token: accessToken,
    });
    const transactionsStatus = response.data.status?.transactions;
    const lastWebhook = response.data.status?.last_webhook;

    return {
      institutionId: response.data.item.institution_id,
      institutionName: response.data.item.institution_name,
      transactionLastFailedAt: transactionsStatus?.last_failed_update ?? null,
      transactionLastSuccessfulAt:
        transactionsStatus?.last_successful_update ?? null,
      webhookCode: lastWebhook?.code_sent ?? null,
      webhookSentAt: lastWebhook?.sent_at ?? null,
      webhookUrl: response.data.item.webhook ?? null,
    };
  } catch {
    log?.error(new Error("Plaid Item metadata lookup failed"));
    return null;
  }
}

interface PlaidItemDetails {
  institutionId: string | null;
  institutionName: string | null;
  transactionLastFailedAt: string | null;
  transactionLastSuccessfulAt: string | null;
  webhookCode: string | null;
  webhookSentAt: string | null;
  webhookUrl: string | null;
}

async function getTransactions(
  plaidClient: ReturnType<typeof createPlaidClientFromRuntimeConfig>,
  accessToken: string,
  log?: RequestLogger
) {
  try {
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      end_date: formatPlaidDate(new Date()),
      start_date: formatPlaidDate(twoYearsAgo()),
    });
    return { pending: false, transactions: response.data.transactions };
  } catch (error) {
    if (getPlaidErrorCode(error) === "PRODUCT_NOT_READY") {
      log?.set({ plaid: { transactions: "pending" } });
      return { pending: true, transactions: [] };
    }

    log?.error(new Error("Plaid transactions request failed"));
    throw error;
  }
}

function getPlaidErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const { response } = error as { response?: { data?: unknown } };
  const data = response?.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const code = (data as { error_code?: unknown }).error_code;
  return typeof code === "string" ? code : null;
}

function parseBalances(value: string, log?: RequestLogger): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    log?.error(
      new Error("Failed to parse persisted Plaid account balances", {
        cause: error,
      })
    );
    return null;
  }
}
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
