/**
 * pages/ErrorsPage.tsx
 *
 * Errors & Performance page.
 * Shows JS error counts, top error messages, errors by page, and page load distribution.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql, executeDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface ErrorsPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  globalFilterB?: string;
  onLoading?: () => void;
  onLoadEnd?: () => void;
}

export function ErrorsPage({ appId, timeframe, refreshKey, globalFilter, globalFilterB, onLoading, onLoadEnd }: ErrorsPageProps) {
  const [totalErrors, setTotalErrors] = useState(0);
  const [affectedSessions, setAffectedSessions] = useState(0);
  const [affectedUsers, setAffectedUsers] = useState(0);
  const [errorsTrend, setErrorsTrend] = useState<TimeSeriesPoint[]>([]);
  const [topMessages, setTopMessages] = useState<Record<string, unknown>[]>([]);
  const [errorsByPage, setErrorsByPage] = useState<Record<string, unknown>[]>([]);
  const [errorTypes, setErrorTypes] = useState<ErrorTypeRow[]>([]);
  const [loadDist, setLoadDist] = useState<BarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [excludeMarketing, setExcludeMarketing] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    onLoading?.();
    try {
      const results = await executeMultipleDql({
        kpis:     Q.errorsKPIs(appId, timeframe, excludeMarketing),
        trend:    Q.errorsOverTime(appId, timeframe, excludeMarketing),
        messages: Q.errorsTopMessages(appId, timeframe, excludeMarketing),
        byPage:   Q.errorsByPage(appId, timeframe, excludeMarketing),
        byType:   Q.errorsByType(appId, timeframe, excludeMarketing),
        loadDist: Q.pageLoadDistribution(appId, timeframe),
      });

      const kpiRow = results.kpis[0];
      if (kpiRow) {
        setTotalErrors(Number(kpiRow["totalErrors"]) || 0);
        setAffectedSessions(Number(kpiRow["affectedSessions"]) || 0);
        setAffectedUsers(Number(kpiRow["affectedUsers"]) || 0);
      }

      setErrorsTrend(extractTimeseries(results.trend));
      setTopMessages(results.messages);
      setErrorsByPage(results.byPage);

      setErrorTypes(results.byType.map(r => {
        const errType = String(r["error.type"] ?? "unknown");
        const errSource = String(r["error.source"] ?? "—");
        const errors = Number(r["errors"]) || 0;
        const sessions = Number(r["sessions"]) || 0;
        return {
          type: errType,
          source: errSource === "null" ? "—" : errSource,
          errors,
          sessions,
          impact: classifyImpact(errType, errSource),
        };
      }));

      const order = ["<1s", "1-2s", "2-3s", "3-5s", "5-10s", ">10s"];
      setLoadDist(
        results.loadDist
          .filter(r => r["loadBucket"])
          .sort((a, b) => order.indexOf(String(a["loadBucket"])) - order.indexOf(String(b["loadBucket"])))
          .map(r => ({ label: String(r["loadBucket"]), value: Number(r["pages"]) || 0 }))
      );
    } catch (err) {
      console.error("[Errors] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, excludeMarketing]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
            Errors & performance
          </h1>
          <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
            JavaScript errors and page load performance
          </p>
        </div>
        {/* Marketing/analytics filter toggle */}
        <button
          onClick={() => setExcludeMarketing(v => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 20,
            border: `1px solid ${excludeMarketing ? GA4_COLORS.primary : GA4_COLORS.border}`,
            background: excludeMarketing ? GA4_COLORS.primaryBg : "transparent",
            color: excludeMarketing ? GA4_COLORS.primary : GA4_COLORS.textSecondary,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
            outline: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {/* Toggle pill */}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            width: 32,
            height: 18,
            borderRadius: 9,
            background: excludeMarketing ? GA4_COLORS.primary : GA4_COLORS.border,
            padding: 2,
            transition: "background 0.2s",
          }}>
            <span style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              transform: excludeMarketing ? "translateX(14px)" : "translateX(0)",
              transition: "transform 0.2s",
            }} />
          </span>
          Hide marketing &amp; analytics
        </button>
      </div>

      {excludeMarketing && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 6,
          background: `${GA4_COLORS.primary}08`,
          border: `1px solid ${GA4_COLORS.primary}20`,
          fontSize: 12,
          color: GA4_COLORS.textSecondary,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill={GA4_COLORS.primary}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          Filtering out failed requests to known marketing, analytics, ad networks, consent managers, A/B testing, and tracking services.
          These are third-party scripts that do not affect user experience when they fail.
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total Errors" value={totalErrors} loading={loading} />
        <MetricCard label="Affected Sessions" value={affectedSessions} loading={loading} />
        <MetricCard label="Affected Users" value={affectedUsers} loading={loading} />
      </div>

      {/* Error trend */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Errors over time</div>
        {loading ? <CardSkeleton height={240} /> : (
          <AreaChart data={errorsTrend} color={GA4_COLORS.negative} label="Errors" />
        )}
      </div>

      {/* Error types breakdown */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={GA4_STYLES.sectionTitle}>Error types</div>
            <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginTop: 2 }}>
              Breakdown by type &amp; source with guest impact classification
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: GA4_COLORS.textTertiary, flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: GA4_COLORS.negative, display: "inline-block" }} />
              User impacting
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
              Investigate
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", display: "inline-block" }} />
              Marketing
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: GA4_COLORS.textTertiary, display: "inline-block" }} />
              Benign
            </span>
          </div>
        </div>
        {loading ? <CardSkeleton height={300} /> : (
          <ErrorTypesTable data={errorTypes} appId={appId} timeframe={timeframe} excludeMarketing={excludeMarketing} />
        )}
      </div>

      {/* Top error messages */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top error messages</div>
        {loading ? <CardSkeleton height={320} /> : (
          <TopMessagesTable data={topMessages} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Errors by page */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Errors by page</div>
          {loading ? <CardSkeleton height={320} /> : (
            <DataTable
              columns={[
                { key: "page.url.path", label: "Page" },
                { key: "errors", label: "Errors", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "25%" },
                { key: "sessions", label: "Sessions", align: "right",
                  format: v => Number(v).toLocaleString(), width: "25%" },
              ]}
              data={errorsByPage}
              maxRows={15}
            />
          )}
        </div>

        {/* Page load distribution */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Page load time distribution</div>
          {loading ? <CardSkeleton height={320} /> : (
            <BarChart data={loadDist} color={GA4_COLORS.primary} maxBars={6} />
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

// ── Error type impact classification ────────────────────────────────────────

interface ErrorTypeRow {
  type:     string;
  source:   string;
  errors:   number;
  sessions: number;
  impact:   "user-impacting" | "investigate" | "benign";
}

type ImpactLevel = "user-impacting" | "investigate" | "benign" | "marketing";

/**
 * Classify error impact based on type and source.
 *
 * User impacting: crashes, JS exceptions, failed XHR/fetch requests that users see
 * Investigate: promise rejections, console errors (may or may not affect UX)
 * Benign: CSP violations (security policy noise, not user-visible)
 */
function classifyImpact(errType: string, errSource: string): "user-impacting" | "investigate" | "benign" {
  if (errType === "crash") return "user-impacting";
  if (errType === "csp") return "benign";
  if (errType === "exception" && errSource === "exception") return "user-impacting";
  if (errType === "request" && (errSource === "fetch" || errSource === "xhr")) return "user-impacting";
  if (errType === "exception" && errSource === "console") return "investigate";
  if (errType === "exception" && errSource === "promise_rejection") return "investigate";
  if (errType === "request" && errSource === "—") return "investigate";
  return "investigate";
}

/** Check if an error display name matches a known marketing/analytics pattern */
function isMarketingError(displayName: string): boolean {
  const lower = displayName.toLowerCase();
  return Q.MARKETING_ANALYTICS_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

/** Classify a top-message row, optionally marking marketing request errors */
function classifyMessageImpact(errType: string, displayName: string): ImpactLevel {
  if (errType === "request" && isMarketingError(displayName)) return "marketing";
  return classifyImpact(errType, errType === "request" ? "fetch" : errType === "exception" ? "exception" : "—");
}

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; color: string }> = {
  "user-impacting": { label: "User impacting", color: GA4_COLORS.negative },
  "investigate":     { label: "Investigate",      color: "#f59e0b" },
  "benign":          { label: "Benign",           color: GA4_COLORS.textTertiary },
  "marketing":       { label: "Marketing",        color: "#8b5cf6" },
};

function ErrorTypesTable({ data, appId, timeframe, excludeMarketing }: { data: ErrorTypeRow[]; appId: string; timeframe: string; excludeMarketing: boolean }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<Record<string, unknown>[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleRowClick = async (idx: number, row: ErrorTypeRow) => {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      return;
    }
    setExpandedIdx(idx);
    setDetailLoading(true);
    setDetailData([]);
    try {
      const query = Q.errorTypeDetail(appId, timeframe, row.type, row.source, excludeMarketing);
      const records = await executeDql(query);
      setDetailData(records);
    } catch (err) {
      console.error("[ErrorDetail] fetch error:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  if (data.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>
        No data available
      </div>
    );
  }

  const maxErrors = Math.max(...data.map(d => d.errors), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...GA4_STYLES.tableHeader, width: "3%" }}></th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "13%" }}>Type</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "13%" }}>Source</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "15%" }}>Impact</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "11%" }}>Errors</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "11%" }}>Sessions</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "34%" }}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const impact = IMPACT_CONFIG[row.impact];
            const barPct = (row.errors / maxErrors) * 100;
            const isExpanded = expandedIdx === idx;

            return (
              <React.Fragment key={idx}>
                <tr
                  onClick={() => handleRowClick(idx, row)}
                  style={{
                    background: isExpanded ? `${GA4_COLORS.primary}08` : idx % 2 === 0 ? "transparent" : "#fafafa",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#f1f3f4"; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "#fafafa"; }}
                >
                  <td style={{ ...GA4_STYLES.tableCell, fontSize: 10, color: GA4_COLORS.textTertiary, textAlign: "center" }}>
                    {isExpanded ? "▼" : "▶"}
                  </td>
                  <td style={GA4_STYLES.tableCell}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 500,
                      background: row.type === "crash" ? `${GA4_COLORS.negative}18` :
                                  row.type === "exception" ? `${GA4_COLORS.chart[3]}18` :
                                  row.type === "request" ? `${GA4_COLORS.primary}18` :
                                  `${GA4_COLORS.textTertiary}22`,
                      color: row.type === "crash" ? GA4_COLORS.negative :
                             row.type === "exception" ? GA4_COLORS.chart[3] :
                             row.type === "request" ? GA4_COLORS.primary :
                             GA4_COLORS.textTertiary,
                    }}>
                      {row.type}
                    </span>
                  </td>
                  <td style={{ ...GA4_STYLES.tableCell, fontSize: 13 }}>{row.source}</td>
                  <td style={GA4_STYLES.tableCell}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 500,
                      color: impact.color,
                    }}>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: impact.color,
                        flexShrink: 0,
                      }} />
                      {impact.label}
                    </span>
                  </td>
                  <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {row.errors.toLocaleString()}
                  </td>
                  <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.sessions.toLocaleString()}
                  </td>
                  <td style={{ ...GA4_STYLES.tableCell, paddingRight: 16 }}>
                    <div style={{
                      height: 16,
                      width: "100%",
                      background: GA4_COLORS.pageBg,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${barPct}%`,
                        background: impact.color,
                        opacity: 0.6,
                        borderRadius: 3,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} style={{ padding: 0, border: "none" }}>
                      <ErrorDetailPanel
                        row={row}
                        data={detailData}
                        loading={detailLoading}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Error detail panel (shown on row expand) ────────────────────────────────

function ErrorDetailPanel({ row, data, loading }: { row: ErrorTypeRow; data: Record<string, unknown>[]; loading: boolean }) {
  const impact = IMPACT_CONFIG[row.impact];

  const IMPACT_DESCRIPTIONS: Record<string, string> = {
    "user-impacting": "These errors directly affect the user experience. Failed API requests break page functionality, JS exceptions cause UI glitches, and crashes end the session entirely. Prioritise fixing these.",
    "investigate": "These errors may or may not affect guests. Console errors and promise rejections can indicate background issues that degrade performance without visible failures. Review the top messages to assess real impact.",
    "benign": "Content Security Policy (CSP) violations are security-policy noise triggered by blocked third-party scripts or inline styles. They do not cause visible errors for guests and are typically safe to ignore unless you are tightening CSP rules.",
    "marketing": "These are failed requests to third-party marketing, analytics, advertising, and tracking services (e.g. Google Analytics, Facebook Pixel, TikTok, Hotjar). They inflate error counts but do not affect the user experience. Use the toggle to filter them out.",
  };

  return (
    <div style={{
      background: `${GA4_COLORS.primary}04`,
      borderLeft: `3px solid ${impact.color}`,
      padding: "16px 20px 16px 24px",
      margin: "0 0 2px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 13,
          fontWeight: 600,
          color: impact.color,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: impact.color }} />
          {impact.label}
        </span>
        <span style={{ fontSize: 13, color: GA4_COLORS.textSecondary }}>
          — {row.type}{row.source !== "—" ? ` / ${row.source}` : ""}
        </span>
        <span style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginLeft: "auto" }}>
          {row.errors.toLocaleString()} errors across {row.sessions.toLocaleString()} sessions
        </span>
      </div>

      {/* Impact description */}
      <div style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: GA4_COLORS.textSecondary,
        marginBottom: 16,
        padding: "8px 12px",
        background: GA4_COLORS.cardBg,
        borderRadius: 6,
        border: `1px solid ${GA4_COLORS.border}`,
      }}>
        {IMPACT_DESCRIPTIONS[row.impact]}
      </div>

      {/* Top messages for this type */}
      <div style={{ fontSize: 12, fontWeight: 600, color: GA4_COLORS.textPrimary, marginBottom: 8 }}>
        Top error messages in this group
      </div>
      {loading ? (
        <div style={{ padding: 16, textAlign: "center", color: GA4_COLORS.textTertiary, fontSize: 13 }}>
          Loading detail...
        </div>
      ) : data.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: GA4_COLORS.textTertiary, fontSize: 13 }}>
          No named error messages found for this type
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...GA4_STYLES.tableHeader, fontSize: 11 }}>Error message</th>
                <th style={{ ...GA4_STYLES.tableHeader, fontSize: 11, textAlign: "right", width: "15%" }}>Count</th>
                <th style={{ ...GA4_STYLES.tableHeader, fontSize: 11, textAlign: "right", width: "15%" }}>Sessions</th>
                <th style={{ ...GA4_STYLES.tableHeader, fontSize: 11, width: "25%" }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxOcc = Math.max(...data.map(r => Number(r["occurrences"]) || 0), 1);
                return data.map((r, i) => {
                  const occ = Number(r["occurrences"]) || 0;
                  const sess = Number(r["sessions"]) || 0;
                  const barPct = (occ / maxOcc) * 100;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#fafafa" }}>
                      <td style={{ ...GA4_STYLES.tableCell, fontSize: 12, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {String(r["error.display_name"] ?? "—")}
                      </td>
                      <td style={{ ...GA4_STYLES.tableCell, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {occ.toLocaleString()}
                      </td>
                      <td style={{ ...GA4_STYLES.tableCell, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {sess.toLocaleString()}
                      </td>
                      <td style={{ ...GA4_STYLES.tableCell, paddingRight: 12 }}>
                        <div style={{ height: 12, width: "100%", background: GA4_COLORS.pageBg, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${barPct}%`,
                            background: impact.color,
                            opacity: 0.5,
                            borderRadius: 2,
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Top messages table with impact badge ────────────────────────────────────

function TopMessagesTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>
        No data available
      </div>
    );
  }

  const maxOcc = Math.max(...data.map(r => Number(r["occurrences"]) || 0), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...GA4_STYLES.tableHeader, width: "42%" }}>Error message</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "10%" }}>Type</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "13%" }}>Impact</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>Count</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>Sessions</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "15%" }}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row, idx) => {
            const errType = String(row["error.type"] ?? "unknown");
            const displayName = String(row["error.display_name"] ?? "");
            const impact = classifyMessageImpact(errType, displayName);
            const impactCfg = IMPACT_CONFIG[impact];
            const occ = Number(row["occurrences"]) || 0;
            const sess = Number(row["sessions"]) || 0;
            const barPct = (occ / maxOcc) * 100;

            return (
              <tr
                key={idx}
                style={{ background: idx % 2 === 0 ? "transparent" : "#fafafa" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f1f3f4")}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "#fafafa")}
              >
                <td style={{ ...GA4_STYLES.tableCell, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(row["error.display_name"] ?? "—")}
                </td>
                <td style={GA4_STYLES.tableCell}>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 500,
                    background: errType === "crash" ? `${GA4_COLORS.negative}18` :
                                errType === "exception" ? `${GA4_COLORS.chart[3]}18` :
                                errType === "request" ? `${GA4_COLORS.primary}18` :
                                `${GA4_COLORS.textTertiary}22`,
                    color: errType === "crash" ? GA4_COLORS.negative :
                           errType === "exception" ? GA4_COLORS.chart[3] :
                           errType === "request" ? GA4_COLORS.primary :
                           GA4_COLORS.textTertiary,
                  }}>
                    {errType}
                  </span>
                </td>
                <td style={GA4_STYLES.tableCell}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    color: impactCfg.color,
                  }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: impactCfg.color,
                      flexShrink: 0,
                    }} />
                    {impactCfg.label}
                  </span>
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  {occ.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {sess.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 16 }}>
                  <div style={{ height: 14, width: "100%", background: GA4_COLORS.pageBg, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${barPct}%`,
                      background: impactCfg.color,
                      opacity: 0.5,
                      borderRadius: 3,
                      transition: "width 0.3s ease",
                    }} />
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
