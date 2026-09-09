import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: ReactNode;
  className?: string;
  headerClassName?: string;
  cell: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Нет данных",
  loading = false,
  className,
  onRowClick,
  rowClassName,
}: Props<T>) {
  return (
    <div className={cn("border-line bg-surface overflow-x-auto rounded-[14px] border", className)}>
      <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-line bg-surface-2 border-b px-3.5 py-[11px] whitespace-nowrap",
                  "text-ink-3 text-left text-[11px] font-bold tracking-[0.05em] uppercase",
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="text-ink-3 px-3.5 py-2.5 text-sm">
                Загрузка…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-ink-3 px-3.5 py-2.5 text-sm">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "hover:bg-surface-2",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row),
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "border-line border-b px-3.5 py-2.5 align-middle",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
