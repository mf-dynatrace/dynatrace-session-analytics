/**
 * components/SunburstChart.tsx
 *
 * D3-powered two-ring sunburst visualising user journeys.
 *
 * Ring layout:
 *   Inner ring  — Entry page categories (where sessions start)
 *   Outer ring  — Exit page categories (where the session ended)
 *   Centre disc — Total sessions count
 *
 * Data: receives per-session page arrays (same format as SankeyChart)
 * and performs all grouping/aggregation client-side.
 */

import React, { useMemo, useState } from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

// ── Page grouping (mirrors SankeyChart.groupPagePath) ─────────────────────────

function groupPagePath(path: string): string {
  if (!path || path === "/") return "Home";
  const clean = path.replace(/^\/+/, "").split("/")[0].split("?")[0];
  if (!clean) return "Home";
  return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
}

// ── Colour palette ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { fill: string; exit: string }> = {
  Home:         { fill: "#1496ff", exit: "#7dcaff" },
  Menu:         { fill: "#fd8232", exit: "#fdb97e" },
  "Book a table": { fill: "#73be28", exit: "#aad97a" },
  Order:        { fill: "#00b9cc", exit: "#66d9e6" },
  Find:         { fill: "#6f2da8", exit: "#a77acc" },
  "My account": { fill: "#6366f1", exit: "#a5b4fc" },
  Offers:       { fill: "#ec4899", exit: "#f9a8d4" },
  Other:        { fill: "#9ba3ab", exit: "#c4c9ce" },
};

const DEFAULT_COLORS = { fill: "#9ba3ab", exit: "#c4c9ce" };
const PALETTE_EXTRAS = ["#14a8f5", "#9355b7", "#b4dc00", "#eda61e", "#c41425"];

function getCatColors(category: string, colorMap: Map<string, { fill: string; exit: string }>): { fill: string; exit: string } {
  if (colorMap.has(category)) return colorMap.get(category)!;
  const lower = category.toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (key.toLowerCase() === lower || lower.startsWith(key.toLowerCase().split(" ")[0])) {
      colorMap.set(category, val);
      return val;
    }
  }
  const idx = colorMap.size % PALETTE_EXTRAS.length;
  const color = PALETTE_EXTRAS[idx];
  // Lighten for exit: blend towards white
  const hex = color.replace("#", "");
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + 80);
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + 80);
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + 80);
  const exit = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const result = { fill: color, exit };
  colorMap.set(category, result);
  return result;
}

// ── Ring geometry ─────────────────────────────────────────────────────────────

const R_CENTRE      = 68;
const R_INNER_END   = 160;
const R_OUTER_START = 166;
const R_OUTER_END   = 260;
const CX            = 280;
const CY            = 280;
const SVG_W         = 560;
const SVG_H         = 560;
const PAD_ANGLE     = 0.015;

// ── SVG arc path (no d3 dependency) ───────────────────────────────────────────

