/**
 * components/ChordChart.tsx
 *
 * Interactive SVG Chord diagram for page-navigation + referrer flow analysis.
 *
 * Data model:
 *   Each input row (from aemChordFlows DQL query) has:
 *     pages:     string[]   — ordered page paths visited in one session
 *     refDomain: string     — referrer domain for the session (may be null/"")
 *     pageCount: number
 *
 * Processing (client-side):
 *   1. Classify referrer into one of four external channels
 *   2. Bucket each page URL into a short category label (first URL segment)
 *   3. Find the top-N page categories by visit frequency
 *   4. Build a symmetric NxN flow matrix:
 *      - Entry flows: externalChannel → firstPageCategory
 *      - Navigation flows: pageCategory[i] → pageCategory[i+1]
 *   5. Render arcs (nodes) + ribbon chords using SVG math
 *
 * Visual encoding:
 *   - Arc thickness  ∝ total traffic through that node
 *   - Chord thickness ∝ flow between two nodes
 *   - Colour         = source node colour
 *   - Hover          = highlights all chords for hovered node
 */

import React, { useMemo, useState, useRef } from "react";
import { GA4_COLORS, GA4_FONTS } from "../styles/ga4Theme";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXTERNAL_SOURCES = ["Direct", "Organic Search", "Social", "Referral"] as const;

/** Colour palette — first 4 = external channels, rest = page categories */
const CHORD_PALETTE = [
  "#1496ff", // Direct          — Dynatrace blue
  "#73be28", // Organic Search  — Dynatrace green
  "#fd8232", // Social          — Dynatrace orange
  "#6f2da8", // Referral        — Dynatrace purple
  "#00b9cc", // page category 1 — Dynatrace teal
  "#eda61e", // page category 2 — Dynatrace amber
  "#c41425", // page category 3 — Dynatrace red
  "#b4dc00", // page category 4 — lime
  "#9355b7", // page category 5 — light purple
  "#14a8f5", // page category 6 — sky blue
  "#ec4899", // page category 7 — pink
  "#10b981", // page category 8 — emerald
] as const;

const GAP_RADIANS = 0.025; // gap between arc segments
const ARC_R      = 220;    // outer arc radius
const CHORD_R    = 196;    // inner chord radius (arc width ≈ 24px)
const LABEL_R    = 236;    // label placement radius
const SVG_SIZE   = 540;    // square SVG viewBox
const CX         = SVG_SIZE / 2;
const CY         = SVG_SIZE / 2;
const TOP_PAGES  = 8;      // number of page categories to show

// ── Utility: classify referrer domain ────────────────────────────────────────

function classifyReferrer(domain: string | null | undefined): string {
  if (!domain || domain.trim() === "") return "Direct";
  const d = domain.toLowerCase();
  if (d.includes("google") || d.includes("bing") || d.includes("yahoo") ||
      d.includes("duckduckgo") || d.includes("ecosia") || d.includes("yandex"))
    return "Organic Search";
  if (d.includes("facebook") || d.includes("instagram") || d.includes("twitter") ||
      d.includes("x.com") || d.includes("linkedin") || d.includes("tiktok") ||
      d.includes("pinterest") || d.includes("snapchat") || d.includes("youtube"))
    return "Social";
  return "Referral";
}

