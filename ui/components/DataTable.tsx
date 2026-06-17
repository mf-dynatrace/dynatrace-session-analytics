/**
 * components/DataTable.tsx
 *
 * GA4-style data table with sortable columns and horizontal bar charts.
 */

import React, { useState } from "react";
import { GA4_COLORS, GA4_STYLES } from "../styles/ga4Theme";

interface Column {
  key:       string;
  label:     string;
  align?:    "left" | "right" | "center";
  format?:   (value: unknown) => string;
  title?:    (value: unknown) => string;  // hover tooltip
  width?:    number | string;
  showBar?:  boolean;  // show inline horizontal bar
}

interface DataTableProps {
  columns:  Column[];
  data:     Record<string, unknown>[];
  loading?: boolean;
  maxRows?: number;
}

export function DataTable({ columns, data, loading, maxRows }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const displayData = React.useMemo(() => {
    let rows = [...data];
    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
        return sortAsc
          ? String(av ?? "").localeCompare(String(bv ?? ""))
          : String(bv ?? "").localeCompare(String(av ?? ""));
      });
    }
    if (maxRows) rows = rows.slice(0, maxRows);
    return rows;
  }, [data, sortKey, sortAsc, maxRows]);

  // Find max value for bar columns
  const barMaxes: Record<string, number> = {};
  columns.forEach(col => {
    if (col.showBar) {
      barMaxes[col.key] = Math.max(...data.map(r => Number(r[col.key]) || 0), 1);
    }
  });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>
        No data available
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  ...GA4_STYLES.tableHeader,
                  textAlign: col.align ?? "left",
                  width: col.width,
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: 4, fontSize: 10 }}>
                    {sortAsc ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, idx) => (
            <tr
              key={idx}
              style={{
                background: idx % 2 === 0 ? "transparent" : "#fafafa",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f1f3f4")}
              onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "#fafafa")}
            >
              {columns.map(col => {
                const raw = row[col.key];
                const formatted = col.format ? col.format(raw) : formatDefault(raw);
                const barWidth = col.showBar
                  ? `${(Number(raw) / barMaxes[col.key]) * 100}%`
                  : undefined;

                return (
                  <td
                    key={col.key}
                    title={col.title ? col.title(raw) : undefined}
                    style={{
                      ...GA4_STYLES.tableCell,
                      textAlign: col.align ?? "left",
                      position: "relative",
                    }}
                  >
                    {barWidth && (
                      <div style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: barWidth,
                        background: `${GA4_COLORS.primary}10`,
                        transition: "width 0.3s ease",
                      }} />
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>{formatted}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDefault(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toFixed(2);
  }
  return String(v);
}