function describeArc(startAngle: number, endAngle: number, innerR: number, outerR: number): string {
  // D3 convention: 0 = top (12 o'clock), clockwise
  const sa = startAngle + PAD_ANGLE / 2;
  const ea = endAngle - PAD_ANGLE / 2;
  if (ea <= sa) return "";

  // Convert from D3 convention (0=top, CW) to math convention
  const cos = (a: number) => Math.cos(a - Math.PI / 2);
  const sin = (a: number) => Math.sin(a - Math.PI / 2);

  const largeArc = ea - sa > Math.PI ? 1 : 0;

  const x1 = outerR * cos(sa);
  const y1 = outerR * sin(sa);
  const x2 = outerR * cos(ea);
  const y2 = outerR * sin(ea);
  const x3 = innerR * cos(ea);
  const y3 = innerR * sin(ea);
  const x4 = innerR * cos(sa);
  const y4 = innerR * sin(sa);

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function pathD(s: number, e: number, ir: number, or_: number): string {
  return describeArc(s, e, ir, or_);
}

// ── Arc label ─────────────────────────────────────────────────────────────────

function ArcLabel({ start, end, innerR, outerR, text, fontSize }: {
  start: number; end: number; innerR: number; outerR: number; text: string; fontSize: number;
}) {
  const span = end - start;
  if (span < 0.2) return null;
  const mid = (start + end) / 2 - Math.PI / 2;
  const r = (innerR + outerR) / 2;
  const x = r * Math.cos(mid);
  const y = r * Math.sin(mid);
  const rotate = ((mid + Math.PI / 2) * 180) / Math.PI;
  const adjusted = rotate > 90 && rotate < 270 ? rotate + 180 : rotate;
  const label = span < 0.35
    ? text.split(/\s/)[0].slice(0, 8)
    : text.length > 12 ? text.slice(0, 11) + "…" : text;

  return (
    <text
      x={x} y={y}
      fontSize={fontSize}
      fill="white"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${adjusted - 90},${x},${y})`}
      style={{ pointerEvents: "none", userSelect: "none", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
    >
      {label}
    </text>
  );
}

// ── Data types ────────────────────────────────────────────────────────────────

interface InnerArc { category: string; startAngle: number; endAngle: number; total: number; }
interface OuterArc { entry: string; exit: string; startAngle: number; endAngle: number; sessions: number; }

type TooltipState =
  | { kind: "inner"; category: string; total: number }
  | { kind: "outer"; entry: string; exit: string; sessions: number };

// ── Build journey data from session arrays ────────────────────────────────────

interface JourneyPair { entry: string; exit: string; sessions: number; }

function buildJourneyPairs(rawData: Record<string, unknown>[]): { pairs: JourneyPair[]; total: number } {
  const pairMap = new Map<string, number>();
  let total = 0;

  for (const row of rawData) {
    const pages = row["pages"];
    if (!Array.isArray(pages) || pages.length < 1) continue;
    total++;
    const entry = groupPagePath(String(pages[0] ?? ""));
    const exit = groupPagePath(String(pages[pages.length - 1] ?? ""));
    const key = `${entry}|||${exit}`;
    pairMap.set(key, (pairMap.get(key) ?? 0) + 1);
  }

  const pairs = [...pairMap.entries()]
    .map(([key, sessions]) => {
      const [entry, exit] = key.split("|||");
      return { entry, exit, sessions };
    })
    .sort((a, b) => b.sessions - a.sessions);

  return { pairs, total };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SunburstChartProps {
  data: Record<string, unknown>[];
}

export function SunburstChart({ data: rawData }: SunburstChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const { pairs, total } = useMemo(() => buildJourneyPairs(rawData), [rawData]);

  // Stable color map
  const colorMap = useMemo(() => {
    const map = new Map<string, { fill: string; exit: string }>();
    const allCats = new Set<string>();
    for (const p of pairs) { allCats.add(p.entry); allCats.add(p.exit); }
    for (const cat of allCats) { getCatColors(cat, map); }
    return map;
  }, [pairs]);

  const getColors = (cat: string) => colorMap.get(cat) ?? getCatColors(cat, colorMap);

  // Build arc geometry
  const { innerArcs, outerArcs } = useMemo(() => {
    const innerArcs: InnerArc[] = [];
    const outerArcs: OuterArc[] = [];
    if (!pairs.length) return { innerArcs, outerArcs };

    // Aggregate per entry category
    const entryTotals = new Map<string, number>();
    for (const p of pairs) entryTotals.set(p.entry, (entryTotals.get(p.entry) ?? 0) + p.sessions);

    // Merge small categories (< 10 sessions) into "Other"
    const MIN_SESSIONS = 10;
    for (const [cat, count] of entryTotals) {
      if (count < MIN_SESSIONS && cat !== "Other") {
        entryTotals.set("Other", (entryTotals.get("Other") ?? 0) + count);
        entryTotals.delete(cat);
      }
    }

    const grandTotal = [...entryTotals.values()].reduce((s, n) => s + n, 0);
    if (grandTotal === 0) return { innerArcs, outerArcs };

    const entries = [...entryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({ category, total }));

    // Set of categories that were merged into Other
    const mergedToOther = new Set<string>();
    for (const p of pairs) {
      if (!entryTotals.has(p.entry)) mergedToOther.add(p.entry);
    }

    let angle = 0;
    for (const entry of entries) {
      const arcSpan = (entry.total / grandTotal) * 2 * Math.PI;
      const startAngle = angle;
      const endAngle = angle + arcSpan;

      innerArcs.push({ category: entry.category, startAngle, endAngle, total: entry.total });

      // Subdivide: exit arcs within this entry
      const exits = pairs
        .filter(p => entry.category === "Other"
          ? (p.entry === "Other" || mergedToOther.has(p.entry))
          : p.entry === entry.category)
        .sort((a, b) => b.sessions - a.sessions);

      let exitAngle = startAngle;
      for (const seg of exits) {
        const exitSpan = (seg.sessions / entry.total) * arcSpan;
        outerArcs.push({
          entry: seg.entry,
          exit: seg.exit,
          startAngle: exitAngle,
          endAngle: exitAngle + exitSpan,
          sessions: seg.sessions,
        });
        exitAngle += exitSpan;
      }

      angle = endAngle;
    }

    return { innerArcs, outerArcs };
  }, [pairs]);

  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";

  const innerOpacity = (cat: string) => !focused || focused === cat ? 1 : 0.18;
  const outerOpacity = (entry: string) => !focused || focused === entry ? 1 : 0.18;

  if (!pairs.length) {
    return (
      <div style={{ color: GA4_COLORS.textSecondary, textAlign: "center", padding: 40 }}>
        Not enough navigation data for sunburst chart
      </div>
    );
  }

  // Category legend
  const legendCategories = [...new Set([...innerArcs.map(a => a.category)])].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  return (
    <div
      style={{ display: "flex", alignItems: "flex-start", gap: 24 }}
    >
      {/* SVG Sunburst */}
      <div style={{ flex: "0 0 auto", position: "relative" }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: "block", width: 560, height: 560 }}
        >
          <defs>
            <filter id="sunburst-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.08)" />
            </filter>
          </defs>

          {/* Background circle */}
          <circle cx={CX} cy={CY} r={R_OUTER_END + 16} fill={GA4_COLORS.pageBg} />

          {/* Faint guide rings */}
          {[R_CENTRE, R_INNER_END, R_OUTER_END].map(r => (
            <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke={GA4_COLORS.border} strokeWidth="0.5" />
          ))}

          {/* Inner ring: entry pages */}
          <g transform={`translate(${CX},${CY})`}>
            {innerArcs.map(arc => (
              <g
                key={arc.category}
                style={{ opacity: innerOpacity(arc.category), transition: "opacity 0.3s", cursor: "pointer" }}
                onClick={() => setFocused(f => f === arc.category ? null : arc.category)}
                onMouseEnter={() => setTooltip({ kind: "inner", category: arc.category, total: arc.total })}
                onMouseLeave={() => setTooltip(null)}
              >
                <path
                  d={pathD(arc.startAngle, arc.endAngle, R_CENTRE, R_INNER_END)}
                  fill={getColors(arc.category).fill}
                  stroke="white"
                  strokeWidth="1"
                  filter="url(#sunburst-shadow)"
                />
                <ArcLabel
                  start={arc.startAngle} end={arc.endAngle}
                  innerR={R_CENTRE} outerR={R_INNER_END}
                  text={arc.category} fontSize={9}
                />
              </g>
            ))}
          </g>

          {/* Outer ring: exit pages */}
          <g transform={`translate(${CX},${CY})`}>
            {outerArcs.map((arc, i) => {
              const isBounce = arc.entry === arc.exit;
              return (
                <g
                  key={i}
                  style={{ opacity: outerOpacity(arc.entry), transition: "opacity 0.3s", cursor: "pointer" }}
                  onMouseEnter={() => setTooltip({ kind: "outer", entry: arc.entry, exit: arc.exit, sessions: arc.sessions })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <path
                    d={pathD(arc.startAngle, arc.endAngle, R_OUTER_START, R_OUTER_END)}
                    fill={isBounce ? `${getColors(arc.entry).fill}44` : getColors(arc.exit).exit}
                    stroke="white"
                    strokeWidth="0.5"
                  />
                  <ArcLabel
                    start={arc.startAngle} end={arc.endAngle}
                    innerR={R_OUTER_START} outerR={R_OUTER_END}
                    text={arc.exit} fontSize={8}
                  />
                </g>
              );
            })}
          </g>

          {/* Centre disc */}
          <circle cx={CX} cy={CY} r={R_CENTRE - 4} fill="white" stroke={GA4_COLORS.border} strokeWidth="1" />
          <text x={CX} y={CY - 12} textAnchor="middle" fill={GA4_COLORS.textPrimary}
            fontSize={focused ? 16 : 22} fontWeight="700">
            {focused
              ? (innerArcs.find(a => a.category === focused)?.total ?? 0).toLocaleString()
              : total.toLocaleString()}
          </text>
          <text x={CX} y={CY + 6} textAnchor="middle" fill={GA4_COLORS.textSecondary} fontSize={11}>
            {focused ? focused : "sessions"}
          </text>
          {focused && (
            <text
              x={CX} y={CY + 22} textAnchor="middle" fill={GA4_COLORS.primary}
              fontSize={9} style={{ cursor: "pointer" }}
              onClick={() => setFocused(null)}
            >
              ✕ clear
            </text>
          )}
        </svg>

        {/* Tooltip anchored to right edge of sunburst */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              right: -12,
              top: "50%",
              transform: "translate(100%, -50%)",
              background: "white",
              border: `1px solid ${GA4_COLORS.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              maxWidth: 220,
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              fontSize: 12,
              color: GA4_COLORS.textPrimary,
              lineHeight: 1.6,
            }}
          >
            {tooltip.kind === "inner" && (
              <>
                <div style={{ fontWeight: 700, color: getColors(tooltip.category).fill, marginBottom: 4 }}>
                  Entry: {tooltip.category}
                </div>
                <div>
                  <strong>{tooltip.total.toLocaleString()}</strong>{" "}
                  <span style={{ color: GA4_COLORS.textSecondary }}>sessions start here</span>
                </div>
                <div style={{ color: GA4_COLORS.textTertiary, fontSize: 11 }}>
                  {pct(tooltip.total)}% of all sessions
                </div>
              </>
            )}
            {tooltip.kind === "outer" && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: getColors(tooltip.entry).fill }}>{tooltip.entry}</span>
                  {" → "}
                  <span style={{ color: getColors(tooltip.exit).fill }}>{tooltip.exit}</span>
                </div>
                <div>
                  <strong>{tooltip.sessions.toLocaleString()}</strong>{" "}
                  <span style={{ color: GA4_COLORS.textSecondary }}>sessions</span>
                </div>
                <div style={{ color: GA4_COLORS.textTertiary, fontSize: 11 }}>
                  {pct(tooltip.sessions)}% of all sessions
                </div>
                {tooltip.entry === tooltip.exit && (
                  <div style={{ color: GA4_COLORS.warning, fontWeight: 600, fontSize: 11, marginTop: 3 }}>
                    ↩ Single-category session
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Legend — two columns side by side */}
      <div style={{ flex: 1, minWidth: 280, paddingTop: 20, display: "flex", gap: 24 }}>
        {/* Inner ring legend */}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 11, color: GA4_COLORS.textSecondary, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Inner ring — Entry page
          </div>
          {legendCategories.map(cat => (
            <div
              key={cat}
              style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
                cursor: "pointer", opacity: !focused || focused === cat ? 1 : 0.4,
                transition: "opacity 0.2s",
              }}
              onClick={() => setFocused(f => f === cat ? null : cat)}
            >
              <div style={{ width: 10, height: 10, borderRadius: 2, background: getColors(cat).fill, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: GA4_COLORS.textPrimary }}>{cat}</span>
              <span style={{ fontSize: 11, color: GA4_COLORS.textSecondary, marginLeft: "auto" }}>
                {(innerArcs.find(a => a.category === cat)?.total ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Outer ring legend */}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 11, color: GA4_COLORS.textSecondary, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Outer ring — Exit page
          </div>
          {legendCategories.map(cat => (
            <div key={`exit-${cat}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: getColors(cat).exit, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: GA4_COLORS.textPrimary }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
