import { Button } from "@dindin/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
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
  const queryClient = useQueryClient();
  const connectionsQuery = useQuery(
    orpc.plaid.listConnections.queryOptions({ enabled: showConnections })
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
      createUpdateLinkToken.mutate({ itemId });
    },
    [createUpdateLinkToken]
  );
  const handlePublicToken = useCallback(
    (publicToken: string) => exchangePublicToken.mutate({ publicToken }),
    [exchangePublicToken]
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
        {showConnections && !connectionsQuery.isPending && !hasConnections ? (
          <EmptyConnections
            linkToken={linkToken}
            onConnect={handleCreateLinkToken}
            onSuccess={handlePublicToken}
          />
        ) : null}
        {showConnections && hasConnections ? (
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
            />
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
