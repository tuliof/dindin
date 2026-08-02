/* biome-ignore-all lint/performance/noJsxPropsBind: URL filter controls intentionally bind navigation handlers. */

import { Button } from "@dindin/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@dindin/ui/components/combobox";
import { Input } from "@dindin/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dindin/ui/components/select";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { FinanceShell } from "@/components/finance-shell";
import {
  type TransactionRow,
  TransactionsDataTable,
} from "@/components/transactions-data-table";
import { orpc } from "@/utils/orpc";

const transactionSearchSchema = z.object({
  accountIds: z.array(z.string()).catch([]),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  institutionIds: z.array(z.string()).catch([]),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25),
  search: z.string().optional(),
  sort: z
    .enum(["date_desc", "date_asc", "amount_desc", "amount_asc"])
    .catch("date_desc"),
  statuses: z.array(z.enum(["pending", "posted"])).catch([]),
});

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsPage,
  validateSearch: transactionSearchSchema,
});

function TransactionsPage() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const transactionsQuery = useQuery(
    orpc.plaid.listTransactions.queryOptions({
      input: search,
      placeholderData: keepPreviousData,
    })
  );
  const { data } = transactionsQuery;
  const transactions = (data?.transactions ?? []) as TransactionRow[];
  const pendingConnections = data?.pendingConnections ?? [];

  const updateSearch = (patch: Partial<typeof search>) => {
    navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        ...patch,
        page: patch.page ?? 1,
      }),
    });
  };
  const clearFilters = () =>
    navigate({
      replace: true,
      search: {
        accountIds: [],
        institutionIds: [],
        page: 1,
        pageSize: search.pageSize,
        sort: "date_desc",
        statuses: [],
      },
    });
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / search.pageSize)
  );

  return (
    <FinanceShell
      user={{
        email: session.user.email,
        name: session.user.name,
      }}
    >
      {() => (
        <main className="overflow-auto px-4 py-8 sm:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
            <header>
              <p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
                Activity
              </p>
              <h1 className="font-semibold text-3xl tracking-tight">
                Transactions
              </h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Search, filter, and review transactions from your connected
                institutions.
              </p>
            </header>

            {pendingConnections.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Transaction history is syncing</CardTitle>
                  <CardDescription>
                    Plaid has connected the institution, but its Transactions
                    product is not ready yet. Check this page again shortly.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {transactionsQuery.error ? (
              <Card>
                <CardContent className="py-12 text-center text-destructive">
                  {transactionsQuery.error.message}
                </CardContent>
              </Card>
            ) : null}

            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 rounded-lg border p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(10rem,auto)]">
                  <div className="flex flex-col gap-2 text-muted-foreground text-xs">
                    <span>Search transactions</span>
                    <Input
                      onChange={(event) =>
                        updateSearch({
                          search: event.target.value || undefined,
                        })
                      }
                      placeholder="Merchant, account, category…"
                      value={search.search ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-muted-foreground text-xs">
                    <span>To</span>
                    <Input
                      onChange={(event) =>
                        updateSearch({
                          dateTo: event.target.value || undefined,
                        })
                      }
                      type="date"
                      value={search.dateTo ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-muted-foreground text-xs">
                    <span>From</span>
                    <Input
                      onChange={(event) =>
                        updateSearch({
                          dateFrom: event.target.value || undefined,
                        })
                      }
                      type="date"
                      value={search.dateFrom ?? ""}
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <MultiFilter
                    items={(data?.institutions ?? []).map((institution) => ({
                      label: institution.name ?? "Unknown institution",
                      value: institution.id ?? "unknown",
                    }))}
                    label="Institutions"
                    onChange={(values) =>
                      updateSearch({ institutionIds: values })
                    }
                    placeholder="Add institutions"
                    value={search.institutionIds}
                  />
                  <MultiFilter
                    items={[
                      { label: "Posted", value: "posted" },
                      { label: "Pending", value: "pending" },
                    ]}
                    label="Status"
                    onChange={(values) =>
                      updateSearch({
                        statuses: values as ("pending" | "posted")[],
                      })
                    }
                    placeholder="Add statuses"
                    value={search.statuses}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <MultiFilter
                    items={(data?.accounts ?? []).map((account) => ({
                      label: account.accountName,
                      value: account.accountId,
                    }))}
                    label="Accounts"
                    onChange={(values) => updateSearch({ accountIds: values })}
                    placeholder="Add accounts"
                    value={search.accountIds}
                  />
                </div>
                <Button onClick={clearFilters} variant="outline">
                  Reset
                </Button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Select
                  items={[
                    { label: "Newest first", value: "date_desc" },
                    { label: "Oldest first", value: "date_asc" },
                    { label: "Largest amount", value: "amount_desc" },
                    { label: "Smallest amount", value: "amount_asc" },
                  ]}
                  onValueChange={(value) =>
                    updateSearch({
                      sort: (value ?? "date_desc") as typeof search.sort,
                    })
                  }
                  value={search.sort}
                >
                  <SelectTrigger
                    aria-label="Sort transactions"
                    className="w-48"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="date_desc">Newest first</SelectItem>
                      <SelectItem value="date_asc">Oldest first</SelectItem>
                      <SelectItem value="amount_desc">
                        Largest amount
                      </SelectItem>
                      <SelectItem value="amount_asc">
                        Smallest amount
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  {data?.total ?? 0} transaction{data?.total === 1 ? "" : "s"}
                </p>
              </div>

              {transactionsQuery.isPending ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Loading transactions...
                  </CardContent>
                </Card>
              ) : (
                <TransactionsDataTable data={transactions} />
              )}

              <div className="flex items-center justify-end gap-3">
                <span className="text-muted-foreground text-sm">
                  Page {search.page} of {totalPages}
                </span>
                <Button
                  disabled={search.page <= 1}
                  onClick={() => updateSearch({ page: search.page - 1 })}
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={search.page >= totalPages}
                  onClick={() => updateSearch({ page: search.page + 1 })}
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </section>
          </div>
        </main>
      )}
    </FinanceShell>
  );
}

function MultiFilter({
  items,
  label,
  onChange,
  placeholder,
  value,
}: {
  items: { label: string; value: string }[];
  label: string;
  onChange: (values: string[]) => void;
  placeholder: string;
  value: string[];
}) {
  const selectedItems = items.filter((item) => value.includes(item.value));

  return (
    <div className="flex min-w-56 flex-1 flex-col gap-2 text-muted-foreground text-xs">
      <span>{label}</span>
      <Combobox
        items={items}
        itemToStringValue={(item) => item.label}
        multiple
        onValueChange={(nextItems) =>
          onChange(nextItems.map((item) => item.value))
        }
        value={selectedItems}
      >
        <ComboboxChips>
          <ComboboxValue>
            {selectedItems.map((item) => (
              <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput placeholder={placeholder} />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>No matching options.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
