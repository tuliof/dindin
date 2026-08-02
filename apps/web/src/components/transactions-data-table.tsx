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
  useReactTable,
} from "@tanstack/react-table";

export interface TransactionRow {
  accountId: string;
  accountName: string;
  amount: number;
  category: string[] | null;
  currency: string | null;
  date: string;
  institutionName: string | null;
  merchantName: string | null;
  name: string;
  pending: boolean;
  transactionId: string;
}

const columns: ColumnDef<TransactionRow>[] = [
  {
    accessorKey: "date",
    cell: ({ row }) => row.original.date,
    header: "Date",
  },
  {
    accessorKey: "merchantName",
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span>{row.original.merchantName ?? row.original.name}</span>
        {row.original.pending ? (
          <span className="text-muted-foreground text-xs">Pending</span>
        ) : null}
      </div>
    ),
    header: "Merchant",
  },
  {
    accessorKey: "institutionName",
    cell: ({ row }) => row.original.institutionName ?? "Unknown institution",
    header: "Institution",
  },
  {
    accessorKey: "accountName",
    cell: ({ row }) => row.original.accountName,
    header: "Account",
  },
  {
    accessorKey: "category",
    cell: ({ row }) => row.original.category?.join(" / ") ?? "-",
    header: "Category",
  },
  {
    accessorKey: "amount",
    cell: ({ row }) => (
      <span className="block text-right tabular-nums">
        {formatAmount(row.original.amount, row.original.currency)}
      </span>
    ),
    header: () => <span className="block text-right">Amount</span>,
  },
];

export function TransactionsDataTable({ data }: { data: TransactionRow[] }) {
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
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
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                No transactions match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function formatAmount(amount: number, currency: string | null): string {
  return new Intl.NumberFormat("en-US", {
    currency: currency ?? "USD",
    style: "currency",
  }).format(amount);
}
