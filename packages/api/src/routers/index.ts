import { db } from "@dindin/db";
import {
  plaidAccount,
  plaidItem,
  plaidSyncRun,
  plaidTransaction,
} from "@dindin/db/schema/plaid";
import type { RouterClient } from "@orpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
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
    createUpdateLinkToken: protectedProcedure
      .input(z.object({ itemId: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const item = await db
          .select({ accessToken: plaidItem.accessToken })
          .from(plaidItem)
          .where(
            and(
              eq(plaidItem.itemId, input.itemId),
              eq(plaidItem.userId, context.session.user.id)
            )
          )
          .get();

        if (!item) {
          throw new Error("Plaid connection not found");
        }

        const response =
          await createPlaidClientFromRuntimeConfig().linkTokenCreate({
            access_token: item.accessToken,
            client_name: "dindin sandbox",
            country_codes: [CountryCode.Us],
            language: "en",
            user: { client_user_id: context.session.user.id },
          });

        return { linkToken: response.data.link_token };
      }),
    dashboardSummary: protectedProcedure.handler(async ({ context }) => {
      const items = await db
        .select()
        .from(plaidItem)
        .where(eq(plaidItem.userId, context.session.user.id));
      if (items.length === 0) {
        return {
          accountCount: 0,
          cashFlow: [],
          categories: [],
          currentMonth: { income: 0, spending: 0 },
          lastSyncedAt: null,
          pendingConnections: 0,
          reauthConnections: 0,
          recentTransactions: [],
          totalBalance: 0,
        };
      }

      const itemIds = items.map((item) => item.id);
      const accounts = await db
        .select()
        .from(plaidAccount)
        .where(inArray(plaidAccount.plaidItemId, itemIds));
      const transactions = await db
        .select()
        .from(plaidTransaction)
        .where(inArray(plaidTransaction.plaidItemId, itemIds));
      const accountNames = new Map(
        accounts.map((account) => [account.accountId, account.name])
      );
      const institutionNames = new Map(
        items.map((item) => [
          item.id,
          item.institutionName ?? "Unknown institution",
        ])
      );
      const monthBuckets = createMonthBuckets(6);
      const currentMonth = formatMonthKey(new Date());
      const categoryTotals = new Map<string, number>();
      let currentMonthIncome = 0;
      let currentMonthSpending = 0;

      for (const transaction of transactions) {
        const { amount } = transaction;
        const month = transaction.date.slice(0, 7);
        const bucket = monthBuckets.get(month);
        if (bucket) {
          if (amount >= 0) {
            bucket.spending += amount;
          } else {
            bucket.income += Math.abs(amount);
          }
        }
        if (month === currentMonth) {
          if (amount >= 0) {
            currentMonthSpending += amount;
          } else {
            currentMonthIncome += Math.abs(amount);
          }
        }
        if (amount > 0) {
          const category = parseCategory(transaction.category)[0] ?? "Other";
          categoryTotals.set(
            category,
            (categoryTotals.get(category) ?? 0) + amount
          );
        }
      }

      const totalBalance = accounts.reduce((total, account) => {
        const balances = parseBalances(account.balances);
        return total + getCurrentBalance(balances);
      }, 0);
      const lastSyncedAt = items.reduce<Date | null>((latest, item) => {
        if (!item.lastSyncCompletedAt) {
          return latest;
        }
        return !latest || item.lastSyncCompletedAt > latest
          ? item.lastSyncCompletedAt
          : latest;
      }, null);
      const recentTransactions = [...transactions]
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 8)
        .map((transaction) => ({
          accountName:
            accountNames.get(transaction.accountId) ?? "Unknown account",
          amount: transaction.amount,
          category: parseCategory(transaction.category)[0] ?? "Other",
          date: transaction.date,
          id: transaction.id,
          institutionName:
            institutionNames.get(transaction.plaidItemId) ??
            "Unknown institution",
          merchantName: transaction.merchantName ?? transaction.name,
          pending: transaction.pending,
        }));

      return {
        accountCount: accounts.length,
        cashFlow: [...monthBuckets.values()].map(
          ({ key, label, income, spending }) => ({
            income,
            key,
            label,
            spending,
          })
        ),
        categories: [...categoryTotals.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([name, amount]) => ({ amount, name })),
        currentMonth: {
          income: currentMonthIncome,
          spending: currentMonthSpending,
        },
        lastSyncedAt,
        pendingConnections: items.filter(
          (item) => item.syncStatus === "pending"
        ).length,
        reauthConnections: items.filter(
          (item) => item.syncStatus === "reauth_required"
        ).length,
        recentTransactions,
        totalBalance,
      };
    }),
    exchangePublicToken: publicProcedure
      .input(
        z.object({
          action: z.string().default("initial_connection"),
          publicToken: z.string().min(1),
          trigger: z.string().default("initial_connection"),
        })
      )
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
        const itemId = exchangeResponse.data.item_id;
        const userId = context.session?.user.id;
        let savedConnectionId: string | null = null;
        let syncStatus: "complete" | "pending" | "error" | "reauth_required" =
          "pending";

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
                itemErrorCode: null,
                itemErrorMessage: null,
                lastSyncError: null,
                syncStatus: "pending",
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

          const syncResult = await syncPlaidItem(
            plaidClient,
            connectionId,
            accessToken,
            context.log,
            { action: input.action, trigger: input.trigger }
          );
          syncStatus = syncResult.status;
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
          syncStatus,
          transactions: [],
          transactionsPending: syncStatus === "pending",
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
            itemErrorCode: item.itemErrorCode,
            itemErrorMessage: item.itemErrorMessage,
            itemId: item.itemId,
            lastSyncCompletedAt: item.lastSyncCompletedAt,
            lastSyncError: item.lastSyncError,
            syncStatus: item.syncStatus,
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
        if (items.length === 0) {
          return {
            accounts: [],
            institutions: [],
            page: input.page,
            pageSize: input.pageSize,
            pendingConnections: [],
            total: 0,
            transactions: [],
          };
        }
        const accounts = await db
          .select()
          .from(plaidAccount)
          .where(
            inArray(
              plaidAccount.plaidItemId,
              items.map((item) => item.id)
            )
          );
        const allTransactions = await db
          .select()
          .from(plaidTransaction)
          .where(
            inArray(
              plaidTransaction.plaidItemId,
              items.map((item) => item.id)
            )
          );
        const transactionRows = allTransactions.map((transaction) => {
          const item = items.find(
            (candidate) => candidate.id === transaction.plaidItemId
          );
          const account = accounts.find(
            (candidate) =>
              candidate.plaidItemId === transaction.plaidItemId &&
              candidate.accountId === transaction.accountId
          );
          return {
            ...toTransactionResponse(transaction),
            accountName: account?.name ?? "Unknown account",
            institutionId: item?.institutionId ?? null,
            institutionName: item?.institutionName ?? null,
          };
        });
        const pendingConnections = items
          .filter((item) => item.syncStatus === "pending")
          .map((item) => ({
            institutionId: item.institutionId,
            itemId: item.itemId,
          }));
        const normalizedSearch = input.search?.toLowerCase();
        const filteredTransactions = transactionRows
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
          pendingConnections,
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
      .input(
        z.object({
          action: z.string().default("manual_sync"),
          itemId: z.string().min(1),
          trigger: z.string().default("manual"),
        })
      )
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
    syncActivity: protectedProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(5).max(50).default(10),
        })
      )
      .handler(async ({ context, input }) => {
        const ownedItems = db
          .select({ id: plaidItem.id })
          .from(plaidItem)
          .where(eq(plaidItem.userId, context.session.user.id));
        const itemIds = (await ownedItems).map((item) => item.id);
        if (itemIds.length === 0) {
          return {
            page: input.page,
            pageSize: input.pageSize,
            runs: [],
            total: 0,
          };
        }
        const where = inArray(plaidSyncRun.plaidItemId, itemIds);
        const [{ total }] = await db
          .select({ total: count() })
          .from(plaidSyncRun)
          .where(where);
        const runs = await db
          .select({
            action: plaidSyncRun.action,
            addedCount: plaidSyncRun.addedCount,
            completedAt: plaidSyncRun.completedAt,
            errorCode: plaidSyncRun.errorCode,
            errorMessage: plaidSyncRun.errorMessage,
            id: plaidSyncRun.id,
            institutionName: plaidItem.institutionName,
            itemId: plaidItem.itemId,
            modifiedCount: plaidSyncRun.modifiedCount,
            pageCount: plaidSyncRun.pageCount,
            removedCount: plaidSyncRun.removedCount,
            startedAt: plaidSyncRun.startedAt,
            status: plaidSyncRun.status,
            trigger: plaidSyncRun.trigger,
          })
          .from(plaidSyncRun)
          .innerJoin(plaidItem, eq(plaidSyncRun.plaidItemId, plaidItem.id))
          .where(where)
          .orderBy(desc(plaidSyncRun.startedAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        return { page: input.page, pageSize: input.pageSize, runs, total };
      }),
    syncItem: protectedProcedure
      .input(
        z.object({
          action: z.string().default("manual_sync"),
          itemId: z.string().min(1),
          trigger: z.string().default("manual"),
        })
      )
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
          return { status: "missing" as const };
        }

        return syncPlaidItem(
          createPlaidClientFromRuntimeConfig(),
          item.id,
          item.accessToken,
          context.log,
          { action: input.action, trigger: input.trigger }
        );
      }),
    syncOverview: protectedProcedure.handler(async ({ context }) => {
      const items = await db
        .select()
        .from(plaidItem)
        .where(eq(plaidItem.userId, context.session.user.id));
      const accounts = items.length
        ? await db
            .select({ id: plaidAccount.id })
            .from(plaidAccount)
            .where(
              inArray(
                plaidAccount.plaidItemId,
                items.map((item) => item.id)
              )
            )
        : [];
      const latestRun = await db
        .select({
          completedAt: plaidSyncRun.completedAt,
          startedAt: plaidSyncRun.startedAt,
        })
        .from(plaidSyncRun)
        .innerJoin(plaidItem, eq(plaidSyncRun.plaidItemId, plaidItem.id))
        .where(
          and(
            eq(plaidItem.userId, context.session.user.id),
            eq(plaidSyncRun.status, "complete")
          )
        )
        .orderBy(desc(plaidSyncRun.startedAt))
        .limit(1)
        .get();

      return {
        accountCount: accounts.length,
        connectedInstitutionCount: items.filter(
          (item) => item.syncStatus !== "reauth_required"
        ).length,
        issueCount: items.filter(
          (item) =>
            item.syncStatus === "error" || item.syncStatus === "reauth_required"
        ).length,
        latestSync: latestRun ?? null,
        syncingCount: items.filter((item) => item.syncStatus === "syncing")
          .length,
      };
    }),
  },
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
};

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

