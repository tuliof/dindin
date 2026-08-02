import { createFileRoute } from "@tanstack/react-router";
import dashboardData from "@/app/dashboard/data.json";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { FinanceShell } from "@/components/finance-shell";
import { SectionCards } from "@/components/section-cards";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  return (
    <FinanceShell
      user={{
        email: session?.user.email ?? "",
        name: session?.user.name ?? "User",
      }}
    >
      {(isHouseholdView) => (
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 lg:gap-6 lg:p-6 lg:pt-0">
          <div className="flex items-end justify-between gap-4 border-b py-5">
            <div>
              <p className="text-muted-foreground text-sm">
                {isHouseholdView ? "Household view" : "Personal view"}
              </p>
              <h1 className="font-semibold text-2xl tracking-tight">
                Welcome back, {session?.user.name}
              </h1>
            </div>
            <p className="hidden text-muted-foreground text-sm sm:block">
              {isHouseholdView
                ? "Shared accounts, goals, and household cash flow"
                : "Your accounts, goals, spending, and household share"}
            </p>
          </div>
          <SectionCards />
          <ChartAreaInteractive />
          <DataTable data={dashboardData} />
        </div>
      )}
    </FinanceShell>
  );
}
