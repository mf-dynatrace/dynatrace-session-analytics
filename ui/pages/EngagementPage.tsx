/**
 * pages/EngagementPage.tsx
 *
 * GA4-style Engagement page.
 * Shows top pages, landing pages, events, session duration distribution, pages per session.
 * Supports segment A/B comparison when globalFilterB is provided.
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

const COLOR_A = "#1a73e8";
const COLOR_B = "#e03e2d";

const DURATION_ORDER = ["0-10s", "10-30s", "30-60s", "1-3m", "3-10m", "10-30m", "30m+"];

interface EngagementPageProps {
  appId: string;
  timeframe: string;
  globalFilter?: string;
  globalFilterB?: string;
  refreshKey: number;
  onLoadEnd?: () => void;
}

// ── Data shape ────────────────────────────────────────────────────────────────

interface PageData {
  topPages:       Record<string, unknown>[];
  landingPages:   Record<string, unknown>[];
  events:         Record<string, unknown>[];
  durationDist:   BarItem[];
  pagesPerSession: { label: string; value: number }[];
}

async function fetchPageData(
  appId: string, timeframe: string, filter: string
): Promise<PageData> {
  const results = await executeMultipleDql({
    topPages: Q.withFilter(Q.engagementTopPages(appId, timeframe), filter),
    landing:  Q.withFilter(Q.engagementLandingPages(appId, timeframe), filter),
    events:   Q.withFilter(Q.engagementEvents(appId, timeframe), filter),
    duration: Q.withFilter(Q.engagementSessionDuration(appId, timeframe), filter),
    pps:      Q.withFilter(Q.engagementPagesPerSession(appId, timeframe), filter),
  });

  const durationMap = new Map<string, number>();
  results.duration.forEach(r => {
    durationMap.set(String(r["durationBucket"]), Number(r["sessions"]) || 0);
  });
  const durationDist = DURATION_ORDER
    .filter(k => durationMap.has(k))
    .map(k => ({ label: k, value: durationMap.get(k)! }));

  const pagesPerSession = results.pps
    .filter(r => r["pageBucket"])
    .map(r => ({ label: String(r["pageBucket"]), value: Number(r["sessions"]) || 0 }));

  return {
    topPages: results.topPages,
    landingPages: results.landing,
    events: results.events,
    durationDist,
    pagesPerSession,
  };
}

// ── Merged A/B page table ─────────────────────────────────────────────────────

function PagesCompareTable({
  dataA, dataB,
}: { dataA: Record<string, unknown>[]; dataB: Record<string, unknown>[] }) {
  const mapB = new Map(dataB.map(r => [String(r["page.url.path"]), r]));
  const merged = dataA.map(rowA => {
    const rowB = mapB.get(String(rowA["page.url.path"])) ?? {};
    return {
      path: String(rowA["page.url.path"]),
      views_a: Number(rowA["views"]) || 0,
      views_b: Number((rowB as Record<string, unknown>)["views"]) || 0,
      users_a: Number(rowA["uniqueUsers"]) || 0,
      users_b: Number((rowB as Record<string, unknown>)["uniqueUsers"]) || 0,
      avgDuration_a: Number(rowA["avgDuration"]) || 0,
      avgDuration_b: Number((rowB as Record<string, unknown>)["avgDuration"]) || 0,
    };
  });

  if (merged.length === 0) return (
    <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>No data</div>
  );

  const maxViews = Math.max(...merged.map(r => r.views_a), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={GA4_STYLES.tableHeader}>Page Path</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_A }}>Views A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_B }}>Views B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "8%" }}>Δ Views</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_A }}>Users A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_B }}>Users B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_A }}>Time A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>
              <span style={{ color: COLOR_B }}>Time B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "12%" }}>A vs B</th>
          </tr>
        </thead>
        <tbody>
          {merged.slice(0, 20).map((row, idx) => {
            const diff = row.views_a > 0 ? ((row.views_b - row.views_a) / row.views_a) * 100 : null;
            const maxAB = Math.max(row.views_a, row.views_b, 1);
            return (
              <tr key={idx}
                style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
              >
                <td style={{ ...GA4_STYLES.tableCell, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.path}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A, fontWeight: 500 }}>{row.views_a.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B, fontWeight: 500 }}>{row.views_b.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right" }}>
                  {diff !== null ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                      background: diff >= 0 ? "#e6f4ea" : "#fce8e6",
                      color: diff >= 0 ? "#2d7a3a" : "#c0392b",
                    }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>
                  ) : "—"}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A }}>{row.users_a.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B }}>{row.users_b.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A }}>{formatDuration(row.avgDuration_a)}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B }}>{formatDuration(row.avgDuration_b)}</td>
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 12 }}>
                  <div style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "50%", width: `${(row.views_a / maxAB) * 100}%`, background: COLOR_A, opacity: 0.7 }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, height: "50%", width: `${(row.views_b / maxAB) * 100}%`, background: COLOR_B, opacity: 0.7 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Dual bar chart (side by side) ─────────────────────────────────────────────

function DualBarChart({ dataA, dataB, title }: { dataA: BarItem[]; dataB: BarItem[]; title: string }) {
  return (
    <div style={GA4_STYLES.card} className="ga4-animate">
      <div style={GA4_STYLES.sectionTitle}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT A</div>
          <BarChart data={dataA} color={COLOR_A} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT B</div>
          <BarChart data={dataB} color={COLOR_B} />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EngagementPage({
  appId, timeframe, globalFilter = "", globalFilterB, refreshKey, onLoadEnd,
}: EngagementPageProps) {
  const compareMode = globalFilterB !== undefined;

  const [dataA, setDataA] = useState<PageData>({
    topPages: [], landingPages: [], events: [], durationDist: [], pagesPerSession: [],
  });
  const [dataB, setDataB] = useState<PageData>({
    topPages: [], landingPages: [], events: [], durationDist: [], pagesPerSession: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (compareMode) {
        const [a, b] = await Promise.all([
          fetchPageData(appId, timeframe, globalFilter),
          fetchPageData(appId, timeframe, globalFilterB!),
        ]);
        setDataA(a);
        setDataB(b);
      } else {
        const a = await fetchPageData(appId, timeframe, globalFilter);
        setDataA(a);
      }
    } catch (err) {
      console.error("[Engagement] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter, globalFilterB, compareMode]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const totalPageViewsA = dataA.topPages.reduce((s, r) => s + (Number(r["views"]) || 0), 0);
  const totalPageViewsB = dataB.topPages.reduce((s, r) => s + (Number(r["views"]) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          User behavior
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand how users interact with your site
          {compareMode && <span style={{ marginLeft: 8, fontSize: 12, color: GA4_COLORS.textTertiary }}>— comparing two segments</span>}
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard
          label="Page Views"
          value={totalPageViewsA}
          loading={loading}
          compareValue={compareMode ? totalPageViewsB : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
        <MetricCard
          label="Unique Pages"
          value={dataA.topPages.length}
          loading={loading}
          compareValue={compareMode ? dataB.topPages.length : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
        <MetricCard
          label="Event Types"
          value={dataA.events.length}
          loading={loading}
          compareValue={compareMode ? dataB.events.length : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
      </div>

      {/* Duration + Pages per session */}
      {compareMode ? (
        <>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
              <div style={GA4_STYLES.card}><CardSkeleton height={280} /></div>
              <div style={GA4_STYLES.card}><CardSkeleton height={280} /></div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
              <DualBarChart
                title="Session duration distribution"
                dataA={dataA.durationDist}
                dataB={dataB.durationDist}
              />
              <div style={GA4_STYLES.card} className="ga4-animate">
                <div style={GA4_STYLES.sectionTitle}>Pages per session</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT A</div>
                    <DonutChart data={dataA.pagesPerSession} size={160} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT B</div>
                    <DonutChart data={dataB.pagesPerSession} size={160} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Session duration distribution</div>
            {loading ? <CardSkeleton height={280} /> : (
              <BarChart data={dataA.durationDist} color={GA4_COLORS.primary} />
            )}
          </div>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Pages per session</div>
            {loading ? <CardSkeleton height={280} /> : (
              <DonutChart data={dataA.pagesPerSession} />
            )}
          </div>
        </div>
      )}

      {/* Top pages table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Pages and screens</div>
        {loading ? <CardSkeleton height={400} /> : compareMode ? (
          <PagesCompareTable dataA={dataA.topPages} dataB={dataB.topPages} />
        ) : (
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
            data={dataA.topPages}
            maxRows={20}
          />
        )}
      </div>

      {/* Landing pages table — single view only (too noisy in compare) */}
      {!compareMode && (
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Landing pages</div>
          {loading ? <CardSkeleton height={320} /> : (
            <DataTable
              columns={[
                { key: "landingPage", label: "Page Path" },
                { key: "entrances", label: "Entrances", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={dataA.landingPages}
              maxRows={15}
            />
          )}
        </div>
      )}

      {/* Events table */}
      {!compareMode && dataA.events.length > 0 && (
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
            data={dataA.events}
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