/** Group a URL path into a short display label */
function groupPagePath(path: string | null | undefined): string {
  if (!path || path === "/") return "Home";
  const clean = String(path).replace(/^\/+/, "").split("/")[0].split("?")[0].split("#")[0];
  if (!clean) return "Home";
  const label = clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
  return label.length > 22 ? label.slice(0, 21) + "…" : label;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function pt(r: number, angle: number, cx: number = CX, cy: number = CY) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function arcPath(r: number, a1: number, a2: number): string {
  const p1 = pt(r, a1);
  const p2 = pt(r, a2);
  const largeArc = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

/** Chord ribbon path between two arc segments (a1..a2) on node i and (b1..b2) on node j */
function chordPath(a1: number, a2: number, b1: number, b2: number): string {
  const src1 = pt(CHORD_R, a1);
  const src2 = pt(CHORD_R, a2);
  const tgt1 = pt(CHORD_R, b1);
  const tgt2 = pt(CHORD_R, b2);
  const la_src = a2 - a1 > Math.PI ? 1 : 0;
  const la_tgt = b2 - b1 > Math.PI ? 1 : 0;
  return [
    `M ${src1.x} ${src1.y}`,
    `A ${CHORD_R} ${CHORD_R} 0 ${la_src} 1 ${src2.x} ${src2.y}`,
    `Q ${CX} ${CY} ${tgt2.x} ${tgt2.y}`,
    `A ${CHORD_R} ${CHORD_R} 0 ${la_tgt} 0 ${tgt1.x} ${tgt1.y}`,
    `Q ${CX} ${CY} ${src1.x} ${src1.y}`,
    "Z",
  ].join(" ");
}

// ── Matrix builder ────────────────────────────────────────────────────────────

interface SessionRow {
  pages:    string[];
  refDomain: string;
}

interface ChordNode {
  id:     string;
  label:  string;
  color:  string;
  isExternal: boolean;
}

interface ChordData {
  nodes:  ChordNode[];
  matrix: number[][];   // symmetric: matrix[i][j] == matrix[j][i]
}

function buildChordData(rows: SessionRow[], topPages: string[]): ChordData {
  const extLabels = [...EXTERNAL_SOURCES];
  const allLabels = [...extLabels, ...topPages];
  const N = allLabels.length;
  const idx = new Map(allLabels.map((l, i) => [l, i]));

  // Directed matrix M[from][to]
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  for (const { pages, refDomain } of rows) {
    const ext = classifyReferrer(refDomain);
    const extI = idx.get(ext) ?? 0;

    // Entry: external channel → first page category
    if (pages.length >= 1) {
      const firstCat = groupPagePath(pages[0]);
      const firstI = idx.get(firstCat);
      if (firstI !== undefined && extI !== firstI) {
        M[extI][firstI]++;
      }
    }

    // Page→page transitions
    for (let p = 0; p < pages.length - 1; p++) {
      const fromCat = groupPagePath(pages[p]);
      const toCat   = groupPagePath(pages[p + 1]);
      const fromI = idx.get(fromCat);
      const toI   = idx.get(toCat);
      if (fromI !== undefined && toI !== undefined && fromI !== toI) {
        M[fromI][toI]++;
      }
    }
  }

  // Build symmetric matrix S[i][j] = M[i][j] + M[j][i]
  const S: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (__, j) => M[i][j] + M[j][i])
  );

  const nodes: ChordNode[] = allLabels.map((label, i) => ({
    id:         label,
    label,
    color:      CHORD_PALETTE[i % CHORD_PALETTE.length],
    isExternal: i < extLabels.length,
  }));

  return { nodes, matrix: S };
}

// ── Layout: compute arc positions ─────────────────────────────────────────────

interface ArcSegment {
  nodeIdx: number;
  start:   number;  // radians
  end:     number;
  // sub-segments within this arc, one per chord endpoint on this node
  subSegs: { chordIdx: number; otherNodeIdx: number; start: number; end: number }[];
}

function computeLayout(nodes: ChordNode[], matrix: number[][]): ArcSegment[] {
  const N = nodes.length;
  const total = matrix.reduce((s, row) => s + row.reduce((r, v) => r + v, 0), 0) / 2;
  if (total === 0) return [];

  // Node arc = half of symmetric row sum (each flow is counted twice in symmetric)
  const nodeFlow = nodes.map((_, i) =>
    matrix[i].reduce((s, v) => s + v, 0) / 2
  );

  const angleScale = (2 * Math.PI - N * GAP_RADIANS) / total;
  let cursor = -Math.PI / 2;

  const arcs: ArcSegment[] = nodes.map((_, i) => {
    const span = nodeFlow[i] * angleScale;
    const start = cursor;
    cursor += span + GAP_RADIANS;
    return { nodeIdx: i, start, end: start + span, subSegs: [] };
  });

  // Distribute sub-segments within each arc
  // For chord (i,j): node i gives S[i][j]/2 angle, node j gives S[i][j]/2 angle
  const arcCursors = arcs.map(a => a.start);

  let chordIdx = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const flow = matrix[i][j]; // = S[i][j] = S[j][i]
      if (flow === 0) continue;
      const halfAngle = (flow / 2) * angleScale;

      // Chord on node i
      arcs[i].subSegs.push({
        chordIdx,
        otherNodeIdx: j,
        start: arcCursors[i],
        end:   arcCursors[i] + halfAngle,
      });
      arcCursors[i] += halfAngle;

      // Chord on node j
      arcs[j].subSegs.push({
        chordIdx,
        otherNodeIdx: i,
        start: arcCursors[j],
        end:   arcCursors[j] + halfAngle,
      });
      arcCursors[j] += halfAngle;

      chordIdx++;
    }
  }

  return arcs;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChordChartProps {
  /** Raw DQL rows: each has `pages` (array), `refDomain` (string), `pageCount` (number) */
  data:    Record<string, unknown>[];
  height?: number;
}

interface TooltipState {
  x: number; y: number;
  label: string;
  value: string;
}

