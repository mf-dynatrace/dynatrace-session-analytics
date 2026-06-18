/**
 * pages/AcquisitionPage.tsx
 *
 * GA4-style Acquisition page.
 * Shows traffic channels, sources, new vs returning users.
 * Supports segment A/B comparison when globalFilterB is provided.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DonutChart } from "../components/DonutChart";
import { DataTable } from "../components/DataTable";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

const COLOR_A = "#1a73e8";
const COLOR_B = "#e03e2d";

interface AcquisitionPageProps {
  appId: string;
  timeframe: string;
  globalFilter?: string;
  globalFilterB?: string;
  refreshKey: number;
  onLoadEnd?: () => void;
}

// ── Shared data shape ─────────────────────────────────────────────────

interface PageData {
  channelData: Record<string, unknown>[];
  sourceData: Record<string, unknown>[];
  deviceData: { label: string; value: number }[];
  totalUsers: number;
  totalSessions: number;
}

async function fetchPageData(
  appId: string,
  timeframe: string,
  filter: string
): Promise<PageData> {
  const results = await executeMultipleDql({
    channels: Q.withFilter(Q.acquisitionByChannel(appId, timeframe), filter),
    sources: Q.withFilter(Q.acquisitionBySource(appId, timeframe), filter),
    nvr: Q.withFilter(Q.acquisitionNewVsReturning(appId, timeframe), filter),
  });

  let totalUsers = 0,
    totalSessions = 0;
  results.channels.forEach(r => {
    totalUsers += Number(r["users"]) || 0;
    totalSessions += Number(r["sessions"]) || 0;
  });

  const deviceData = results.nvr
    .filter(r => r["device.type"])
    .map(r => ({ label: String(r["device.type"]), value: Number(r["users"]) || 0 }));

  return { channelData: results.channels, sourceData: results.sources, deviceData, totalUsers, totalSessions };
}

// ── Merged A/B table helper ───────────────────────────────────────────

function mergeAB(
  dataA: Record<string, unknown>[],
  dataB: Record<string, unknown>[],
  keyField: string,
  metrics: string[]
): Record<string, unknown>[] {
  const mapB = new Map(dataB.map(r => [String(r[keyField]), r]));
  return dataA.map(rowA => {
    const rowB = mapB.get(String(rowA[keyField])) ?? {};
    const merged: Record<string, unknown> = { [keyField]: rowA[keyField] };
    for (const f of metrics) {
      merged[`${f}_a`] = rowA[f] ?? 0;
      merged[`${f}_b`] = (rowB as Record<string, unknown>)[f] ?? 0;
    }
    return merged;
  });
}

// ── Compare table ──────────────────────────────────────────────────────

interface CompareTableProps {
  data: Record<string, unknown>[];
  keyField: string;
  keyLabel: string;
  metrics: { field: string; label: string }[];
}

function CompareTable({ data, keyField, keyLabel, metrics }: CompareTableProps) {
  if (data.length === 0)
    return (
      <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>
        No data
      </div>
    );

  const mainMetric = metrics[0].field;
  const maxA = Math.max(...data.map(r => Number(r[`${mainMetric}_a`]) || 0), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={GA4_STYLES.tableHeader}>{keyLabel}</th>
            {metrics.map(m => (
              <React.Fragment key={m.field}>
                <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "11%" }}>
                  <span style={{ color: COLOR_A }}>{m.label} A</span>
                </th>
                <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "11%" }}>
                  <span style={{ color: COLOR_B }}>{m.label} B</span>
                </th>
                <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "9%" }}>
                  Δ
                </th>
              </React.Fragment>
            ))}
            <th style={{ ...GA4_STYLES.tableHeader, width: "18%" }}>A vs B</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const aVal = Number(row[`${mainMetric}_a`]) || 0;
            return (
              <tr
                key={idx}
                style={{
                  background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e =>
                  (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")
                }
              >
                <td style={GA4_STYLES.tableCell}>{String(row[keyField])}</td>
                {metrics.map(m => {
                  const a = Number(row[`${m.field}_a`]) || 0;
                  const b = Number(row[`${m.field}_b`]) || 0;
                  const diff = a > 0 ? ((b - a) / a) * 100 : null;
                  return (
                    <React.Fragment key={m.field}>
                      <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A, fontWeight: 500 }}>
                        {a.toLocaleString()}
                      </td>
                      <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B, fontWeight: 500 }}>
                        {b.toLocaleString()}
                      </td>
                      <td style={{ ...GA4_STYLES.tableCell, textAlign: "right" }}>
                        {diff !== null ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 8,
                              background: diff >= 0 ? "#e6f4ea" : "#fce8e6",
                              color: diff >= 0 ? "#2d7a3a" : "#c0392b",
                            }}
                          >
                            {diff >= 0 ? "+" : ""}
                            {diff.toFixed(0)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </React.Fragment>
                  );
                })}
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 16 }}>
                  <div
                    style={{
                      height: 14,
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 3,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {(() => {
                      const bVal = Number(row[`${mainMetric}_b`]) || 0;
                      const maxAB = Math.max(aVal, bVal, 1);
                      const bPct = (bVal / maxAB) * 100;
                      const aPct2 = (aVal / maxAB) * 100;
                      return (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              height: "50%",
                              width: `${aPct2}%`,
                              background: COLOR_A,
                              opacity: 0.7,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              height: "50%",
                              width: `${bPct}%`,
                              background: COLOR_B,
                              opacity: 0.7,
                            }}
                          />
                        </>
                      );
                    })()}
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

// ── Side-by-side donut pair ───────────────────────────────────────────

function DonutPair({
  dataA,
  dataB,
  title,
  loading,
  colors,
}: {
  dataA: { label: string; value: number }[];
  dataB: { label: string; value: number }[];
  title: string;
  loading: boolean;
  colors?: readonly string[];
}) {
  return (
    <div style={GA4_STYLES.card} className="ga4-animate">
      <div style={GA4_STYLES.sectionTitle}>{title}</div>
      {loading ? (
        <CardSkeleton height={220} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>
              SEGMENT A
            </div>
            <DonutChart data={dataA} size={180} colors={colors} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>
              SEGMENT B
            </div>
            <DonutChart data={dataB} size={180} colors={colors} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export function AcquisitionPage({ appId, timeframe, globalFilter = "", globalFilterB, refreshKey, onLoadEnd }: AcquisitionPageProps) {
  const compareMode = globalFilterB !== undefined;

  const [dataA, setDataA] = useState<PageData>({ channelData: [], sourceData: [], deviceData: [], totalUsers: 0, totalSessions: 0 });
  const [dataB, setDataB] = useState<PageData>({ channelData: [], sourceData: [], deviceData: [], totalUsers: 0, totalSessions: 0 });
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
      console.error("[Acquisition] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter, globalFilterB, compareMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const channelDonutA = dataA.channelData
    .filter(r => r["channel"])
    .map(r => ({ label: String(r["channel"]), value: Number(r["sessions"]) || 0 }));

  const channelDonutB = dataB.channelData
    .filter(r => r["channel"])
    .map(r => ({ label: String(r["channel"]), value: Number(r["sessions"]) || 0 }));

  const mergedChannels = compareMode ? mergeAB(dataA.channelData, dataB.channelData, "channel", ["users", "sessions"]) : [];

  const mergedSources = compareMode ? mergeAB(dataA.sourceData, dataB.sourceData, "source", ["users", "sessions"]) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Traffic sources
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand where your users come from
          {compareMode && <span style={{ marginLeft: 8, fontSize: 12, color: GA4_COLORS.textTertiary }}>— comparing two segments</span>}
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard
          label="Total Users"
          value={dataA.totalUsers}
          loading={loading}
          compareValue={compareMode ? dataB.totalUsers : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
        <MetricCard
          label="Total Sessions"
          value={dataA.totalSessions}
          loading={loading}
          compareValue={compareMode ? dataB.totalSessions : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
        <MetricCard
          label="Channels"
          value={dataA.channelData.length}
          loading={loading}
          compareValue={compareMode ? dataB.channelData.length : undefined}
          compareLabel={compareMode ? "Segment A" : undefined}
          compareLabelB={compareMode ? "Segment B" : undefined}
        />
      </div>

      {/* Donuts */}
      {compareMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
          <DonutPair
            title="Sessions by channel"
            dataA={channelDonutA}
            dataB={channelDonutB}
            loading={loading}
          />
          <DonutPair
            title="Sessions by device type"
            dataA={dataA.deviceData}
            dataB={dataB.deviceData}
            loading={loading}
            colors={[GA4_COLORS.primary, GA4_COLORS.chart[4]]}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Sessions by channel</div>
            {loading ? <CardSkeleton height={220} /> : <DonutChart data={channelDonutA} />}
          </div>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Sessions by device type</div>
            {loading ? (
              <CardSkeleton height={220} />
            ) : (
              <DonutChart data={dataA.deviceData} colors={[GA4_COLORS.primary, GA4_COLORS.chart[4]]} />
            )}
          </div>
        </div>
      )}

      {/* Channel breakdown table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Traffic by channel</div>
        {loading ? (
          <CardSkeleton height={320} />
        ) : compareMode ? (
          <CompareTable
            data={mergedChannels}
            keyField="channel"
            keyLabel="Channel"
            metrics={[
              { field: "sessions", label: "Sessions" },
              { field: "users", label: "Users" },
            ]}
          />
        ) : (
          <DataTable
            columns={[
              { key: "channel", label: "Channel" },
              { key: "users", label: "Users", align: "right", showBar: true, format: v => Number(v).toLocaleString(), width: "15%" },
              { key: "sessions", label: "Sessions", align: "right", format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={dataA.channelData}
          />
        )}
      </div>

      {/* Top sources table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top traffic sources</div>
        {loading ? (
          <CardSkeleton height={320} />
        ) : compareMode ? (
          <CompareTable
            data={mergedSources}
            keyField="source"
            keyLabel="Source"
            metrics={[
              { field: "sessions", label: "Sessions" },
              { field: "users", label: "Users" },
            ]}
          />
        ) : (
          <DataTable
            columns={[
              { key: "source", label: "Source" },
              { key: "users", label: "Users", align: "right", showBar: true, format: v => Number(v).toLocaleString(), width: "20%" },
              { key: "sessions", label: "Sessions", align: "right", format: v => Number(v).toLocaleString(), width: "20%" },
            ]}
            data={dataA.sourceData}
            maxRows={15}
          />
        )}
      </div>
    </div>
  );
}
