/**
 * pages/UTMPage.tsx
 *
 * GA4-style UTM Campaigns page.
 * Sections mirror Google Analytics campaign reporting:
 *   1. Summary KPIs (sessions, users, campaigns, page views)
 *   2. Campaign performance table
 *   3. Source / Medium breakdown
 *   4. Campaign traffic over time
 *   5. Landing pages by campaign
 *   6. Content & Term (A/B test params)
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DataTable } from "../components/DataTable";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface UTMPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  onLoadEnd?: () => void;
}

export function UTMPage({ appId, timeframe, refreshKey, globalFilter, onLoadEnd }: UTMPageProps) {
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [campaigns, setCampaigns] = useState<Record<string, unknown>[]>([]);
  const [sourceMedium, setSourceMedium] = useState<Record<string, unknown>[]>([]);
  const [trend, setTrend] = useState<TimeSeriesPoint[]>([]);
  const [landingPages, setLandingPages] = useState<Record<string, unknown>[]>([]);
  const [contentTerm, setContentTerm] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        summary:      Q.utmSummary(appId, timeframe),
        campaigns:    Q.utmByCampaign(appId, timeframe),
        sourceMedium: Q.utmBySourceMedium(appId, timeframe),
        trend:        Q.utmOverTime(appId, timeframe),
        landingPages: Q.utmLandingPages(appId, timeframe),
        contentTerm:  Q.utmByContentTerm(appId, timeframe),
      });

      setSummary(results.summary[0] ?? {});

      // Decode URL-encoded values in all UTM result sets
      const decodeRow = (row: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...row };
        for (const [k, v] of Object.entries(out)) {
          if (typeof v === "string") {
            try { out[k] = decodeURIComponent(v); } catch { /* keep original */ }
          }
        }
        return out;
      };
      const decodeAll = (rows: unknown[]) =>
        (rows as Record<string, unknown>[]).map(decodeRow);

      setCampaigns(decodeAll(results.campaigns));
      setSourceMedium(decodeAll(results.sourceMedium));
      setLandingPages(decodeAll(results.landingPages));
      setContentTerm(decodeAll(results.contentTerm));

      // Parse timeseries for trend chart
      setTrend(extractTimeseries(results.trend));
    } catch (err) {
      console.error("[UTM] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const kpiSessions  = Number(summary["sessions"]  ?? 0);
  const kpiUsers     = Number(summary["users"]      ?? 0);
  const kpiCampaigns = Number(summary["campaigns"]  ?? 0);
  const kpiPageViews = Number(summary["pageViews"]  ?? 0);

  // Campaign bar chart data
  const campaignBars: BarItem[] = campaigns.map(r => ({
    label: String(r["utm_campaign"] ?? ""),
    value: Number(r["sessions"] ?? 0),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          UTM campaigns
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Analyse traffic from UTM-tagged campaign links
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Campaign sessions" value={kpiSessions.toLocaleString()} loading={loading} />
        <MetricCard label="Campaign users" value={kpiUsers.toLocaleString()} loading={loading} />
        <MetricCard label="Active campaigns" value={kpiCampaigns.toLocaleString()} loading={loading} />
        <MetricCard label="Campaign page views" value={kpiPageViews.toLocaleString()} loading={loading} />
      </div>

      {/* Campaign performance + chart row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Campaign table */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Campaigns</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Performance by utm_campaign parameter
          </p>
          {loading ? <CardSkeleton height={350} /> : (
            <DataTable
              columns={[
                { key: "utm_campaign", label: "Campaign", width: "40%" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: (v: unknown) => Number(v).toLocaleString(), width: "20%" },
                { key: "users", label: "Users", align: "right",
                  format: (v: unknown) => Number(v).toLocaleString(), width: "20%" },
                { key: "pageViews", label: "Page views", align: "right",
                  format: (v: unknown) => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={campaigns}
              maxRows={12}
            />
          )}
        </div>

        {/* Campaign traffic over time */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Campaign traffic over time</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Sessions from UTM-tagged URLs
          </p>
          {loading ? <CardSkeleton height={350} /> : (
            trend.length > 0 ? (
              <AreaChart data={trend} color={GA4_COLORS.chart[0]} height={300} />
            ) : (
              <div style={{ color: GA4_COLORS.textSecondary, textAlign: "center", padding: 60 }}>
                No UTM campaign traffic in this period
              </div>
            )
          )}
        </div>
      </div>

      {/* Source / Medium */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Source / Medium</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Breakdown by utm_source and utm_medium parameters
        </p>
        {loading ? <CardSkeleton height={300} /> : (
          <DataTable
            columns={[
              { key: "source", label: "Source", width: "30%" },
              { key: "medium", label: "Medium", width: "30%" },
              { key: "sessions", label: "Sessions", align: "right", showBar: true,
                format: (v: unknown) => Number(v).toLocaleString(), width: "20%" },
              { key: "users", label: "Users", align: "right",
                format: (v: unknown) => Number(v).toLocaleString(), width: "20%" },
            ]}
            data={sourceMedium}
            maxRows={15}
          />
        )}
      </div>

      {/* Landing pages + Campaign bar chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Landing pages */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Landing pages by campaign</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Where campaign traffic enters your site
          </p>
          {loading ? <CardSkeleton height={350} /> : (
            <DataTable
              columns={[
                { key: "landingPage", label: "Landing page", width: "40%" },
                { key: "utm_campaign", label: "Campaign", width: "35%" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: (v: unknown) => Number(v).toLocaleString(), width: "25%" },
              ]}
              data={landingPages}
              maxRows={12}
            />
          )}
        </div>

        {/* Top campaigns bar chart */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top campaigns</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Sessions by campaign
          </p>
          {loading ? <CardSkeleton height={350} /> : (
            <BarChart data={campaignBars} color={GA4_COLORS.chart[4]} maxBars={10} />
          )}
        </div>
      </div>

      {/* Content & Term */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Content & Term</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          utm_content and utm_term for ad creative testing and keyword tracking
        </p>
        {loading ? <CardSkeleton height={250} /> : (
          contentTerm.length > 0 ? (
            <DataTable
              columns={[
                { key: "content", label: "Content (utm_content)", width: "35%",
                  format: (v: unknown) => { const s = String(v); return /^\d{15,}$/.test(s) ? `…${s.slice(-8)}` : s; },
                  title: (v: unknown) => String(v) },
                { key: "term", label: "Term (utm_term)", width: "35%",
                  format: (v: unknown) => { const s = String(v); return /^\d{15,}$/.test(s) ? `…${s.slice(-8)}` : s; },
                  title: (v: unknown) => String(v) },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: (v: unknown) => Number(v).toLocaleString(), width: "30%" },
              ]}
              data={contentTerm}
              maxRows={15}
            />
          ) : (
            <div style={{ color: GA4_COLORS.textSecondary, textAlign: "center", padding: 40 }}>
              No utm_content or utm_term parameters found in this period
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Timeseries extraction helper ──────────────────────────────────────────────

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
  const intervalMs = intervalNs / 1_000_000;

  return values.map((v, i) => ({
    timestamp: startMs && intervalMs
      ? new Date(startMs + i * intervalMs).toISOString()
      : String(i),
    value: Number(v) || 0,
  }));
}
