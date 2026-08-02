import { Badge } from "@dindin/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dindin/ui/components/chart";
import { Skeleton } from "@dindin/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dindin/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { orpc } from "@/utils/orpc";

const chartConfig = {
  income: { color: "var(--chart-2)", label: "Income" },
  spending: { color: "var(--chart-1)", label: "Spending" },
} satisfies ChartConfig;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function PlaidDashboard() {
  const summaryQuery = useQuery(orpc.plaid.dashboardSummary.queryOptions());

  if (summaryQuery.isPending) {
    return <DashboardSkeleton />;
  }
  if (summaryQuery.error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-10 text-destructive">
          <AlertCircleIcon />
          <p>We could not load your financial summary.</p>
        </CardContent>
      </Card>
    );
  }

  const summary = summaryQuery.data;
  if (summary.accountCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your financial picture starts here</CardTitle>
          <CardDescription>
            Connect an institution to see balances, cash flow, and recent
            activity.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {summary.reauthConnections > 0 ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <AlertCircleIcon className="text-destructive" />
            <span>
              {summary.reauthConnections} institution
              {summary.reauthConnections === 1 ? " needs" : "s need"} to be
              reconnected in the Sync page.
            </span>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          description="Across connected accounts"
          label="Total balance"
          value={formatCurrency(summary.totalBalance)}
        />
        <SummaryCard
          description="Current calendar month"
          label="Spending"
          value={formatCurrency(summary.currentMonth.spending)}
        />
        <SummaryCard
          description="Current calendar month"
          label="Income"
          value={formatCurrency(summary.currentMonth.income)}
        />
        <SummaryCard
          description={`${summary.pendingConnections} pending connection${summary.pendingConnections === 1 ? "" : "s"}`}
          label="Connected accounts"
          value={String(summary.accountCount)}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.5fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
            <CardDescription>
              Income and spending from synced transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[280px] w-full" config={chartConfig}>
              <BarChart accessibilityLayer data={summary.cashFlow}>
                <CartesianGrid vertical={false} />
                <XAxis axisLine={false} dataKey="label" tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                <Bar
                  dataKey="spending"
                  fill="var(--color-spending)"
                  radius={4}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where spending goes</CardTitle>
            <CardDescription>
              Top categories in your synced history
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {summary.categories.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No spending data yet.
              </p>
            ) : (
              summary.categories.map((category) => (
                <div
                  className="flex items-center justify-between gap-4"
                  key={category.name}
                >
                  <span className="truncate text-sm">{category.name}</span>
                  <span className="font-medium text-sm tabular-nums">
                    {formatCurrency(category.amount)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            {summary.lastSyncedAt
              ? `Last synced ${dateFormatter.format(new Date(summary.lastSyncedAt))}`
              : "Waiting for the first completed sync"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.recentTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {transaction.amount >= 0 ? (
                        <ArrowDownRightIcon className="text-muted-foreground" />
                      ) : (
                        <ArrowUpRightIcon className="text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {transaction.merchantName}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {transaction.category} · {transaction.institutionName}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {transaction.accountName}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {dateFormatter.format(new Date(transaction.date))}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <span
                      className={
                        transaction.amount >= 0 ? "" : "text-emerald-600"
                      }
                    >
                      {transaction.amount >= 0 ? "-" : "+"}
                      {formatCurrency(Math.abs(transaction.amount))}
                    </span>
                    {transaction.pending ? (
                      <Badge className="ml-2" variant="secondary">
                        Pending
                      </Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardHeader>
    </Card>
  );
}

function DashboardSkeleton() {
  const skeletons = ["balance", "spending", "income", "accounts"];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {skeletons.map((skeleton) => (
          <Skeleton className="h-32" key={skeleton} />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-72" />
    </div>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}
