/**
 * components/MetricCard.tsx
 *
 * GA4-style metric card showing a big number, label, and optional change indicator.
 */

import React from "react";
import { GA4_COLORS, GA4_STYLES } from "../styles/ga4Theme";

interface MetricCardProps {
  label:    string;
  value:    string | number;
  change?:  number | null;   // percentage change (positive = good)
  suffix?:  string;          // e.g. "%", "ms", "s"
  loading?: boolean;
  invertChange?: boolean;    // true = lower is better (e.g. bounce rate)
  subtitle?: string;         // small text below the value
}

export function MetricCard({ label, value, change, suffix, loading, invertChange, subtitle }: MetricCardProps) {
  const isPositive = invertChange ? (change ?? 0) < 0 : (change ?? 0) >= 0;

  return (
    <div style={GA4_STYLES.metricCard}>
      <div style={GA4_STYLES.metricLabel}>{label}</div>
      <div style={{
        ...GA4_STYLES.metricValue,
        opacity: loading ? 0.4 : 1,
        transition: "opacity 0.2s",
      }}>
        {loading ? "—" : (
          <>
            {typeof value === "number" ? formatNumber(value) : value}
            {suffix && <span style={{ fontSize: 16, color: GA4_COLORS.textSecondary, marginLeft: 2 }}>{suffix}</span>}
          </>
        )}
      </div>
      {change !== undefined && change !== null && !loading && (
        <div style={isPositive ? GA4_STYLES.changePositive : GA4_STYLES.changeNegative}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
        </div>
      )}
      {subtitle && !loading && (
        <div style={{ fontSize: 10, color: GA4_COLORS.textTertiary, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(1);
}