export function ChordChart({ data, height = 520 }: ChordChartProps) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Parse DQL rows ──────────────────────────────────────────────────────────
  const sessions: SessionRow[] = useMemo(() => data.map(row => ({
    pages:     Array.isArray(row["pages"]) ? (row["pages"] as string[]) : [],
    refDomain: String(row["refDomain"] ?? row["refdomain"] ?? ""),
  })), [data]);

  // ── Find top page categories ────────────────────────────────────────────────
  const topPages: string[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { pages } of sessions) {
      for (const p of pages) {
        const cat = groupPagePath(p);
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PAGES)
      .map(([cat]) => cat);
  }, [sessions]);

  // ── Build chord matrix ──────────────────────────────────────────────────────
  const { nodes, matrix } = useMemo(
    () => buildChordData(sessions, topPages),
    [sessions, topPages]
  );

  // ── Compute layout ──────────────────────────────────────────────────────────
  const arcs = useMemo(() => computeLayout(nodes, matrix), [nodes, matrix]);

  if (!data.length || arcs.length === 0) {
    return (
      <div style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: GA4_COLORS.textTertiary,
        fontSize: 13,
      }}>
        No navigation data available
      </div>
    );
  }

  // ── Build chord render list ─────────────────────────────────────────────────
  interface ChordRender {
    idx:   number;
    ni:    number;  // node i index
    nj:    number;  // node j index
    flow:  number;
    path:  string;
    color: string;
  }

  const chords: ChordRender[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (matrix[i][j] === 0) continue;
      const segI = arcs[i].subSegs.find(s => s.otherNodeIdx === j);
      const segJ = arcs[j].subSegs.find(s => s.otherNodeIdx === i);
      if (!segI || !segJ) continue;
      chords.push({
        idx:   chords.length,
        ni:    i,
        nj:    j,
        flow:  matrix[i][j],
        path:  chordPath(segI.start, segI.end, segJ.start, segJ.end),
        color: nodes[i].color,
      });
    }
  }

  // Sort by flow desc so smaller chords render on top
  chords.sort((a, b) => b.flow - a.flow);

  const totalFlow = matrix.reduce((s, row) => s + row.reduce((r, v) => r + v, 0), 0) / 2;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx_px = rect.left + rect.width  * (CX / SVG_SIZE);
    const cy_px = rect.top  + rect.height * (CY / SVG_SIZE);
    const dx = e.clientX - cx_px;
    const dy = e.clientY - cy_px;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scaleX = rect.width  / SVG_SIZE;

    // Detect arc hover (between CHORD_R and ARC_R scaled)
    const innerPx = CHORD_R * scaleX;
    const outerPx = ARC_R  * scaleX;
    if (dist < innerPx || dist > outerPx + 20) {
      setHoveredNode(null);
      setTooltip(null);
      return;
    }

    const angle = Math.atan2(dy, dx);
    // Find which arc this angle falls in
    for (const arc of arcs) {
      const a1 = arc.start;
      const a2 = arc.end;
      // Normalize angle to [-π, π] range for comparison
      let a = angle;
      // Check if angle is within [a1, a2] (all angles in [-π, π] space)
      // arcs start at -π/2 and go clockwise
      let lo = a1 % (2 * Math.PI);
      let hi = a2 % (2 * Math.PI);
      let testA = a % (2 * Math.PI);
      if (lo < 0) lo += 2 * Math.PI;
      if (hi < 0) hi += 2 * Math.PI;
      if (testA < 0) testA += 2 * Math.PI;
      const inArc = lo <= hi ? (testA >= lo && testA <= hi) : (testA >= lo || testA <= hi);
      if (inArc) {
        const nodeTotal = matrix[arc.nodeIdx].reduce((s, v) => s + v, 0) / 2;
        setHoveredNode(arc.nodeIdx);
        setTooltip({
          x: e.clientX,
          y: e.clientY,
          label: nodes[arc.nodeIdx].label,
          value: `${nodeTotal.toLocaleString()} connections`,
        });
        return;
      }
    }
    setHoveredNode(null);
    setTooltip(null);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredNode(null); setTooltip(null); }}
      >
        {/* ── Chord ribbons ────────────────────────────────────────────────── */}
        <g>
          {chords.map(c => {
            const isActive = hoveredNode === null || hoveredNode === c.ni || hoveredNode === c.nj;
            return (
              <path
                key={`chord-${c.idx}`}
                d={c.path}
                fill={c.color}
                opacity={isActive ? (hoveredNode !== null ? 0.72 : 0.42) : 0.06}
                style={{ transition: "opacity 0.18s" }}
              />
            );
          })}
        </g>

        {/* ── Arc segments (node rings) ─────────────────────────────────────── */}
        <g>
          {arcs.map(arc => {
            const node = nodes[arc.nodeIdx];
            const isHovered = hoveredNode === arc.nodeIdx;
            if (arc.end <= arc.start) return null;
            const p1 = pt(CHORD_R, arc.start);
            const p2 = pt(ARC_R,   arc.start);
            const p3 = pt(ARC_R,   arc.end);
            const p4 = pt(CHORD_R, arc.end);
            const largeArc = arc.end - arc.start > Math.PI ? 1 : 0;
            const arcFill = [
              `M ${p1.x} ${p1.y}`,
              `L ${p2.x} ${p2.y}`,
              `A ${ARC_R} ${ARC_R} 0 ${largeArc} 1 ${p3.x} ${p3.y}`,
              `L ${p4.x} ${p4.y}`,
              `A ${CHORD_R} ${CHORD_R} 0 ${largeArc} 0 ${p1.x} ${p1.y}`,
              "Z",
            ].join(" ");

            return (
              <path
                key={`arc-${arc.nodeIdx}`}
                d={arcFill}
                fill={node.color}
                opacity={hoveredNode === null ? 0.92 : isHovered ? 1 : 0.45}
                stroke={GA4_COLORS.cardBg}
                strokeWidth={1}
                style={{ transition: "opacity 0.18s", cursor: "pointer" }}
              />
            );
          })}
        </g>

        {/* ── Labels ───────────────────────────────────────────────────────── */}
        <g>
          {arcs.map(arc => {
            if (arc.end <= arc.start) return null;
            const midAngle = (arc.start + arc.end) / 2;
            const lp = pt(LABEL_R, midAngle);
            const isRight = Math.cos(midAngle) >= 0;
            const textAnchor = isRight ? "start" : "end";
            // Rotate label to follow circle tangent
            const deg = (midAngle * 180) / Math.PI;
            const rotate = isRight ? deg : deg + 180;
            return (
              <text
                key={`label-${arc.nodeIdx}`}
                x={lp.x}
                y={lp.y}
                textAnchor={textAnchor}
                dominantBaseline="central"
                fontSize={10}
                fontFamily={GA4_FONTS.family}
                fill={hoveredNode === null || hoveredNode === arc.nodeIdx
                  ? GA4_COLORS.textPrimary
                  : GA4_COLORS.textTertiary}
                transform={`rotate(${rotate}, ${lp.x}, ${lp.y})`}
                style={{ transition: "fill 0.18s", userSelect: "none", pointerEvents: "none" }}
              >
                {nodes[arc.nodeIdx].label}
              </text>
            );
          })}
        </g>

        {/* ── Centre stat ──────────────────────────────────────────────────── */}
        <text x={CX} y={CY - 8} textAnchor="middle" fontSize={22} fontWeight={300}
          fill={GA4_COLORS.textPrimary} fontFamily={GA4_FONTS.family}>
          {totalFlow >= 1000 ? (totalFlow / 1000).toFixed(1) + "K" : totalFlow.toLocaleString()}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={10} fontWeight={500}
          fill={GA4_COLORS.textSecondary} fontFamily={GA4_FONTS.family}
          style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
          connections
        </text>
      </svg>

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 14,
          top:  tooltip.y - 10,
          background: "#1b1f23",
          border: `1px solid #2a2f35`,
          borderRadius: 6,
          padding: "7px 12px",
          fontSize: 12,
          color: "#fff",
          pointerEvents: "none",
          zIndex: 9999,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 500 }}>{tooltip.label}</div>
          <div style={{ color: GA4_COLORS.textSecondary, marginTop: 2 }}>{tooltip.value}</div>
        </div>
      )}

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        marginTop: 8,
        justifyContent: "center",
      }}>
        {nodes.map((node, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}
            onMouseEnter={() => setHoveredNode(i)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <div style={{
              width: 10,
              height: 10,
              borderRadius: node.isExternal ? "50%" : 2,
              background: node.color,
              opacity: hoveredNode === null || hoveredNode === i ? 1 : 0.35,
              transition: "opacity 0.18s",
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11,
              color: hoveredNode === null || hoveredNode === i
                ? GA4_COLORS.textPrimary : GA4_COLORS.textTertiary,
              transition: "color 0.18s",
            }}>
              {node.label}{node.isExternal ? " ●" : ""}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: GA4_COLORS.textTertiary, textAlign: "center", marginTop: 6 }}>
        ● = external referrer channel &nbsp;|&nbsp; ■ = page category &nbsp;|&nbsp; Hover to focus
      </div>
    </div>
  );
}
