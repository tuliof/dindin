import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@dindin/ui/components/alert-dialog";
import { Button } from "@dindin/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dindin/ui/components/table";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export interface PlaidConnectionAccount {
  accountId: string;
  balances: unknown;
  mask: string | null;
  name: string;
  officialName: string | null;
  subtype: string | null;
  type: string;
}

export interface PlaidConnection {
  accounts: PlaidConnectionAccount[];
  institutionId: string | null;
  institutionName: string | null;
  itemErrorCode: string | null;
  itemErrorMessage: string | null;
  itemId: string;
  savedAt: Date | string;
  transactionLastFailedAt: string | null;
  transactionLastSuccessfulAt: string | null;
  webhookCode: string | null;
  webhookSentAt: string | null;
  webhookUrl: string | null;
}

interface ConnectionRow {
  account?: PlaidConnectionAccount;
  id: string;
  institution?: PlaidConnection;
  kind: "account" | "institution";
  parentId?: string;
  subRows?: ConnectionRow[];
}

export function ConnectionsDataTable({
  connections,
  onRemoveAccount,
  onRemoveConnection,
  onReauthenticate,
}: {
  connections: PlaidConnection[];
  onRemoveAccount: (accountId: string) => void;
  onRemoveConnection: (itemId: string) => void;
  onReauthenticate: (itemId: string) => void;
}) {
  const rows = useMemo(
    () =>
      connections.map<ConnectionRow>((connection) => ({
        id: connection.itemId,
        institution: connection,
        kind: "institution",
        subRows: connection.accounts.map((account) => ({
          account,
          id: `${connection.itemId}-${account.accountId}`,
          institution: connection,
          kind: "account",
          parentId: connection.itemId,
        })),
      })),
    [connections]
  );
  const columns = useMemo(
    () =>
      createColumns({ onReauthenticate, onRemoveAccount, onRemoveConnection }),
    [onRemoveAccount, onRemoveConnection, onReauthenticate]
  );
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
  });

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={7}>
                No connected institutions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function createColumns({
  onRemoveAccount,
  onRemoveConnection,
  onReauthenticate,
}: {
  onRemoveAccount: (accountId: string) => void;
  onRemoveConnection: (itemId: string) => void;
  onReauthenticate: (itemId: string) => void;
}): ColumnDef<ConnectionRow>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => {
        if (row.original.kind === "institution") {
          const { institution } = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${institution?.institutionName ?? "institution"}`}
                className="size-7"
                onClick={row.getToggleExpandedHandler()}
                size="icon"
                variant="ghost"
              >
                {row.getIsExpanded() ? (
                  <ChevronDownIcon />
                ) : (
                  <ChevronRightIcon />
                )}
              </Button>
              <span className="font-medium">
                {institution?.institutionName ?? "Connected institution"}
              </span>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-0.5 pl-8">
            <span>{row.original.account?.name}</span>
            {row.original.account?.officialName ? (
              <span className="text-muted-foreground text-xs">
                {row.original.account.officialName}
              </span>
            ) : null}
          </div>
        );
      },
      header: "Institution / account",
    },
    {
      cell: ({ row }) =>
        row.original.kind === "account" ? (
          <span className="capitalize">
            {row.original.account?.subtype ?? row.original.account?.type}
          </span>
        ) : null,
      header: "Type",
    },
    {
      cell: ({ row }) =>
        row.original.kind === "account" ? (
          <span className="font-mono text-muted-foreground text-xs">
            {row.original.account?.mask
              ? `•••• ${row.original.account.mask}`
              : "—"}
          </span>
        ) : null,
      header: "Mask",
    },
    {
      cell: ({ row }) =>
        row.original.kind === "institution" ? (
          <span className="text-muted-foreground text-xs">
            {formatTransactionStatus(row.original.institution)}
          </span>
        ) : null,
      header: "Transactions",
    },
    {
      cell: ({ row }) =>
        row.original.kind === "institution" ? (
          <span className="text-muted-foreground text-xs">
            {formatWebhookStatus(row.original.institution)}
          </span>
        ) : null,
      header: "Webhook",
    },
    {
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {formatSyncedAt(row.original.institution?.savedAt)}
        </span>
      ),
      header: "Last synced",
    },
    {
      cell: ({ row }) => (
        <ConnectionAction
          onReauthenticate={onReauthenticate}
          onRemoveAccount={onRemoveAccount}
          onRemoveConnection={onRemoveConnection}
          row={row.original}
        />
      ),
      header: "",
      id: "actions",
    },
  ];
}

function formatTransactionStatus(
  connection: PlaidConnection | undefined
): string {
  if (!connection) {
    return "—";
  }
  if (connection.transactionLastSuccessfulAt) {
    return `Updated ${formatSyncedAt(connection.transactionLastSuccessfulAt)}`;
  }
  if (connection.transactionLastFailedAt) {
    return `Failed ${formatSyncedAt(connection.transactionLastFailedAt)}`;
  }
  if (connection.itemErrorCode) {
    return `Action needed: ${connection.itemErrorCode}`;
  }
  return "Waiting for update";
}

function formatWebhookStatus(connection: PlaidConnection | undefined): string {
  if (!(connection?.webhookCode || connection?.webhookSentAt)) {
    return "No webhook yet";
  }
  return `${connection.webhookCode ?? "Sent"} ${formatSyncedAt(connection.webhookSentAt)}`;
}

function ConnectionAction({
  onRemoveAccount,
  onRemoveConnection,
  onReauthenticate,
  row,
}: {
  onRemoveAccount: (accountId: string) => void;
  onRemoveConnection: (itemId: string) => void;
  onReauthenticate: (itemId: string) => void;
  row: ConnectionRow;
}) {
  const [open, setOpen] = useState(false);
  const handleClick = useCallback(() => {
    if (row.kind === "institution" && row.institution) {
      onRemoveConnection(row.institution.itemId);
    } else if (row.kind === "account" && row.account) {
      onRemoveAccount(row.account.accountId);
    }
  }, [onRemoveAccount, onRemoveConnection, row]);
  const handleConfirm = useCallback(() => {
    handleClick();
    setOpen(false);
  }, [handleClick]);
  const label =
    row.kind === "institution"
      ? `Remove ${row.institution?.institutionName ?? "institution"}`
      : `Remove ${row.account?.name}`;
  const canReauthenticate =
    row.kind === "institution" &&
    row.institution?.itemErrorCode === "ITEM_LOGIN_REQUIRED";
  const handleReauthenticate = useCallback(() => {
    if (row.institution) {
      onReauthenticate(row.institution.itemId);
    }
  }, [onReauthenticate, row.institution]);

  return (
    <div className="flex justify-end gap-1">
      {canReauthenticate ? (
        <Button
          aria-label={`Reconnect ${row.institution?.institutionName ?? "institution"}`}
          onClick={handleReauthenticate}
          size="icon-sm"
          title="Reconnect institution"
          variant="ghost"
        >
          <RefreshCwIcon />
        </Button>
      ) : null}
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogTrigger
          render={<Button aria-label={label} size="icon-sm" variant="ghost" />}
        >
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {row.kind} from your dindin view. Plaid data may
              be available again if you reconnect the institution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} variant="destructive">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatSyncedAt(value: Date | string | undefined): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
