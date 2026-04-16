/**
 * pages/WebVitalsPage.tsx
 *
 * Web Vitals page.
 * Shows Core Web Vitals (TTFB, LCP, FCP, CLS, INP) with ratings, trends, and per-page breakdown.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { AreaChart, TimeSeriesPoint, ChartThreshold } from "../components/AreaChart";
import { DataTable } from "../components/DataTable";
import { CardSkeleton } from "../components/LoadingState";
import { executeDql, executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface WebVitalsPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
}

interface VitalKPI {
  key: string;
  label: string;
  fullName: string;
  avg: number;
  p75: number;
  unit: string;
  good: number;
  poor: number;
}

function rateColor(value: number, good: number, poor: number): string {
  if (value <= good) return GA4_COLORS.positive;
  if (value >= poor) return GA4_COLORS.negative;
  return GA4_COLORS.warning;
}

function rateLabel(value: number, good: number, poor: number): string {
  if (value <= good) return "Good";
  if (value >= poor) return "Poor";
  return "Needs improvement";
}

export function WebVitalsPage({ appId, timeframe, refreshKey }: WebVitalsPageProps) {
  const [vitals, setVitals] = useState<VitalKPI[]>([]);
  const [samples, setSamples] = useState(0);
  const [trendData, setTrendData] = useState<TimeSeriesPoint[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("lcp");
  const [trendLoading, setTrendLoading] = useState(false);
  const [byPage, setByPage] = useState<Record<string, unknown>[]>([]);
  const [failingPages, setFailingPages] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setTrendLoading(true);
    try {
      const results = await executeMultipleDql({
        kpis:    Q.webVitalsKPIs(appId, timeframe),
        trend:   Q.webVitalsOverTime(appId, timeframe, selectedMetric),
        pages:   Q.webVitalsByPage(appId, timeframe),
        failing: Q.webVitalsFailingPages(appId, timeframe),
      });

      const kpi = results.kpis[0];
      if (kpi) {
        setSamples(Number(kpi["samples"]) || 0);
        setVitals([
          { key: "ttfb", label: "TTFB", fullName: "Time To First Byte", avg: Number(kpi["ttfb_avg"]) || 0, p75: Number(kpi["ttfb_p75"]) || 0, unit: "ms", good: 800, poor: 1800 },
          { key: "fcp",  label: "FCP",  fullName: "First Contentful Paint", avg: Number(kpi["fcp_avg"]) || 0, p75: Number(kpi["fcp_p75"]) || 0, unit: "ms", good: 1800, poor: 3000 },
          { key: "lcp",  label: "LCP",  fullName: "Largest Contentful Paint", avg: Number(kpi["lcp_avg"]) || 0, p75: Number(kpi["lcp_p75"]) || 0, unit: "ms", good: 2500, poor: 4000 },
          { key: "cls",  label: "CLS",  fullName: "Cumulative Layout Shift", avg: Number(kpi["cls_avg"]) || 0, p75: Number(kpi["cls_p75"]) || 0, unit: "",   good: 0.1, poor: 0.25 },
          { key: "inp",  label: "INP",  fullName: "Interaction To Next Paint", avg: Number(kpi["inp_avg"]) || 0, p75: Number(kpi["inp_p75"]) || 0, unit: "ms", good: 200, poor: 500 },
        ]);
      }

      setTrendData(extractTimeseries(results.trend));
      setByPage(results.pages);
      setFailingPages(results.failing);
    } catch (err) {
      console.error("[WebVitals] fetch error:", err);
    } finally {
      setLoading(false);
      setTrendLoading(false);
    }
  }, [appId, timeframe, selectedMetric]);

  // Re-fetch just the trend when metric selection changes (after initial load)
  const fetchTrend = useCallback(async (metric: string) => {
    setTrendLoading(true);
    try {
      const records = await executeDql(Q.webVitalsOverTime(appId, timeframe, metric));
      setTrendData(extractTimeseries(records));
    } catch (err) {
      console.error("[WebVitals] trend fetch error:", err);
    } finally {
      setTrendLoading(false);
    }
  }, [appId, timeframe]);

  const handleMetricSelect = useCallback((metric: string) => {
    if (metric === selectedMetric) return;
    setSelectedMetric(metric);
    fetchTrend(metric);
  }, [selectedMetric, fetchTrend]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Web vitals
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Core Web Vitals performance metrics ({samples.toLocaleString()} samples)
        </p>
      </div>

      {/* Vitals cards */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap, flexWrap: "wrap" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ ...GA4_STYLES.metricCard, minWidth: 160 }}>
              <CardSkeleton height={80} />
            </div>
          ))
        ) : (
          vitals.map(v => (
            <div
              key={v.key}
              onClick={() => handleMetricSelect(v.key)}
              style={{
                ...GA4_STYLES.metricCard,
                minWidth: 160,
                cursor: "pointer",
                border: selectedMetric === v.key
                  ? `2px solid ${GA4_COLORS.primary}`
                  : `1px solid ${GA4_COLORS.border}`,
                boxShadow: selectedMetric === v.key ? `0 0 0 1px ${GA4_COLORS.primary}40` : undefined,
                transition: "border 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: GA4_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {v.label} <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: "0" }}>({v.fullName})</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 400, color: rateColor(v.p75, v.good, v.poor), lineHeight: 1.3, marginTop: 4 }}>
                {v.label === "CLS" ? v.p75.toFixed(3) : `${Math.round(v.p75)}`}
                <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>{v.unit}</span>
              </div>
              <div style={{ fontSize: 12, color: rateColor(v.p75, v.good, v.poor), marginTop: 2 }}>
                {rateLabel(v.p75, v.good, v.poor)} (p75)
              </div>
              <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 4 }}>
                avg: {v.label === "CLS" ? v.avg.toFixed(3) : `${Math.round(v.avg)}${v.unit}`}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Vital trend chart — driven by selected tile */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>
          {(vitals.find(v => v.key === selectedMetric)?.label ?? "LCP")} (p75) over time
        </div>
        {loading || trendLoading ? <CardSkeleton height={240} /> : (() => {
          const sv = vitals.find(v => v.key === selectedMetric);
          const chartColor = sv ? rateColor(sv.p75, sv.good, sv.poor) : GA4_COLORS.primary;
          const ragThresholds: ChartThreshold[] = sv ? [
            { value: sv.good, color: GA4_COLORS.positive, label: "Good" },
            { value: sv.poor, color: GA4_COLORS.negative, label: "Poor" },
          ] : [];
          return (
            <AreaChart
              data={trendData}
              color={chartColor}
              label={`${sv?.label ?? "LCP"} p75${selectedMetric === "cls" ? "" : " (ms)"}`}
              thresholds={ragThresholds}
            />
          );
        })()}
      </div>

      {/* By page */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Web vitals by page</div>
        {loading ? <CardSkeleton height={320} /> : (
          <DataTable
            columns={[
              { key: "page.url.path", label: "Page", width: "35%" },
              { key: "lcp_p75", label: "LCP p75 (ms)", align: "right", width: "15%",
                format: v => `${Math.round(Number(v))}` },
              { key: "fcp_p75", label: "FCP p75 (ms)", align: "right", width: "15%",
                format: v => `${Math.round(Number(v))}` },
              { key: "cls_p75", label: "CLS p75", align: "right", width: "12%",
                format: v => Number(v).toFixed(3) },
              { key: "samples", label: "Samples", align: "right", showBar: true, width: "15%",
                format: v => Number(v).toLocaleString() },
            ]}
            data={byPage}
            maxRows={15}
          />
        )}
      </div>

      {/* Pages failing CWV thresholds */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={GA4_STYLES.sectionTitle}>Pages failing Core Web Vitals</div>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            background: GA4_COLORS.negative + "18", color: GA4_COLORS.negative,
          }}>ACTION NEEDED</span>
        </div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          High-traffic pages (≥30 samples) exceeding at least one CWV threshold. Sorted by session volume.
        </p>
        {loading ? <CardSkeleton height={320} /> : failingPages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: GA4_COLORS.positive, fontWeight: 500 }}>
            All pages pass Core Web Vitals thresholds
          </div>
        ) : (
          <DataTable
            columns={[
              { key: "Page", label: "Page", width: "22%" },
              { key: "Sessions", label: "Sessions", align: "right", showBar: true, width: "10%",
                format: v => Number(v).toLocaleString() },
              { key: "LCP_P75", label: "LCP (ms)", align: "right", width: "10%",
                format: v => { const n = Number(v); return n > 0 ? `${Math.round(n)}` : "—"; } },
              { key: "LCP_SLO", label: "", align: "center", width: "4%",
                format: v => v === "pass" ? "✅" : "❌" },
              { key: "CLS_P75", label: "CLS", align: "right", width: "10%",
                format: v => { const n = Number(v); return n > 0 ? n.toFixed(3) : "—"; } },
              { key: "CLS_SLO", label: "", align: "center", width: "4%",
                format: v => v === "pass" ? "✅" : "❌" },
              { key: "INP_P75", label: "INP (ms)", align: "right", width: "10%",
                format: v => { const n = Number(v); return n > 0 ? `${Math.round(n)}` : "—"; } },
              { key: "INP_SLO", label: "", align: "center", width: "4%",
                format: v => v === "pass" ? "✅" : "❌" },
              { key: "FCP_P75", label: "FCP (ms)", align: "right", width: "8%",
                format: v => { const n = Number(v); return n > 0 ? `${Math.round(n)}` : "—"; } },
              { key: "FCP_SLO", label: "", align: "center", width: "4%",
                format: v => v === "pass" ? "✅" : "❌" },
              { key: "TTFB_P75", label: "TTFB (ms)", align: "right", width: "8%",
                format: v => { const n = Number(v); return n > 0 ? `${Math.round(n)}` : "—"; } },
              { key: "TTFB_SLO", label: "", align: "center", width: "4%",
                format: v => v === "pass" ? "✅" : "❌" },
            ]}
            data={failingPages}
            maxRows={10}
          />
        )}
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
