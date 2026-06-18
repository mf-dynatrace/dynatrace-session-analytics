/**
 * pages/OverviewPage.tsx
 *
 * GA4 Home / Overview page.
 * Shows key metrics (Users, Sessions, Page Views, Bounce Rate, Avg Duration)
 * and trend charts.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { MiniChart } from "../components/MiniChart";
import { DonutChart } from "../components/DonutChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface OverviewPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  globalFilterB?: string;
  onLoadEnd?: () => void;
}

interface KPIs {
  users: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  avgDuration: number;
}

export function OverviewPage({ appId, timeframe, refreshKey, globalFilter = "", globalFilterB, onLoadEnd }: OverviewPageProps) {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [kpisB, setKpisB] = useState<KPIs | null>(null);
  const [sessionsTrend, setSessionsTrend] = useState<TimeSeriesPoint[]>([]);
  const [sessionsTrendB, setSessionsTrendB] = useState<TimeSeriesPoint[]>([]);
  const [usersTrend, setUsersTrend] = useState<TimeSeriesPoint[]>([]);
  const [usersTrendB, setUsersTrendB] = useState<TimeSeriesPoint[]>([]);
  const [pvTrend, setPvTrend] = useState<TimeSeriesPoint[]>([]);
  const [pvTrendB, setPvTrendB] = useState<TimeSeriesPoint[]>([]);
  const [channelData, setChannelData] = useState<{ label: string; value: number }[]>([]);
  const [deviceData, setDeviceData] = useState<{ label: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const isCompare = globalFilterB !== undefined;

  const labelA = globalFilter ? "Segment A" : "All traffic";
  const labelB = globalFilterB !== undefined
    ? (globalFilterB ? "Segment B" : "All traffic")
    : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queriesA: Record<string, string> = {
        kpis:     Q.withFilter(Q.overviewKPIs(appId, timeframe), globalFilter),
        sessions: Q.withFilter(Q.sessionsOverTime(appId, timeframe), globalFilter),
        users:    Q.withFilter(Q.usersOverTime(appId, timeframe), globalFilter),
        pvTrend:  Q.withFilter(Q.pageViewsOverTime(appId, timeframe), globalFilter),
        channels: Q.withFilter(Q.acquisitionByChannel(appId, timeframe), globalFilter),
        devices:  Q.withFilter(Q.techDevices(appId, timeframe), globalFilter),
      };

      const queriesB: Record<string, string> = isCompare ? {
        kpisB:     Q.withFilter(Q.overviewKPIs(appId, timeframe), globalFilterB!),
        sessionsB: Q.withFilter(Q.sessionsOverTime(appId, timeframe), globalFilterB!),
        usersB:    Q.withFilter(Q.usersOverTime(appId, timeframe), globalFilterB!),
        pvTrendB:  Q.withFilter(Q.pageViewsOverTime(appId, timeframe), globalFilterB!),
      } : {};

      const results = await executeMultipleDql({ ...queriesA, ...queriesB });

      // Segment A KPIs
      const kpiRow = results.kpis?.[0];
      if (kpiRow) {
        setKpis({
          users:       Number(kpiRow["users"]) || 0,
          sessions:    Number(kpiRow["sessions"]) || 0,
          pageViews:   Number(kpiRow["pageViews"]) || 0,
          bounceRate:  Number(kpiRow["bounceRate"]) || 0,
          avgDuration: Number(kpiRow["avgDuration"]) || 0,
        });
      }

      // Segment B KPIs
      if (isCompare) {
        const kpiRowB = results.kpisB?.[0];
        if (kpiRowB) {
          setKpisB({
            users:       Number(kpiRowB["users"]) || 0,
            sessions:    Number(kpiRowB["sessions"]) || 0,
            pageViews:   Number(kpiRowB["pageViews"]) || 0,
            bounceRate:  Number(kpiRowB["bounceRate"]) || 0,
            avgDuration: Number(kpiRowB["avgDuration"]) || 0,
          });
        }
      } else {
        setKpisB(null);
      }

      // Time series
      setSessionsTrend(extractTimeseries(results.sessions));
      setUsersTrend(extractTimeseries(results.users));
      setPvTrend(extractTimeseries(results.pvTrend));

      if (isCompare) {
        setSessionsTrendB(extractTimeseries(results.sessionsB ?? []));
        setUsersTrendB(extractTimeseries(results.usersB ?? []));
        setPvTrendB(extractTimeseries(results.pvTrendB ?? []));
      } else {
        setSessionsTrendB([]);
        setUsersTrendB([]);
        setPvTrendB([]);
      }

      // Breakdown (not compared — showing A only)
      setChannelData(
        results.channels
          .filter(r => r["channel"])
          .map(r => ({ label: String(r["channel"]), value: Number(r["sessions"]) || 0 }))
      );

      setDeviceData(
        results.devices
          .filter(r => r["device.type"])
          .map(r => ({ label: String(r["device.type"]), value: Number(r["sessions"]) || 0 }))
      );
    } catch (err) {
      console.error("[Overview] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter, globalFilterB]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Page title */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          {isCompare
            ? `Comparing ${labelA} vs ${labelB}`
            : "Overview of your web analytics data"}
        </p>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap, flexWrap: "wrap" }}>
        <MetricCard
          label="Users"
          value={kpis?.users ?? 0}
          loading={loading}
          compareValue={isCompare ? (kpisB?.users ?? 0) : undefined}
          compareLabel={isCompare ? labelA : undefined}
          compareLabelB={isCompare ? labelB : undefined}
        />
        <MetricCard
          label="Sessions"
          value={kpis?.sessions ?? 0}
          loading={loading}
          compareValue={isCompare ? (kpisB?.sessions ?? 0) : undefined}
          compareLabel={isCompare ? labelA : undefined}
          compareLabelB={isCompare ? labelB : undefined}
        />
        <MetricCard
          label="Page Views"
          value={kpis?.pageViews ?? 0}
          loading={loading}
          compareValue={isCompare ? (kpisB?.pageViews ?? 0) : undefined}
          compareLabel={isCompare ? labelA : undefined}
          compareLabelB={isCompare ? labelB : undefined}
        />
        <MetricCard
          label="Bounce Rate"
          value={kpis ? kpis.bounceRate.toFixed(1) : "0"}
          suffix="%"
          loading={loading}
          invertChange
          compareValue={isCompare ? (kpisB ? kpisB.bounceRate.toFixed(1) : "0") : undefined}
          compareLabel={isCompare ? labelA : undefined}
          compareLabelB={isCompare ? labelB : undefined}
        />
        <MetricCard
          label="Avg. Session Duration"
          value={kpis ? formatDuration(kpis.avgDuration) : "0s"}
          loading={loading}
          compareValue={isCompare ? (kpisB ? formatDuration(kpisB.avgDuration) : "0s") : undefined}
          compareLabel={isCompare ? labelA : undefined}
          compareLabelB={isCompare ? labelB : undefined}
        />
      </div>

      {/* Trend Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Users over time</div>
          {loading ? <CardSkeleton height={240} /> : (
            <AreaChart
              data={usersTrend}
              color={GA4_COLORS.chart[0]}
              label={isCompare ? labelA : "Users"}
              dataB={isCompare ? usersTrendB : undefined}
              labelB={isCompare ? labelB : undefined}
            />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions over time</div>
          {loading ? <CardSkeleton height={240} /> : (
            <AreaChart
              data={sessionsTrend}
              color={GA4_COLORS.chart[3]}
              label={isCompare ? labelA : "Sessions"}
              dataB={isCompare ? sessionsTrendB : undefined}
              labelB={isCompare ? labelB : undefined}
            />
          )}
        </div>
      </div>

      {/* Page views trend */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Page views over time</div>
        {loading ? <CardSkeleton height={240} /> : (
          <AreaChart
            data={pvTrend}
            color={GA4_COLORS.chart[4]}
            label={isCompare ? labelA : "Page Views"}
            dataB={isCompare ? pvTrendB : undefined}
            labelB={isCompare ? labelB : undefined}
          />
        )}
      </div>

      {/* Breakdown Row: Channels + Devices (always segment A) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>
            Sessions by channel{isCompare ? ` — ${labelA}` : ""}
          </div>
          {loading ? <CardSkeleton height={200} /> : (
            <DonutChart data={channelData} />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>
            Sessions by device{isCompare ? ` — ${labelA}` : ""}
          </div>
          {loading ? <CardSkeleton height={200} /> : (
            <DonutChart data={deviceData} colors={[GA4_COLORS.chart[3], GA4_COLORS.chart[0], GA4_COLORS.chart[2]]} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format duration from nanoseconds (Gen 3 user.sessions duration is in nanoseconds).
 */
function formatDuration(ns: number): string {
  if (!ns || ns <= 0) return "0s";
  const totalSec = ns / 1_000_000_000;
  if (totalSec < 60) return `${totalSec.toFixed(0)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min}m ${sec}s`;
}

/**
 * Extract timeseries data from DQL makeTimeseries results.
 *
 * DQL makeTimeseries returns a SINGLE record with:
 *   timeframe: {start: string, end: string}  — overall time range (NOT an array)
 *   interval:  string                         — bucket size in nanoseconds
 *   <metric>:  Array<number|null>              — array of values per bucket
 *
 * Example:
 *   { timeframe: {start:"...", end:"..."}, interval: "3600000000000", sessions: [15565, 33054, ...] }
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
