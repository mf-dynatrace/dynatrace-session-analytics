/**
 * pages/EngagementPage.tsx
 *
 * GA4-style Engagement page.
 * Shows top pages, landing pages, events, session duration distribution, pages per session.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { DonutChart } from "../components/DonutChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface EngagementPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
}

export function EngagementPage({ appId, timeframe, refreshKey }: EngagementPageProps) {
  const [topPages, setTopPages] = useState<Record<string, unknown>[]>([]);
  const [landingPages, setLandingPages] = useState<Record<string, unknown>[]>([]);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [durationDist, setDurationDist] = useState<BarItem[]>([]);
  const [pagesPerSession, setPagesPerSession] = useState<{ label: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        topPages:   Q.engagementTopPages(appId, timeframe),
        landing:    Q.engagementLandingPages(appId, timeframe),
        events:     Q.engagementEvents(appId, timeframe),
        duration:   Q.engagementSessionDuration(appId, timeframe),
        pps:        Q.engagementPagesPerSession(appId, timeframe),
      });

      setTopPages(results.topPages);
      setLandingPages(results.landing);
      setEvents(results.events);

      // Duration distribution
      const durationOrder = ["0-10s", "10-30s", "30-60s", "1-3m", "3-10m", "10-30m", "30m+"];
      const durationMap = new Map<string, number>();
      results.duration.forEach(r => {
        durationMap.set(String(r["durationBucket"]), Number(r["sessions"]) || 0);
      });
      setDurationDist(durationOrder
        .filter(k => durationMap.has(k))
        .map(k => ({ label: k, value: durationMap.get(k)! }))
      );

      // Pages per session
      setPagesPerSession(
        results.pps
          .filter(r => r["pageBucket"])
          .map(r => ({ label: String(r["pageBucket"]), value: Number(r["sessions"]) || 0 }))
      );
    } catch (err) {
      console.error("[Engagement] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // Compute summary KPIs from top pages
  const totalPageViews = topPages.reduce((s, r) => s + (Number(r["views"]) || 0), 0);
  const uniquePages = topPages.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          User behavior
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand how users interact with your site
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Page Views" value={totalPageViews} loading={loading} />
        <MetricCard label="Unique Pages" value={uniquePages} loading={loading} />
        <MetricCard label="Event Types" value={events.length} loading={loading} />
      </div>

      {/* Duration + Pages per session */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Session duration distribution</div>
          {loading ? <CardSkeleton height={280} /> : (
            <BarChart data={durationDist} color={GA4_COLORS.primary} />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Pages per session</div>
          {loading ? <CardSkeleton height={280} /> : (
            <DonutChart data={pagesPerSession} />
          )}
        </div>
      </div>

      {/* Top pages table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Pages and screens</div>
        {loading ? <CardSkeleton height={400} /> : (
          <DataTable
            columns={[
              { key: "page.url.path", label: "Page Path" },
              { key: "views", label: "Views", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "15%" },
              { key: "uniqueUsers", label: "Users", align: "right",
                format: v => Number(v).toLocaleString(), width: "12%" },
              { key: "avgDuration", label: "Avg Time", align: "right",
                format: v => formatDuration(Number(v)), width: "12%" },
            ]}
            data={topPages}
            maxRows={20}
          />
        )}
      </div>

      {/* Landing pages table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Landing pages</div>
        {loading ? <CardSkeleton height={320} /> : (
          <DataTable
            columns={[
              { key: "landingPage", label: "Page Path" },
              { key: "entrances", label: "Entrances", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "20%" },
            ]}
            data={landingPages}
            maxRows={15}
          />
        )}
      </div>

      {/* Events table */}
      {events.length > 0 && (
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Events</div>
          <DataTable
            columns={[
              { key: "event.name", label: "Event Name" },
              { key: "eventCount", label: "Count", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "20%" },
              { key: "users", label: "Users", align: "right",
                format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={events}
            maxRows={15}
          />
        </div>
      )}
    </div>
  );
}

function formatDuration(ns: number): string {
  if (!ns || ns <= 0) return "0s";
  const sec = ns / 1_000_000_000;
  if (sec < 60) return `${sec.toFixed(0)}s`;
  return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
}