async function syncPlaidItem(
  plaidClient: ReturnType<typeof createPlaidClientFromRuntimeConfig>,
  plaidItemId: string,
  accessToken: string,
  log?: RequestLogger,
  context: { action: string; trigger: string } = {
    action: "manual_sync",
    trigger: "manual",
  }
) {
  const item = await db
    .select({ cursor: plaidItem.cursor })
    .from(plaidItem)
    .where(eq(plaidItem.id, plaidItemId))
    .get();
  let cursor = item?.cursor ?? undefined;
  const runId = crypto.randomUUID();
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  let pageCount = 0;

  await db.insert(plaidSyncRun).values({
    action: context.action,
    id: runId,
    plaidItemId,
    startedAt: new Date(),
    status: "running",
    trigger: context.trigger,
    updatedAt: new Date(),
  });

  await db
    .update(plaidItem)
    .set({ lastSyncError: null, syncStatus: "syncing" })
    .where(eq(plaidItem.id, plaidItemId));

  try {
    let hasMore = true;
    while (hasMore) {
      // Sync pages must run sequentially because each request uses the prior cursor.
      // biome-ignore lint/performance/noAwaitInLoops: Plaid cursors require sequential pagination.
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
        count: 500,
      });
      const {
        added,
        modified,
        next_cursor: nextCursor,
        removed,
      } = response.data;
      addedCount += added.length;
      modifiedCount += modified.length;
      removedCount += removed.length;
      pageCount += 1;

      await Promise.all(
        [...added, ...modified].map((transaction) =>
          db
            .insert(plaidTransaction)
            .values({
              accountId: transaction.account_id,
              amount: transaction.amount,
              authorizedDate: transaction.authorized_date,
              category: transaction.category
                ? JSON.stringify(transaction.category)
                : null,
              date: transaction.date,
              id: transaction.transaction_id,
              isoCurrencyCode: transaction.iso_currency_code,
              merchantName: transaction.merchant_name,
              name: transaction.name,
              pending: transaction.pending,
              plaidItemId,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              set: {
                accountId: transaction.account_id,
                amount: transaction.amount,
                authorizedDate: transaction.authorized_date,
                category: transaction.category
                  ? JSON.stringify(transaction.category)
                  : null,
                date: transaction.date,
                isoCurrencyCode: transaction.iso_currency_code,
                merchantName: transaction.merchant_name,
                name: transaction.name,
                pending: transaction.pending,
                plaidItemId,
                updatedAt: new Date(),
              },
              target: plaidTransaction.id,
            })
        )
      );

      if (removed.length > 0) {
        await db.delete(plaidTransaction).where(
          inArray(
            plaidTransaction.id,
            removed.map((transaction) => transaction.transaction_id)
          )
        );
      }

      cursor = nextCursor;
      hasMore = response.data.has_more;
    }

    await db
      .update(plaidItem)
      .set({
        cursor: cursor ?? null,
        itemErrorCode: null,
        itemErrorMessage: null,
        lastSyncCompletedAt: new Date(),
        lastSyncError: null,
        syncStatus: "complete",
      })
      .where(eq(plaidItem.id, plaidItemId));
    await db
      .update(plaidSyncRun)
      .set({
        addedCount,
        completedAt: new Date(),
        modifiedCount,
        pageCount,
        removedCount,
        status: "complete",
        updatedAt: new Date(),
      })
      .where(eq(plaidSyncRun.id, runId));

    return {
      addedCount,
      modifiedCount,
      pageCount,
      removedCount,
      status: "complete" as const,
    };
  } catch (error) {
    const errorCode = getPlaidErrorCode(error);
    let status: "pending" | "error" | "reauth_required" = "error";
    if (errorCode === "PRODUCT_NOT_READY") {
      status = "pending";
    } else if (errorCode === "ITEM_LOGIN_REQUIRED") {
      status = "reauth_required";
    }
    await db
      .update(plaidItem)
      .set({
        itemErrorCode: errorCode,
        itemErrorMessage: getPlaidErrorMessage(error),
        lastSyncError: errorCode ?? "PLAID_SYNC_FAILED",
        syncStatus: status,
      })
      .where(eq(plaidItem.id, plaidItemId));
    await db
      .update(plaidSyncRun)
      .set({
        addedCount,
        completedAt: new Date(),
        errorCode,
        errorMessage: getPlaidErrorMessage(error),
        modifiedCount,
        pageCount,
        removedCount,
        status,
        updatedAt: new Date(),
      })
      .where(eq(plaidSyncRun.id, runId));
    log?.set({ plaid: { errorCode, transactions: status } });
    log?.error(new Error("Plaid transaction sync failed", { cause: error }));
    return { addedCount, modifiedCount, pageCount, removedCount, status } as {
      addedCount: number;
      modifiedCount: number;
      pageCount: number;
      removedCount: number;
      status: "pending" | "error" | "reauth_required";
    };
  }
}

