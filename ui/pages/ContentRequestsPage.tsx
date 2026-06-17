/**
 * pages/ContentRequestsPage.tsx
 *
 * Content Request Analysis page — under User Journeys.
 *
 * Surfaces the full referrer-to-page navigation map for the selected application,
 * designed for Marketing personas who need to understand:
 *   • Where traffic originates (referrer channels + domains)
 *   • Which pages users land on from each source
 *   • How users navigate between content pages
 *   • Which content drives the deepest engagement
 *
 * Sections:
 *   1. KPI cards  — views, unique referrers, avg depth, direct %
 *   2. Chord map  — page-to-page + referrer-entry connection diagram
 *   3. Referrers  — top domains + channel donut
 *   4. Entry pages by referrer — landing page breakdown per channel
 *   5. Channel trend over time — multi-line sessions chart
 *   6. Session depth by channel — engagement comparison table
 *   7. Content performance — top pages with views, users, avg time
 *   8. Top transitions — most common from → to page pairs
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING, GA4_FONTS } from "../styles/ga4Theme";
import { MetricCard }    from "../components/MetricCard";
import { DonutChart }    from "../components/DonutChart";
import { BarChart }      from "../components/BarChart";
import { DataTable }     from "../components/DataTable";
import { ChordChart }    from "../components/ChordChart";
import { CardSkeleton }  from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface ContentRequestsPageProps {
  appId:       string;
  timeframe:   string;
  refreshKey:  number;
  onLoadEnd?:  () => void;
}

// ── Channel colour map (matches chord diagram) ──────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  "Direct":         "#1496ff",
  "Organic":        "#73be28",
  "Organic Search": "#73be28",
  "Social":         "#fd8232",
  "Referral":       "#6f2da8",
};

// ── Inline multi-line trend chart ────────────────────────────────────────────

interface TrendRow { timeframe: { startTime?: number; nanos?: number } | number | string; [key: string]: unknown; }

function MultiLineTrendChart({
  data,
  height = 220,
}: {
  data: Record<string, unknown>[];
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: GA4_COLORS.textTertiary, fontSize: 13 }}>
        No data
      </div>
    );
  }

  // DQL makeTimeseries with by:{channel} returns one row per channel:
  //   { channel: "Direct", timeframe: { start: "ISO", end: "ISO" }, interval: <ns>, sessions: [v0,v1,...] }
  // Each row's metric value is an ARRAY aligned to time buckets.
  // We reconstruct timestamps from timeframe.start + interval * index.

  const seriesMap = new Map<string, { ts: number; val: number }[]>();

  for (const row of data) {
    // Group-by key — find the non-metric, non-timeframe string field
    const ch = String(row["channel"] ?? row["Channel"] ?? "");
    if (!ch) continue;

    // metric array (the makeTimeseries value column)
    const metricKey = Object.keys(row).find(k =>
      k !== "channel" && k !== "Channel" && k !== "timeframe" && k !== "interval"
    );
    const values = metricKey && Array.isArray(row[metricKey]) ? (row[metricKey] as unknown[]) : [];
    if (values.length === 0) continue;

    // Timestamps: timeframe.start (ISO) + interval (nanoseconds) * index
    const tfRaw = row["timeframe"] as { start?: string; end?: string } | null | undefined;
    const startMs = tfRaw?.start ? new Date(tfRaw.start).getTime() : 0;
    const intervalNs = Number(row["interval"] ?? 0);
    const intervalMs = intervalNs / 1_000_000;

    const pts: { ts: number; val: number }[] = values.map((v, i) => ({
      ts:  startMs && intervalMs ? startMs + i * intervalMs : i,
      val: Number(v) || 0,
    }));

    if (!seriesMap.has(ch)) seriesMap.set(ch, []);
    seriesMap.get(ch)!.push(...pts);
  }

  // Sort each series by ts
  for (const pts of seriesMap.values()) pts.sort((a, b) => a.ts - b.ts);

  const allSeries = [...seriesMap.entries()];
  if (allSeries.length === 0) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: GA4_COLORS.textTertiary, fontSize: 13 }}>No data</div>;
  }

  const allVals = allSeries.flatMap(([, pts]) => pts.map(p => p.val));
  const maxVal = Math.max(...allVals, 1);
  const allTs  = allSeries.flatMap(([, pts]) => pts.map(p => p.ts));
  const minTs  = Math.min(...allTs);
  const maxTs  = Math.max(...allTs);
  const tsRange = maxTs - minTs || 1;

  const W = 780, H = height;
  const PAD = { t: 16, r: 20, b: 36, l: 52 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const xPos = (ts: number) => PAD.l + ((ts - minTs) / tsRange) * iW;
  const yPos = (val: number) => PAD.t + (1 - val / maxVal) * iH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    v: Math.round(f * maxVal),
    y: yPos(f * maxVal),
  }));

  const nTicks = Math.min(6, allTs.length);
  const uniqueTs = [...new Set(allTs)].sort((a, b) => a - b);
  const xTicks = uniqueTs.filter((_, i) => i % Math.max(1, Math.floor(uniqueTs.length / nTicks)) === 0).slice(0, nTicks);

  const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "K" : String(v);
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y}
              stroke={GA4_COLORS.border} strokeWidth={0.5} strokeDasharray="3 4" />
            <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" fontSize={10}
              fill={GA4_COLORS.textTertiary} fontFamily={GA4_FONTS.family}>
              {fmt(t.v)}
            </text>
          </g>
        ))}

        {/* X ticks */}
        {xTicks.map((ts, i) => (
          <text key={i} x={xPos(ts)} y={H - PAD.b + 14} textAnchor="middle"
            fontSize={9} fill={GA4_COLORS.textTertiary} fontFamily={GA4_FONTS.family}>
            {ts > 0 ? fmtDate(ts) : ""}
          </text>
        ))}

        {/* Lines */}
        {allSeries.map(([ch, pts]) => {
          if (pts.length < 2) return null;
          const d = pts.map((p, i) =>
            `${i === 0 ? "M" : "L"} ${xPos(p.ts)} ${yPos(p.val)}`
          ).join(" ");
          const color = CHANNEL_COLORS[ch] ?? GA4_COLORS.chart[4];
          return (
            <g key={ch}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={xPos(p.ts)} cy={yPos(p.val)} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Inline legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        {allSeries.map(([ch]) => (
          <div key={ch} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 20, height: 3, borderRadius: 2,
              background: CHANNEL_COLORS[ch] ?? GA4_COLORS.chart[4] }} />
            <span style={{ fontSize: 11, color: GA4_COLORS.textSecondary }}>{ch}</span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 8,
          background: "#1b1f23", border: "1px solid #2a2f35", borderRadius: 6,
          padding: "6px 10px", fontSize: 12, color: "#fff", pointerEvents: "none", zIndex: 9999,
        }}>
          {tooltip.label}
        </div>
      )}
    </div>
  );
}

