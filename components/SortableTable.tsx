"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface SortableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  className?: string;
  width?: string; // e.g. "120px" or "20%"
}

export interface SortableRow {
  id: string | number;
  cells: Record<string, ReactNode>;
  sortValues: Record<string, string | number | boolean | null>;
  href?: string;
}

interface Props {
  columns: SortableColumn[];
  rows: SortableRow[];
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  emptyMessage?: string;
}

export function SortableTable({
  columns,
  rows,
  defaultSortKey,
  defaultSortDir = "asc",
  emptyMessage = "No rows.",
}: Props) {
  // Show a fixed trailing arrow column when any row has an href (saves the caller
  // from passing a function, which can't cross the server→client boundary).
  const showOpenColumn = rows.some((r) => r.href != null);
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a.sortValues[sortKey];
      const bv = b.sortValues[sortKey];
      // null / undefined sort to end regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return as < bs ? -1 * dir : as > bs ? 1 * dir : 0;
    });
  }, [rows, sortKey, sortDir]);

  const onHeaderClick = (col: SortableColumn) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-slate-500 italic text-[13px]">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="foundry-table" style={{ tableLayout: "auto" }}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key;
              return (
                <th
                  key={c.key}
                  className={`${c.align === "right" ? "text-right" : "text-left"} ${c.sortable ? "cursor-pointer select-none hover:bg-slate-100" : ""}`}
                  style={c.width ? { width: c.width } : undefined}
                  onClick={() => onHeaderClick(c)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && (
                      <span className={`text-[9px] leading-none ${active ? "text-coffee-700" : "text-slate-400"}`}>
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
            {showOpenColumn && <th className="text-right w-12"></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <Row key={r.id} row={r} columns={columns} showOpenColumn={showOpenColumn} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, columns, showOpenColumn }: { row: SortableRow; columns: SortableColumn[]; showOpenColumn: boolean }) {
  const handleClick = row.href
    ? () => { window.location.href = row.href!; }
    : undefined;
  return (
    <tr className={row.href ? "cursor-pointer" : ""} onClick={handleClick}>
      {columns.map((c) => (
        <td
          key={c.key}
          className={`${c.align === "right" ? "text-right" : "text-left"} ${c.className ?? ""}`}
        >
          {row.cells[c.key]}
        </td>
      ))}
      {showOpenColumn && (
        <td className="text-right">
          {row.href && <span className="text-[12px] text-coffee-700">→</span>}
        </td>
      )}
    </tr>
  );
}
