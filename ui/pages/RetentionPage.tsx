/**
 * pages/RetentionPage.tsx
 *
 * Retention page.
 * Shows session frequency, new vs returning visitors, and daily visitor trends.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { DonutChart } from "../components/DonutChart";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface RetentionPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
}

export function RetentionPage({ appId, timeframe, refreshKey }: RetentionPageProps) {
  const [dailyTrend, setDailyTrend] = useState<TimeSeriesPoint[]>([]);
  const [sessionFreq, setSessionFreq] = useState<BarItem[]>([]);
  const [newVsReturn, setNewVsReturn] = useState<{ label: string; value: number }[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [returningPct, setReturningPct] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        daily: Q.retentionDailyVisitors(appId, timeframe),
        freq:  Q.retentionSessionFrequency(appId, timeframe),
        nvr:   Q.retentionNewVsReturning(appId, timeframe),
      });

      setDailyTrend(extractTimeseries(results.daily));

      const order = ["1 session", "2-3 sessions", "4-5 sessions", "6-10 sessions", "11+ sessions"];
      setSessionFreq(
        results.freq
          .filter(r => r["freqBucket"])
          .sort((a, b) => order.indexOf(String(a["freqBucket"])) - order.indexOf(String(b["freqBucket"])))
          .map(r => ({ label: String(r["freqBucket"]), value: Number(r["users"]) || 0 }))
      );

      const nvrData = results.nvr
        .filter(r => r["visitorType"])
        .map(r => ({ label: String(r["visitorType"]), value: Number(r["users"]) || 0 }));
      setNewVsReturn(nvrData);

      const total = nvrData.reduce((s, d) => s + d.value, 0);
      setTotalUsers(total);
      const returning = nvrData.find(d => d.label === "Returning visitor")?.value ?? 0;
      setReturningPct(total > 0 ? (returning / total) * 100 : 0);
    } catch (err) {
      console.error("[Retention] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Retention
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Visitor loyalty and return frequency
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total Visitors" value={totalUsers} loading={loading} />
        <MetricCard label="Returning %" value={`${returningPct.toFixed(1)}%`} loading={loading} />
      </div>

      {/* Daily visitors trend */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Unique visitors over time</div>
        {loading ? <CardSkeleton height={240} /> : (
          <AreaChart data={dailyTrend} color={GA4_COLORS.primary} label="Visitors" />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* New vs returning */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>New vs returning visitors</div>
          {loading ? <CardSkeleton height={250} /> : (
            <DonutChart data={newVsReturn} colors={[GA4_COLORS.primary, GA4_COLORS.chart[3]]} />
          )}
        </div>

        {/* Session frequency */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions per visitor</div>
          {loading ? <CardSkeleton height={250} /> : (
            <BarChart data={sessionFreq} color={GA4_COLORS.chart[1]} maxBars={5} />
          )}
        </div>
      </div>
    </div>
  );
}

function extractTimeseries(records: Record<string, unknown>[]): TimeSeriesPoint[] {
  const filtered = records.filter(Boolean);
  if (!filtered.length) return [];
  const record = filtered[0];
  const metricKey = Object.keys(record).find(k => k !== "timeframe" && k !== "interval");
  if (!metricKey) return [];
  const values = record[metricKey];
  if (!Array.isArray(values)) return [];
  const timeframe = record["timeframe"] as { start?: string } | undefined;
  const intervalNs = Number(record["interval"]) || 0;
  const startMs = timeframe?.start ? new Date(timeframe.start).getTime() : 0;
  const intervalMs = intervalNs / 1_000_000;
  return values.map((v, i) => ({
    timestamp: startMs && intervalMs ? new Date(startMs + i * intervalMs).toISOString() : String(i),
    value: Number(v) || 0,
  }));
}
