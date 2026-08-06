import { Button } from "@dindin/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dindin/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

import {
  ConnectionsDataTable,
  type PlaidConnection,
} from "@/components/connections-data-table";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/plaid")({
  component: PlaidSandboxPage,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Coordinates the sandbox and persisted sync states.
export function PlaidSandboxPage({
  showConnections = false,
}: {
  showConnections?: boolean;
} = {}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [result, setResult] = useState<PlaidResult | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [reauthItemId, setReauthItemId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const connectionsQuery = useQuery(
    orpc.plaid.listConnections.queryOptions({ enabled: showConnections })
  );
  const overviewQuery = useQuery(
    orpc.plaid.syncOverview.queryOptions({ enabled: showConnections })
  );
  const activityQuery = useQuery(
    orpc.plaid.syncActivity.queryOptions({
      enabled: showConnections,
      input: { page: activityPage, pageSize: 10 },
    })
  );
  const connections = (connectionsQuery.data ?? []) as PlaidConnection[];
  const hasConnections = connections.length > 0;
  const createLinkToken = useMutation(
    orpc.plaid.createLinkToken.mutationOptions({
      onSuccess: ({ linkToken: nextLinkToken }) => {
        setResult(null);
        setLinkToken(nextLinkToken);
      },
    })
  );
  const exchangePublicToken = useMutation(
    orpc.plaid.exchangePublicToken.mutationOptions({
      onSuccess: (nextResult) => {
        setResult(nextResult);
        setLinkToken(null);
        setReauthItemId(null);
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.listConnections.queryKey(),
        });
      },
    })
  );
  const createUpdateLinkToken = useMutation(
    orpc.plaid.createUpdateLinkToken.mutationOptions({
      onSuccess: ({ linkToken: nextLinkToken }) => {
        setLinkToken(nextLinkToken);
      },
    })
  );
  const removeConnection = useMutation(
    orpc.plaid.removeConnection.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.listConnections.queryKey(),
        });
      },
    })
  );
  const removeAccount = useMutation(
    orpc.plaid.removeAccount.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.listConnections.queryKey(),
        });
      },
    })
  );
  const syncItem = useMutation(
    orpc.plaid.syncItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.listConnections.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.syncOverview.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.plaid.syncActivity.queryKey(),
        });
      },
    })
  );
  const handleRemoveAccount = useCallback(
    (accountId: string) => removeAccount.mutate({ accountId }),
    [removeAccount]
  );
  const handleRemoveConnection = useCallback(
    (itemId: string) => removeConnection.mutate({ itemId }),
    [removeConnection]
  );
  const handleCreateLinkToken = useCallback(() => {
    createLinkToken.mutate(undefined);
  }, [createLinkToken]);
  const handleReauthenticate = useCallback(
    (itemId: string) => {
      setReauthItemId(itemId);
      createUpdateLinkToken.mutate({ itemId });
    },
    [createUpdateLinkToken]
  );
  const handleSync = useCallback(
    (itemId: string) =>
      syncItem.mutate({ action: "manual_sync", itemId, trigger: "manual" }),
    [syncItem]
  );
  const handlePublicToken = useCallback(
    (publicToken: string) =>
      exchangePublicToken.mutate({
        action: reauthItemId ? "reauthenticate" : "initial_connection",
        publicToken,
        trigger: reauthItemId ? "reauth" : "initial_connection",
      }),
    [exchangePublicToken, reauthItemId]
  );

  return (
    <main className="overflow-auto px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="max-w-2xl">
          <p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Bank connection
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            Connect your banks
          </h1>
          <p className="mt-3 text-muted-foreground">
            Follow the secure Plaid flow to connect your financial institutions.
            Your credentials stay with Plaid, and your account data is returned
            to dindin for syncing.
          </p>
        </header>

        {showConnections && connectionsQuery.isPending ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading connected institutions...
            </CardContent>
          </Card>
        ) : null}
        {showConnections && !connectionsQuery.isPending ? (
          <SyncOverview overview={overviewQuery.data} />
        ) : null}
        {showConnections && connectionsQuery.isError ? (
          <Card>
            <CardContent className="py-12 text-center text-destructive">
              Unable to load connected institutions. Try again shortly.
            </CardContent>
          </Card>
        ) : null}
        {showConnections &&
        !connectionsQuery.isPending &&
        !connectionsQuery.isError &&
        !hasConnections ? (
          <EmptyConnections
            linkToken={linkToken}
            onConnect={handleCreateLinkToken}
            onSuccess={handlePublicToken}
          />
        ) : null}
        {showConnections && !connectionsQuery.isError && hasConnections ? (
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-semibold text-xl tracking-tight">
                  Connected institutions
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {connections.length} institution
                  {connections.length === 1 ? "" : "s"} connected
                </p>
              </div>
              <Button onClick={handleCreateLinkToken} variant="outline">
                Connect another bank
              </Button>
            </div>
            {linkToken ? (
              <PlaidLinkButton
                linkToken={linkToken}
                onSuccess={handlePublicToken}
              />
            ) : null}
            <ConnectionsDataTable
              connections={connections}
              onReauthenticate={handleReauthenticate}
              onRemoveAccount={handleRemoveAccount}
              onRemoveConnection={handleRemoveConnection}
              onSync={handleSync}
            />
            {activityQuery.isError ? (
              <Card>
                <CardContent className="py-10 text-center text-destructive">
                  Unable to load sync activity. Run `bun run db:migrate` for a
                  local database, then try again.
                </CardContent>
              </Card>
            ) : (
              <SyncActivity
                activity={
                  activityQuery.data ?? {
                    page: activityPage,
                    pageSize: 10,
                    runs: [],
                    total: 0,
                  }
                }
                onPageChange={setActivityPage}
              />
            )}
          </section>
        ) : null}
        {showConnections ? null : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>1. Connect a bank</CardTitle>
                <CardDescription>
                  Select your institution and follow the prompts. You can
                  connect more than one bank as you build your financial
                  picture.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button
                  disabled={
                    createLinkToken.isPending || exchangePublicToken.isPending
                  }
                  onClick={handleCreateLinkToken}
                  size="lg"
                >
                  {createLinkToken.isPending
                    ? "Preparing Link..."
                    : "Connect a bank"}
                </Button>
                {linkToken ? (
                  <PlaidLinkButton
                    linkToken={linkToken}
                    onSuccess={handlePublicToken}
                  />
                ) : null}
                {createLinkToken.error ? (
                  <ErrorMessage error={createLinkToken.error} />
                ) : null}
                {exchangePublicToken.error ? (
                  <ErrorMessage error={exchangePublicToken.error} />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Confirm the sync</CardTitle>
                <CardDescription>
                  After connection, dindin receives account balances and
                  transaction data from Plaid.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result ? (
                  <ResultView result={result} />
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    Connect a bank to see the synchronized data here.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function SyncOverview({
  overview,
}: {
  overview:
    | {
        accountCount: number;
        connectedInstitutionCount: number;
        issueCount: number;
        latestSync: {
          completedAt: Date | string | null;
          startedAt: Date | string;
        } | null;
        syncingCount: number;
      }
    | undefined;
}) {
  return (
    <section
      aria-labelledby="sync-overview-title"
      className="flex flex-col gap-4"
    >
      <div>
        <h2
          className="font-semibold text-xl tracking-tight"
          id="sync-overview-title"
        >
          Sync overview
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Latest successful synchronization:{" "}
          {formatSyncDate(overview?.latestSync?.completedAt)}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Connected institutions</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {overview ? overview.connectedInstitutionCount : "—"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Accounts</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {overview ? overview.accountCount : "—"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Active syncs</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {overview ? overview.syncingCount : "—"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Issues</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {overview ? overview.issueCount : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </section>
  );
}

function SyncActivity({
  activity,
  onPageChange,
}: {
  activity: {
    page: number;
    pageSize: number;
    runs: Array<{
      addedCount: number;
      id: string;
      modifiedCount: number;
      removedCount: number;
      startedAt: Date | string;
      status: string;
      trigger: string;
      institutionName: string | null;
    }>;
    total: number;
  };
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.ceil(activity.total / activity.pageSize);
  const handlePrevious = useCallback(
    () => onPageChange(activity.page - 1),
    [activity.page, onPageChange]
  );
  const handleNext = useCallback(
    () => onPageChange(activity.page + 1),
    [activity.page, onPageChange]
  );

  return (
    <section
      aria-labelledby="sync-activity-title"
      className="flex flex-col gap-4"
    >
      <div>
        <h2
          className="font-semibold text-xl tracking-tight"
          id="sync-activity-title"
        >
          Sync activity
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          One row per sync attempt
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.runs.length ? (
              activity.runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatSyncDate(run.startedAt)}</TableCell>
                  <TableCell>
                    {run.institutionName ?? "Connected institution"}
                  </TableCell>
                  <TableCell className="capitalize">{run.trigger}</TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-xs"
                      title={`${run.addedCount} added, ${run.removedCount} removed, ${run.modifiedCount} modified`}
                    >
                      <span className="text-emerald-600">
                        +{run.addedCount}
                      </span>{" "}
                      <span className="text-destructive">
                        -{run.removedCount}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        ~{run.modifiedCount}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="capitalize">
                    {run.status.replaceAll("_", " ")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={5}>
                  No sync activity yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
        <span>
          Page {activity.page} of{" "}
          {Math.max(1, Math.ceil(activity.total / activity.pageSize))}
        </span>
        <div className="flex gap-2">
          <Button
            disabled={activity.page <= 1}
            onClick={handlePrevious}
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={activity.page >= lastPage}
            onClick={handleNext}
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatSyncDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "Not synced yet";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function PlaidLinkButton({
  linkToken,
  onSuccess,
}: {
  linkToken: string;
  onSuccess: (publicToken: string) => void;
}) {
  const { open, ready } = usePlaidLink({
    onSuccess: (publicToken) => {
      if (publicToken) {
        onSuccess(publicToken);
      }
    },
    token: linkToken,
  });
  const openedAutomatically = useRef(false);
  const handleOpen = useCallback(() => open(), [open]);

  useEffect(() => {
    if (ready && !openedAutomatically.current) {
      openedAutomatically.current = true;
      open();
    }
  }, [open, ready]);

  return (
    <Button disabled={!ready} onClick={handleOpen} variant="outline">
      Continue with Plaid
    </Button>
  );
}

function ResultView({ result }: { result: PlaidResult }) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Item ID</dt>
          <dd className="break-all font-mono text-xs">{result.itemId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Institution ID</dt>
          <dd className="font-mono text-xs">
            {result.institution ?? "Not returned"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Storage</dt>
          <dd>
            {result.savedConnectionId ? "Saved to dindin" : "Sandbox only"}
          </dd>
        </div>
      </dl>
      <section>
        <h2 className="mb-2 font-medium text-sm">
          Accounts ({result.accounts.length})
        </h2>
        <pre className="max-h-64 overflow-auto bg-muted p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(result.accounts, null, 2)}
        </pre>
      </section>
      <section>
        <h2 className="mb-2 font-medium text-sm">
          Transactions ({result.transactions.length})
        </h2>
        <pre className="max-h-64 overflow-auto bg-muted p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(result.transactions, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function ErrorMessage({ error }: { error: Error }) {
  return <p className="text-destructive text-sm">{error.message}</p>;
}

function EmptyConnections({
  linkToken,
  onConnect,
  onSuccess,
}: {
  linkToken: string | null;
  onConnect: () => void;
  onSuccess: (publicToken: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Connect your first institution
          </h2>
          <p className="mt-2 max-w-md text-muted-foreground text-sm">
            Bring your accounts, balances, and transactions into dindin to start
            building your personal and household financial picture.
          </p>
        </div>
        <Button onClick={onConnect} size="lg">
          Connect a bank
        </Button>
        {linkToken ? (
          <PlaidLinkButton linkToken={linkToken} onSuccess={onSuccess} />
        ) : null}
      </CardContent>
    </Card>
  );
}

interface PlaidResult {
  accounts: unknown[];
  institution: string | null | undefined;
  itemId: string;
  savedConnectionId: string | null;
  transactions: unknown[];
}