function toTransactionResponse(
  transaction: typeof plaidTransaction.$inferSelect
) {
  return {
    accountId: transaction.accountId,
    amount: transaction.amount,
    category: parseCategory(transaction.category),
    currency: transaction.isoCurrencyCode,
    date: transaction.date,
    merchantName: transaction.merchantName,
    name: transaction.name,
    pending: transaction.pending,
    transactionId: transaction.id,
  };
}

function parseCategory(value: string | null): string[] | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
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

function getPlaidErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const { response } = error as { response?: { data?: unknown } };
  const data = response?.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const message = (data as { error_message?: unknown }).error_message;
  return typeof message === "string" ? message : null;
}

interface MonthBucket {
  income: number;
  key: string;
  label: string;
  spending: number;
}

function createMonthBuckets(monthCount: number): Map<string, MonthBucket> {
  const now = new Date();
  const buckets = new Map<string, MonthBucket>();
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = formatMonthKey(date);
    buckets.set(key, {
      income: 0,
      key,
      label: date.toLocaleDateString("en-US", { month: "short" }),
      spending: 0,
    });
  }
  return buckets;
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentBalance(value: unknown): number {
  if (typeof value !== "object" || value === null) {
    return 0;
  }
  const { current } = value as { current?: unknown };
  return typeof current === "number" ? current : 0;
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