// ── Page component ───────────────────────────────────────────────────────────

export function ContentRequestsPage({ appId, timeframe, refreshKey, onLoadEnd }: ContentRequestsPageProps) {
  const [kpis,         setKpis]         = useState<Record<string, unknown>[]>([]);
  const [chordData,    setChordData]    = useState<Record<string, unknown>[]>([]);
  const [referrers,    setReferrers]    = useState<Record<string, unknown>[]>([]);
  const [entryPages,   setEntryPages]   = useState<Record<string, unknown>[]>([]);
  const [channelTrend, setChannelTrend] = useState<Record<string, unknown>[]>([]);
  const [depthByChannel, setDepthByChannel] = useState<Record<string, unknown>[]>([]);
  const [content,      setContent]      = useState<Record<string, unknown>[]>([]);
  const [transitions,  setTransitions]  = useState<Record<string, unknown>[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [chordLoading, setChordLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setChordLoading(true);
    try {
      const [main, chord] = await Promise.all([
        executeMultipleDql({
          kpis:         Q.aemKPIs(appId, timeframe),
          referrers:    Q.aemReferrerDomains(appId, timeframe),
          entryPages:   Q.aemEntryPagesByReferrer(appId, timeframe),
          channelTrend: Q.aemReferrerChannelOverTime(appId, timeframe),
          depth:        Q.aemSessionDepthByChannel(appId, timeframe),
          content:      Q.aemContentPerformance(appId, timeframe),
          transitions:  Q.aemPageTransitions(appId, timeframe),
        }),
        executeMultipleDql({
          chord: Q.aemChordFlows(appId, timeframe),
        }),
      ]);

      setKpis(main.kpis ?? []);
      setReferrers(main.referrers ?? []);
      setEntryPages(main.entryPages ?? []);
      setChannelTrend(main.channelTrend ?? []);
      setDepthByChannel(main.depth ?? []);
      setContent(main.content ?? []);
      setTransitions(main.transitions ?? []);
      setChordData(chord.chord ?? []);
    } catch (err) {
      console.error("[ContentRequests] fetch error:", err);
    } finally {
      setLoading(false);
      setChordLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const kpiRow = kpis[0] ?? {};
  const totalSessions      = Number(kpiRow["totalSessions"] ?? 0);
  const totalPageViews     = Number(kpiRow["totalPageViews"] ?? 0);
  const avgDepth           = Number(kpiRow["avgDepth"] ?? 0);
  const uniqueRefDomains   = Number(kpiRow["uniqueRefDomains"] ?? 0);
  const directSessions     = Number(kpiRow["directSessions"] ?? 0);
  const directPct          = totalSessions > 0 ? (directSessions / totalSessions) * 100 : 0;

  // Referrer bar chart data
  const referrerBars = referrers
    .filter(r => r["refSource"])
    .map(r => ({ label: String(r["refSource"]), value: Number(r["sessions"]) || 0 }));

  // Channel donut
  const channelDonut = (() => {
    const channelTotals = new Map<string, number>();
    for (const r of referrers) {
      const raw = String(r["refSource"] ?? "");
      let ch = "Referral";
      if (raw === "Direct / None") ch = "Direct";
      else if (/(google|bing|yahoo|duckduckgo)/i.test(raw)) ch = "Organic Search";
      else if (/(facebook|instagram|twitter|x\.com|linkedin|tiktok|pinterest)/i.test(raw)) ch = "Social";
      channelTotals.set(ch, (channelTotals.get(ch) ?? 0) + (Number(r["sessions"]) || 0));
    }
    return [...channelTotals.entries()].map(([label, value]) => ({ label, value }));
  })();

  // Depth bars
  const depthBars = depthByChannel
    .filter(r => r["channel"])
    .map(r => ({
      label: String(r["channel"]),
      value: Number(r["avgDepth"] ?? 0),
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Content request analysis
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand how referrer sources drive navigation across your content pages
        </p>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard
          label="Page Views"
          value={totalPageViews}
          loading={loading}
          subtitle="Navigation events"
        />
        <MetricCard
          label="Sessions"
          value={totalSessions}
          loading={loading}
        />
        <MetricCard
          label="Avg Session Depth"
          value={avgDepth.toFixed(1)}
          loading={loading}
          subtitle="Pages per session"
        />
        <MetricCard
          label="Unique Referrer Domains"
          value={uniqueRefDomains}
          loading={loading}
          subtitle="External sources"
        />
        <MetricCard
          label="Direct Traffic"
          value={directPct.toFixed(0)}
          suffix="%"
          loading={loading}
          subtitle={`${directSessions.toLocaleString()} direct sessions`}
        />
      </div>

      {/* ── Chord map ─────────────────────────────────────────────────────── */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Content connection map</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 16px" }}>
          Chord diagram showing how referrer channels (●) connect to content categories (■) and
          how users navigate between pages within a session. Arc width = traffic volume. Hover an arc to focus.
        </p>
        {chordLoading ? (
          <CardSkeleton height={520} />
        ) : (
          <ChordChart data={chordData} height={520} />
        )}
      </div>

      {/* ── Referrer domains + Channel donut ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top referrer domains</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Sessions arriving from each external source. "Direct / None" means no referrer header (typed URL, bookmark, or dark social).
          </p>
          {loading ? <CardSkeleton height={280} /> : (
            <BarChart
              data={referrerBars}
              color={GA4_COLORS.primary}
              maxBars={12}
              formatV={v => v.toLocaleString()}
            />
          )}
        </div>

        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Traffic by channel</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Sessions grouped into marketing channels — useful for campaign effectiveness reporting.
          </p>
          {loading ? <CardSkeleton height={280} /> : (
            <DonutChart
              data={channelDonut}
              colors={[
                GA4_COLORS.primary,
                GA4_COLORS.chart[3],
                GA4_COLORS.chart[4],
                GA4_COLORS.chart[1],
              ]}
            />
          )}
        </div>
      </div>

      {/* ── Entry pages by referrer channel ──────────────────────────────── */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Landing pages by referrer channel</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Which pages users first land on, broken down by how they arrived. Highlights which content
          resonates for organic search vs social vs direct campaigns.
        </p>
        {loading ? <CardSkeleton height={360} /> : (
          <DataTable
            columns={[
              { key: "channel",   label: "Channel",     width: "22%" },
              { key: "entryPage", label: "Landing Page", width: "55%" },
              { key: "sessions",  label: "Sessions", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "18%" },
            ]}
            data={entryPages}
            maxRows={15}
          />
        )}
      </div>

      {/* ── Channel trend + Session depth ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Traffic channel trend</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Sessions over time split by referrer channel. Use this to spot shifts in organic, social,
            or referral traffic following campaigns or algorithm updates.
          </p>
          {loading ? <CardSkeleton height={240} /> : (
            <MultiLineTrendChart data={channelTrend} height={220} />
          )}
        </div>

        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Engagement depth by channel</div>
          <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
            Average pages per session grouped by referrer channel. Higher depth suggests stronger
            content relevance or navigation architecture for that audience.
          </p>
          {loading ? <CardSkeleton height={240} /> : (
            <>
              <BarChart
                data={depthBars}
                color={GA4_COLORS.chart[3]}
                formatV={v => v.toFixed(1) + " pages"}
                maxBars={6}
              />
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Channel", "Sessions", "Avg Depth", "Median", "Max"].map(h => (
                      <th key={h} style={{
                        ...GA4_STYLES.tableHeader,
                        padding: "8px 10px",
                        textAlign: h === "Channel" ? "left" : "right",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depthByChannel.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : GA4_COLORS.pageBg }}>
                      {(["channel", "sessions", "avgDepth", "medianDepth", "maxDepth"] as const).map((k, ki) => (
                        <td key={k} style={{
                          ...GA4_STYLES.tableCell,
                          padding: "8px 10px",
                          textAlign: ki === 0 ? "left" : "right",
                          fontWeight: ki === 0 ? 500 : 400,
                        }}>
                          {ki === 0
                            ? String(r[k] ?? "")
                            : ki === 1
                              ? Number(r[k] ?? 0).toLocaleString()
                              : Number(r[k] ?? 0).toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Content performance ──────────────────────────────────────────── */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Content performance</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Top pages by views, with unique users and average time on page. Useful for identifying
          high-traffic content that may need campaign support or SEO optimisation.
        </p>
        {loading ? <CardSkeleton height={400} /> : (
          <DataTable
            columns={[
              { key: "page.url.path", label: "Page",           width: "50%" },
              { key: "views",         label: "Views",     align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "16%" },
              { key: "uniqueUsers",   label: "Users",     align: "right",
                format: v => Number(v).toLocaleString(), width: "14%" },
              { key: "avgDuration",   label: "Avg Time",  align: "right",
                format: v => {
                  const ms = Number(v);
                  if (ms < 1000) return `${ms.toFixed(0)}ms`;
                  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
                  return `${(ms / 60000).toFixed(1)}m`;
                },
                width: "14%" },
            ]}
            data={content}
            maxRows={20}
          />
        )}
      </div>

      {/* ── Top page transitions ─────────────────────────────────────────── */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top page transitions</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Most common page-to-page moves across all sessions. Strong transitions reveal natural
          content journeys — useful for internal linking strategy and content sequencing.
        </p>
        {loading ? <CardSkeleton height={360} /> : (
          <DataTable
            columns={[
              { key: "fromPage",    label: "From Page",   width: "40%" },
              { key: "toPage",      label: "To Page",     width: "40%" },
              { key: "transitions", label: "Transitions", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={transitions}
            maxRows={20}
          />
        )}
      </div>

      {/* ── Marketing insights callout ───────────────────────────────────── */}
      <div style={{
        ...GA4_STYLES.card,
        background: `linear-gradient(135deg, ${GA4_COLORS.primaryBg} 0%, #fff 100%)`,
        border: `1px solid #c8e8ff`,
      }} className="ga4-animate">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: GA4_COLORS.primary,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: GA4_COLORS.textPrimary, marginBottom: 6 }}>
              How to use this page
            </div>
            <div style={{ fontSize: 13, color: GA4_COLORS.textSecondary, lineHeight: 1.6 }}>
              <strong>Chord map:</strong> Hover any arc to see how traffic flows from that source or page.
              Wide ribbons between referrer channels (●) and content categories (■) show your most important acquisition→content relationships.
              <br />
              <strong>Landing pages:</strong> Compare which content gets organic vs direct traffic to prioritise SEO efforts on high-value pages.
              <br />
              <strong>Engagement depth:</strong> Channels with lower avg depth may indicate a mismatch between landing page content and visitor intent — or an opportunity to improve internal linking.
              <br />
              <strong>Top transitions:</strong> Use the from → to table to identify the natural next-page users expect after each piece of content.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
