import { createFileRoute } from "@tanstack/react-router";

import { FinanceShell } from "@/components/finance-shell";
import { PlaidSandboxPage } from "@/routes/plaid";

export const Route = createFileRoute("/_auth/sync")({
  component: SyncPage,
});

function SyncPage() {
  const { session } = Route.useRouteContext();

  return (
    <FinanceShell
      user={{
        email: session.user.email,
        name: session.user.name,
      }}
    >
      {() => <PlaidSandboxPage showConnections />}
    </FinanceShell>
  );
}
