/**
 * pages/RealtimePage.tsx
 *
 * GA4-style Realtime overview page.
 * Shows active users in the last 30 minutes, live page views per minute,
 * top active pages, and user locations.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface RealtimePageProps {
  appId: string;
  refreshKey: number;
}

export function RealtimePage({ appId, refreshKey }: RealtimePageProps) {
  const [activeUsers, setActiveUsers] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);
  const [pvPerMinute, setPvPerMinute] = useState<TimeSeriesPoint[]>([]);
  const [topPages, setTopPages] = useState<Record<string, unknown>[]>([]);
  const [countries, setCountries] = useState<BarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await executeMultipleDql({
        active:    Q.realtimeActiveUsers(appId),
        pvMinute:  Q.realtimePageViewsPerMinute(appId),
        pages:     Q.realtimeTopPages(appId),
        countries: Q.realtimeUserCountries(appId),
      });

      const activeRow = results.active[0];
      if (activeRow) {
        setActiveUsers(Number(activeRow["activeUsers"]) || 0);
        setActiveSessions(Number(activeRow["sessions"]) || 0);
      }

      setPvPerMinute(extractTimeseries(results.pvMinute));

      setTopPages(results.pages);

      setCountries(
        results.countries
          .filter(r => r["geo.country.iso_code"])
          .map(r => ({
            label: String(r["geo.country.iso_code"]),
            value: Number(r["users"]) || 0,
          }))
      );
    } catch (err) {
      console.error("[Realtime] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds for realtime
    intervalRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Live activity
        </h1>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: GA4_COLORS.positive,
          animation: "pulse-bg 2s ease-in-out infinite",
        }} />
        <span style={{ fontSize: 13, color: GA4_COLORS.textTertiary }}>
          Auto-refreshes every 60s
        </span>
      </div>

      {/* Big active users number */}
      <div style={{
        ...GA4_STYLES.card,
        display: "flex",
        alignItems: "center",
        gap: 32,
        padding: "32px 40px",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: GA4_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
            Users in last 30 minutes
          </div>
          <div style={{
            fontSize: 56, fontWeight: 400, color: GA4_COLORS.primary,
            lineHeight: 1.1, marginTop: 8,
            opacity: loading ? 0.4 : 1, transition: "opacity 0.3s",
          }}>
            {activeUsers.toLocaleString()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: GA4_COLORS.textSecondary, marginBottom: 8 }}>
            Page views per minute
          </div>
          {loading ? <CardSkeleton height={220} /> : (
            <AreaChart data={pvPerMinute} height={220} color={GA4_COLORS.primary} />
          )}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Active Users" value={activeUsers} loading={loading} />
        <MetricCard label="Active Sessions" value={activeSessions} loading={loading} />
        <MetricCard label="Page Views / min" value={pvPerMinute.length > 1 ? pvPerMinute[pvPerMinute.length - 2]?.value ?? 0 : 0} loading={loading} />
      </div>

      {/* Top pages + Countries */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card}>
          <div style={GA4_STYLES.sectionTitle}>Top active pages (last 5 min)</div>
          {loading ? <CardSkeleton height={300} /> : (
            <DataTable
              columns={[
                { key: "page.url.path", label: "Page", width: "60%" },
                { key: "activeViews", label: "Views", align: "right", showBar: true,
                  format: (v) => Number(v).toLocaleString() },
              ]}
              data={topPages}
              maxRows={10}
            />
          )}
        </div>
        <div style={GA4_STYLES.card}>
          <div style={GA4_STYLES.sectionTitle}>Users by country (last 30 min)</div>
          {loading ? <CardSkeleton height={300} /> : (
            <BarChart data={countries} color={GA4_COLORS.chart[3]} maxBars={8} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Extract timeseries data from DQL makeTimeseries results.
 *
 * DQL makeTimeseries returns a SINGLE record with:
 *   timeframe: {start: string, end: string}  — overall time range (NOT an array)
 *   interval:  string                         — bucket size in nanoseconds
 *   <metric>:  Array<number|null>              — array of values per bucket
 */
function extractTimeseries(records: Record<string, unknown>[]): TimeSeriesPoint[] {
  const filtered = records.filter(Boolean);
  if (!filtered.length) return [];

  const record = filtered[0];
  const metricKey = Object.keys(record).find(k => k !== "timeframe" && k !== "interval");
  if (!metricKey) return [];

  const values = record[metricKey];
  if (!Array.isArray(values)) return [];

  const timeframe = record["timeframe"] as { start?: string; end?: string } | undefined;
  const intervalNs = Number(record["interval"]) || 0;
  const startMs = timeframe?.start ? new Date(timeframe.start).getTime() : 0;
  const intervalMs = intervalNs / 1_000_000; // nanoseconds to milliseconds

  return values.map((v, i) => {
    const ts = startMs && intervalMs
      ? new Date(startMs + i * intervalMs).toISOString()
      : String(i);
    return {
      timestamp: ts,
      value: Number(v) || 0,
    };
  });
}
