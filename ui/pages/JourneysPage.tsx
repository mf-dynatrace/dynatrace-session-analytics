/**
 * pages/JourneysPage.tsx
 *
 * User Journeys page.
 * Shows page-to-page flows, Sankey diagram, exit pages, and top paths.
 * Supports segment A/B comparison when globalFilterB is provided.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { SankeyChart } from "../components/SankeyChart";
import { SunburstChart, extractPageCategories } from "../components/SunburstChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

const COLOR_A = "#1a73e8";
const COLOR_B = "#e03e2d";

interface JourneysPageProps {
  appId: string;
  timeframe: string;
  globalFilter?: string;
  globalFilterB?: string;
  refreshKey: number;
  onLoadEnd?: () => void;
}

// ── Compare table for flows and paths ─────────────────────────────────────────

function JourneyCompareTable({
  dataA, dataB, keyField, keyLabel, metricField, metricLabel,
}: {
  dataA: Record<string, unknown>[];
  dataB: Record<string, unknown>[];
  keyField: string;
  keyLabel: string;
  metricField: string;
  metricLabel: string;
}) {
  const mapB = new Map(dataB.map(r => [String(r[keyField]), r]));
  const merged = dataA.map(rowA => {
    const rowB = mapB.get(String(rowA[keyField])) ?? {};
    const a = Number(rowA[metricField]) || 0;
    const b = Number((rowB as Record<string, unknown>)[metricField]) || 0;
    return { key: String(rowA[keyField]), a, b };
  });

  if (merged.length === 0) return (
    <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>No data</div>
  );

  const maxAB = Math.max(...merged.map(r => Math.max(r.a, r.b)), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={GA4_STYLES.tableHeader}>{keyLabel}</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "16%" }}>
              <span style={{ color: COLOR_A }}>{metricLabel} A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "16%" }}>
              <span style={{ color: COLOR_B }}>{metricLabel} B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>Δ</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "22%" }}>A vs B</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((row, idx) => {
            const diff = row.a > 0 ? ((row.b - row.a) / row.a) * 100 : null;
            return (
              <tr key={idx}
                style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
              >
                <td style={GA4_STYLES.tableCell}>{row.key}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A, fontWeight: 500 }}>
                  {row.a.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B, fontWeight: 500 }}>
                  {row.b.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right" }}>
                  {diff !== null ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                      background: diff >= 0 ? "#e6f4ea" : "#fce8e6",
                      color: diff >= 0 ? "#2d7a3a" : "#c0392b",
                    }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>
                  ) : "—"}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 12 }}>
                  <div style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "50%", width: `${(row.a / maxAB) * 100}%`, background: COLOR_A, opacity: 0.7 }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, height: "50%", width: `${(row.b / maxAB) * 100}%`, background: COLOR_B, opacity: 0.7 }} />
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

// ── Dual bar chart (exit pages compare) ──────────────────────────────────────

function DualBarChart({ dataA, dataB, loading }: {
  dataA: BarItem[];
  dataB: BarItem[];
  loading: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>
          SEGMENT A
        </div>
        {loading ? <CardSkeleton height={200} /> : <BarChart data={dataA} color={COLOR_A} maxBars={8} />}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>
          SEGMENT B
        </div>
        {loading ? <CardSkeleton height={200} /> : <BarChart data={dataB} color={COLOR_B} maxBars={8} />}
      </div>
    </div>
  );
}

// ── Transitions compare table (fromPage + toPage concatenated as key) ─────────

function TransitionsCompareTable({
  dataA, dataB, loading,
}: {
  dataA: Record<string, unknown>[];
  dataB: Record<string, unknown>[];
  loading: boolean;
}) {
  if (loading) return <CardSkeleton height={400} />;

  const mapB = new Map(dataB.map(r => [`${r["fromPage"]}|${r["toPage"]}`, r]));
  const merged = dataA.slice(0, 15).map(rowA => {
    const key = `${rowA["fromPage"]}|${rowA["toPage"]}`;
    const rowB = mapB.get(key) ?? {};
    const a = Number(rowA["transitions"]) || 0;
    const b = Number((rowB as Record<string, unknown>)["transitions"]) || 0;
    return { from: String(rowA["fromPage"]), to: String(rowA["toPage"]), a, b };
  });

  if (merged.length === 0) return (
    <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>No data</div>
  );

  const maxAB = Math.max(...merged.map(r => Math.max(r.a, r.b)), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={GA4_STYLES.tableHeader}>From page</th>
            <th style={GA4_STYLES.tableHeader}>To page</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "14%" }}>
              <span style={{ color: COLOR_A }}>Trans. A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "14%" }}>
              <span style={{ color: COLOR_B }}>Trans. B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "9%" }}>Δ</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "20%" }}>A vs B</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((row, idx) => {
            const diff = row.a > 0 ? ((row.b - row.a) / row.a) * 100 : null;
            return (
              <tr key={idx}
                style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
              >
                <td style={GA4_STYLES.tableCell}>{row.from}</td>
                <td style={GA4_STYLES.tableCell}>{row.to}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A, fontWeight: 500 }}>
                  {row.a.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B, fontWeight: 500 }}>
                  {row.b.toLocaleString()}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right" }}>
                  {diff !== null ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                      background: diff >= 0 ? "#e6f4ea" : "#fce8e6",
                      color: diff >= 0 ? "#2d7a3a" : "#c0392b",
                    }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>
                  ) : "—"}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 12 }}>
                  <div style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "50%", width: `${(row.a / maxAB) * 100}%`, background: COLOR_A, opacity: 0.7 }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, height: "50%", width: `${(row.b / maxAB) * 100}%`, background: COLOR_B, opacity: 0.7 }} />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function JourneysPage({
  appId, timeframe, globalFilter = "", globalFilterB, refreshKey, onLoadEnd,
}: JourneysPageProps) {
  const compareMode = globalFilterB !== undefined;

  // Segment A state
  const [flowsA, setFlowsA] = useState<Record<string, unknown>[]>([]);
  const [sankeyDataA, setSankeyDataA] = useState<Record<string, unknown>[]>([]);
  const [exitPagesA, setExitPagesA] = useState<BarItem[]>([]);
  const [topPathsA, setTopPathsA] = useState<Record<string, unknown>[]>([]);
  const [totalSessionsA, setTotalSessionsA] = useState<number | null>(null);

  // Segment B state
  const [flowsB, setFlowsB] = useState<Record<string, unknown>[]>([]);
  const [sankeyDataB, setSankeyDataB] = useState<Record<string, unknown>[]>([]);
  const [exitPagesB, setExitPagesB] = useState<BarItem[]>([]);
  const [topPathsB, setTopPathsB] = useState<Record<string, unknown>[]>([]);
  const [totalSessionsB, setTotalSessionsB] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [sankeyLoading, setSankeyLoading] = useState(true);
  const [maxSteps, setMaxSteps] = useState(5);
  const [showAllFlows, setShowAllFlows] = useState(false);
  const [selectedPageA, setSelectedPageA] = useState<string | null>(null);
  const [selectedPageB, setSelectedPageB] = useState<string | null>(null);

  const fetchSegment = useCallback(async (filter: string) => {
    const results = await executeMultipleDql({
      flows:   Q.withFilter(Q.journeyPageFlows(appId, timeframe), filter),
      exits:   Q.withFilter(Q.journeyExitPages(appId, timeframe), filter),
      paths:   Q.withFilter(Q.journeyTopPaths(appId, timeframe), filter),
      sessionCount: Q.withFilter(Q.journeySessionCount(appId, timeframe), filter),
    });
    return {
      flows: results.flows,
      exits: results.exits
        .filter(r => r["exitPage"])
        .map(r => ({ label: String(r["exitPage"]), value: Number(r["exits"]) || 0 })),
      paths: results.paths,
      totalSessions: Number(results.sessionCount?.[0]?.["totalSessions"]) || null,
    };
  }, [appId, timeframe]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSankeyLoading(true);
    try {
      if (compareMode) {
        const [a, b, sankeyRA, sankeyRB] = await Promise.all([
          fetchSegment(globalFilter),
          fetchSegment(globalFilterB!),
          executeMultipleDql({ sankey: Q.withFilter(Q.journeySankeyFlows(appId, timeframe, maxSteps), globalFilter) }),
          executeMultipleDql({ sankey: Q.withFilter(Q.journeySankeyFlows(appId, timeframe, maxSteps), globalFilterB!) }),
        ]);
        setFlowsA(a.flows);
        setExitPagesA(a.exits);
        setTopPathsA(a.paths);
        setTotalSessionsA(a.totalSessions);
        setFlowsB(b.flows);
        setExitPagesB(b.exits);
        setTopPathsB(b.paths);
        setTotalSessionsB(b.totalSessions);
        setSankeyDataA(sankeyRA.sankey);
        setSankeyDataB(sankeyRB.sankey);
      } else {
        const [main, sankeyRA] = await Promise.all([
          fetchSegment(globalFilter),
          executeMultipleDql({ sankey: Q.withFilter(Q.journeySankeyFlows(appId, timeframe, maxSteps), globalFilter) }),
        ]);
        setFlowsA(main.flows);
        setExitPagesA(main.exits);
        setTopPathsA(main.paths);
        setTotalSessionsA(main.totalSessions);
        setSankeyDataA(sankeyRA.sankey);
      }
    } catch (err) {
      console.error("[Journeys] fetch error:", err);
    } finally {
      setLoading(false);
      setSankeyLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter, globalFilterB, compareMode, maxSteps, fetchSegment]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const pageCategoriesA = useMemo(() => extractPageCategories(sankeyDataA), [sankeyDataA]);
  const pageCategoriesB = useMemo(() => extractPageCategories(sankeyDataB), [sankeyDataB]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          User journeys
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand how users navigate through your site
          {compareMode && <span style={{ marginLeft: 8, fontSize: 12, color: GA4_COLORS.textTertiary }}>— comparing two segments</span>}
        </p>
      </div>

      {/* Session summary bar — compare mode */}
      {compareMode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
          <div style={{ ...GA4_STYLES.card, borderLeft: `3px solid ${COLOR_A}` }} className="ga4-animate">
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, letterSpacing: "0.4px", marginBottom: 4 }}>
              SEGMENT A — SESSIONS
            </div>
            <div style={{ fontSize: 28, fontWeight: 400, color: GA4_COLORS.textPrimary }}>
              {loading ? "—" : (totalSessionsA ?? 0).toLocaleString()}
            </div>
          </div>
          <div style={{ ...GA4_STYLES.card, borderLeft: `3px solid ${COLOR_B}` }} className="ga4-animate">
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, letterSpacing: "0.4px", marginBottom: 4 }}>
              SEGMENT B — SESSIONS
            </div>
            <div style={{ fontSize: 28, fontWeight: 400, color: GA4_COLORS.textPrimary }}>
              {loading ? "—" : (totalSessionsB ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Page transitions */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top page transitions</div>
        {compareMode ? (
          <TransitionsCompareTable dataA={flowsA} dataB={flowsB} loading={loading} />
        ) : (
          <>
            <DataTable
              columns={[
                { key: "fromPage", label: "From page", width: "35%" },
                { key: "toPage", label: "To page", width: "35%" },
                { key: "transitions", label: "Transitions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={flowsA}
              maxRows={showAllFlows ? 25 : 10}
            />
            {flowsA.length > 10 && (
              <button
                onClick={() => setShowAllFlows(prev => !prev)}
                style={{
                  display: "block",
                  margin: "12px auto 0",
                  padding: "6px 16px",
                  background: "transparent",
                  border: `1px solid ${GA4_COLORS.border}`,
                  borderRadius: 6,
                  color: GA4_COLORS.primary,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {showAllFlows ? "Show less" : `Show all ${Math.min(flowsA.length, 25)} transitions`}
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Top paths */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top user paths</div>
          {compareMode ? (
            loading ? <CardSkeleton height={350} /> : (
              <JourneyCompareTable
                dataA={topPathsA}
                dataB={topPathsB}
                keyField="path"
                keyLabel="Journey path"
                metricField="sessions"
                metricLabel="Sessions"
              />
            )
          ) : (
            loading ? <CardSkeleton height={350} /> : (
              <DataTable
                columns={[
                  { key: "path", label: "Journey path", width: "50%" },
                  { key: "sessions", label: "Sessions", align: "right", showBar: true,
                    format: v => Number(v).toLocaleString(), width: "20%" },
                  { key: "avgDepth", label: "Avg depth", align: "right",
                    format: v => Number(v).toFixed(1), width: "20%" },
                ]}
                data={topPathsA}
                maxRows={12}
              />
            )
          )}
        </div>

        {/* Exit pages */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top exit pages</div>
          {compareMode ? (
            <DualBarChart dataA={exitPagesA} dataB={exitPagesB} loading={loading} />
          ) : (
            loading ? <CardSkeleton height={350} /> : (
              <BarChart data={exitPagesA} color={GA4_COLORS.chart[6]} maxBars={10} />
            )
          )}
        </div>
      </div>

      {/* Journey sunburst — single or dual depending on compareMode */}
      {compareMode ? (
        /* Dual sunburst: A (left) + B (right) */
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={{ fontSize: 14, fontWeight: 500, color: GA4_COLORS.textPrimary, marginBottom: 4 }}>
            Journey sunburst
          </div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 16px" }}>
            Ring 1 = entry / landing pages, each outer ring = next navigation step (up to 6 steps).
          </p>
          {sankeyLoading ? <CardSkeleton height={360} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Segment A sunburst */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, background: `${COLOR_A}18`,
                    border: `1px solid ${COLOR_A}40`, borderRadius: 10, padding: "2px 10px", letterSpacing: "0.4px" }}>
                    SEGMENT A
                  </span>
                  {pageCategoriesA.length > 0 && (
                    <select value={selectedPageA ?? ""}
                      onChange={e => setSelectedPageA(e.target.value || null)}
                      style={{ background: GA4_COLORS.cardBg, color: GA4_COLORS.textPrimary,
                        border: `1px solid ${GA4_COLORS.border}`, borderRadius: 6,
                        padding: "3px 6px", fontSize: 11, cursor: "pointer", outline: "none" }}>
                      <option value="">— All pages —</option>
                      {pageCategoriesA.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  )}
                </div>
                <SunburstChart data={sankeyDataA} selectedPage={selectedPageA} svgSize={420} compact />
                {totalSessionsA !== null && (
                  <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 6 }}>
                    {Math.min(sankeyDataA.length, 5000).toLocaleString()} of {totalSessionsA.toLocaleString()} sessions
                  </div>
                )}
              </div>
              {/* Segment B sunburst */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, background: `${COLOR_B}18`,
                    border: `1px solid ${COLOR_B}40`, borderRadius: 10, padding: "2px 10px", letterSpacing: "0.4px" }}>
                    SEGMENT B
                  </span>
                  {pageCategoriesB.length > 0 && (
                    <select value={selectedPageB ?? ""}
                      onChange={e => setSelectedPageB(e.target.value || null)}
                      style={{ background: GA4_COLORS.cardBg, color: GA4_COLORS.textPrimary,
                        border: `1px solid ${GA4_COLORS.border}`, borderRadius: 6,
                        padding: "3px 6px", fontSize: 11, cursor: "pointer", outline: "none" }}>
                      <option value="">— All pages —</option>
                      {pageCategoriesB.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  )}
                </div>
                <SunburstChart data={sankeyDataB} selectedPage={selectedPageB} svgSize={420} compact />
                {totalSessionsB !== null && (
                  <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 6 }}>
                    {Math.min(sankeyDataB.length, 5000).toLocaleString()} of {totalSessionsB.toLocaleString()} sessions
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Single sunburst */
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={GA4_STYLES.sectionTitle}>Journey sunburst</div>
            {!sankeyLoading && pageCategoriesA.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, fontWeight: 500 }}>Focus page</span>
                <select
                  value={selectedPageA ?? ""}
                  onChange={(e) => setSelectedPageA(e.target.value || null)}
                  style={{
                    background: GA4_COLORS.cardBg, color: GA4_COLORS.textPrimary,
                    border: `1px solid ${GA4_COLORS.border}`, borderRadius: 6,
                    padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none", minWidth: 140,
                  }}
                >
                  <option value="">— All pages —</option>
                  {pageCategoriesA.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                {selectedPageA && (
                  <button onClick={() => setSelectedPageA(null)} style={{
                    background: "transparent", border: "none", color: GA4_COLORS.textTertiary,
                    cursor: "pointer", fontSize: 14, padding: "2px 4px", lineHeight: 1,
                  }}>✕</button>
                )}
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            {selectedPageA
              ? `Ring 1 = first page after "${selectedPageA}", each outer ring = next step. Click ring 1 to focus a path.`
              : "Ring 1 = entry / landing pages, each outer ring = next navigation step (up to 6 steps). Click ring 1 to focus a path."}
          </p>
          {sankeyLoading ? <CardSkeleton height={440} /> : (
            <SunburstChart data={sankeyDataA} selectedPage={selectedPageA} />
          )}
          {!sankeyLoading && totalSessionsA !== null && (
            <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 8 }}>
              Showing {Math.min(sankeyDataA.length, 5000).toLocaleString()} of {totalSessionsA.toLocaleString()} sessions
            </div>
          )}
        </div>
      )}

      {/* Navigation flow (Sankey) — Segment A only */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={GA4_STYLES.sectionTitle}>Navigation flow</div>
            {compareMode && (
              <span style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, background: `${COLOR_A}18`,
                border: `1px solid ${COLOR_A}40`, borderRadius: 10, padding: "2px 8px", letterSpacing: "0.4px" }}>
                SEGMENT A
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, fontWeight: 500 }}>Steps</span>
            <select
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              style={{
                background: GA4_COLORS.cardBg, color: GA4_COLORS.textPrimary,
                border: `1px solid ${GA4_COLORS.border}`, borderRadius: 6,
                padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none", minWidth: 52,
              }}
              title="Maximum navigation steps to display"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Page categories grouped automatically from URL paths. Hover for details.
        </p>
        {sankeyLoading ? <CardSkeleton height={420} /> : (
          <SankeyChart data={sankeyDataA} topN={8} maxSteps={maxSteps} />
        )}
        {!sankeyLoading && totalSessionsA !== null && (
          <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 8 }}>
            Showing {Math.min(sankeyDataA.length, 5000).toLocaleString()} of {totalSessionsA.toLocaleString()} sessions
            {compareMode && <span style={{ color: COLOR_A }}> (Segment A)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
