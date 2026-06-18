/**
 * components/SunburstChart.tsx
 *
 * Multi-ring hierarchical sunburst — shows real navigation paths.
 *
 * DEFAULT MODE (selectedPage = null):
 *   Ring 1 = entry / landing pages
 *   Ring 2 = 2nd step in the journey
 *   Ring N = Nth navigation step  (up to MAX_DEPTH = 6)
 *
 * FOCUS MODE (selectedPage set):
 *   Centre disc = selected page + visit count
 *   Ring 1 = pages visited immediately after selectedPage
 *   Ring N = Nth step after selectedPage
 *
 * Arcs inherit their colour from the depth-1 ancestor (entry category).
 * Each successive ring is a progressively lighter shade of that colour.
 * Arcs smaller than MIN_FRAC of their parent are merged into "Other".
 */

import React, { useMemo, useState } from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

// ── Page grouping (mirrors SankeyChart) ──────────────────────────────────────

function groupPagePath(path: string): string {
  if (!path || path === "/") return "Home";
  const clean = path.replace(/^\/+/, "").split("/")[0].split("?")[0];
  if (!clean) return "Home";
  return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
}

// ── Colours ───────────────────────────────────────────────────────────────────

const PRESET: Record<string, string> = {
  Home:           "#1496ff",
  Menu:           "#fd8232",
  "Book a table": "#73be28",
  Order:          "#00b9cc",
  Find:           "#6f2da8",
  "My account":   "#6366f1",
  Offers:         "#ec4899",
  Other:          "#9ba3ab",
};
const EXTRAS = ["#14a8f5", "#9355b7", "#b4dc00", "#eda61e", "#c41425", "#00c896", "#ff6b6b"];

function baseColor(cat: string, map: Map<string, string>): string {
  if (map.has(cat)) return map.get(cat)!;
  const lo = cat.toLowerCase();
  for (const [k, v] of Object.entries(PRESET)) {
    if (k.toLowerCase() === lo || lo.startsWith(k.toLowerCase().split(" ")[0])) {
      map.set(cat, v); return v;
    }
  }
  const c = EXTRAS[map.size % EXTRAS.length];
  map.set(cat, c); return c;
}

function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const fmt = (n: number) => Math.round(n + (255 - n) * t).toString(16).padStart(2, "0");
  return `#${fmt(r)}${fmt(g)}${fmt(b)}`;
}

// ── Geometry ──────────────────────────────────────────────────────────────────

const MAX_DEPTH = 6;
const R_CENTRE  = 65;   // centre disc radius
const RING_W    = 34;   // width of each ring in px
const CX        = 270;
const CY        = 270;
const SVG_SIZE  = 540;
const PAD       = 0.013; // gap between arcs (radians)

/**
 * When an arc spans nearly the full circle (start ≈ end point), SVG arc
 * commands become degenerate and renderers split or drop them.
 * Detect this and return a special donut path instead.
 */
function isNearFullCircle(sa: number, ea: number): boolean {
  return ea - sa > Math.PI * 2 - 0.06;
}

/**
 * Full-donut path using even-odd fill rule.
 * Two concentric circles drawn in opposite directions so the inner one
 * becomes a transparent hole.
 */
function donutPath(ir: number, or_: number): string {
  // Outer circle CW (sweep=1), split at top/bottom to avoid degenerate arc
  const outer = `M 0 ${-or_} A ${or_} ${or_} 0 1 1 0 ${or_} A ${or_} ${or_} 0 1 1 0 ${-or_}`;
  // Inner circle CCW (sweep=0) — punches the hole
  const inner = `M 0 ${-ir} A ${ir} ${ir} 0 1 0 0 ${ir} A ${ir} ${ir} 0 1 0 0 ${-ir}`;
  return `${outer} ${inner}`;
}

function arcPath(sa: number, ea: number, ir: number, or_: number): string {
  const s = sa + PAD / 2;
  const e = ea - PAD / 2;
  if (e <= s) return "";
  const c  = (a: number) => Math.cos(a - Math.PI / 2);
  const sn = (a: number) => Math.sin(a - Math.PI / 2);
  const la = e - s > Math.PI ? 1 : 0;
  return [
    `M ${or_ * c(s)} ${or_ * sn(s)}`,
    `A ${or_} ${or_} 0 ${la} 1 ${or_ * c(e)} ${or_ * sn(e)}`,
    `L ${ir  * c(e)} ${ir  * sn(e)}`,
    `A ${ir}  ${ir}  0 ${la} 0 ${ir  * c(s)} ${ir  * sn(s)} Z`,
  ].join(" ");
}

function ArcLabel({ sa, ea, ir, or_, text, fs }: {
  sa: number; ea: number; ir: number; or_: number; text: string; fs: number;
}) {
  const span = ea - sa;
  if (span < 0.15) return null;
  const mid = (sa + ea) / 2 - Math.PI / 2;
  const r   = (ir + or_) / 2;
  const rot = (mid + Math.PI / 2) * 180 / Math.PI;
  const adj = rot > 90 && rot < 270 ? rot + 180 : rot;
  const lbl = span < 0.27
    ? text.split(/\s/)[0].slice(0, 5)
    : text.length > 9 ? text.slice(0, 8) + "…" : text;
  return (
    <text
      x={r * Math.cos(mid)} y={r * Math.sin(mid)}
      fontSize={fs} fill="white" fontWeight="600"
      textAnchor="middle" dominantBaseline="middle"
      transform={`rotate(${adj - 90},${r * Math.cos(mid)},${r * Math.sin(mid)})`}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {lbl}
    </text>
  );
}

// ── Tree model ────────────────────────────────────────────────────────────────

interface TreeNode {
  name:     string;
  sessions: number;
  children: Map<string, TreeNode>;
}
const mkNode = (name: string): TreeNode => ({ name, sessions: 0, children: new Map() });

/**
 * Build a path tree from raw session data.
 *
 * focusPage = null  → each session contributes pages[0..maxDepth-1]
 * focusPage = "X"   → for every occurrence of X in a session, contribute
 *                     the next maxDepth pages after that occurrence
 */
function buildTree(
  rows: Record<string, unknown>[],
  focusPage: string | null,
  maxDepth: number,
): { root: TreeNode; total: number } {
  const root = mkNode("root");
  let total  = 0;

  for (const row of rows) {
    const raw = row["pages"];
    if (!Array.isArray(raw) || !raw.length) continue;
    const pages = raw.map(p => groupPagePath(String(p ?? "")));

    const seqs: string[][] = focusPage
      ? pages.flatMap((p, i) =>
          p === focusPage
            ? [pages.slice(i + 1, i + 1 + maxDepth).filter(Boolean)]
            : []
        ).filter(s => s.length > 0)
      : [pages.slice(0, maxDepth)];

    for (const seq of seqs) {
      total++;
      root.sessions++;
      let node = root;
      for (const pg of seq) {
        if (!node.children.has(pg)) node.children.set(pg, mkNode(pg));
        node = node.children.get(pg)!;
        node.sessions++;
      }
    }
  }
  return { root, total };
}

// ── Arc layout ────────────────────────────────────────────────────────────────

interface ArcDatum {
  name:          string;
  depth:         number;       // 1-based ring index
  sessions:      number;
  parentSessions: number;
  startAngle:    number;
  endAngle:      number;
  rootCat:       string;       // depth-1 ancestor → drives colour
  path:          string[];     // breadcrumb from depth 1
}

const MIN_FRAC = 0.025; // arcs < 2.5% of parent → merged into "Other"

function layoutArcs(root: TreeNode, maxDepth: number): ArcDatum[] {
  const out: ArcDatum[] = [];

  function walk(
    node:    TreeNode,
    depth:   number,
    sa:      number,
    ea:      number,
    rootCat: string,
    path:    string[],
  ) {
    if (depth > maxDepth || !node.children.size) return;
    const pTotal = node.sessions;
    if (!pTotal) return;
    const span = ea - sa;

    // split children into significant vs small-merged-to-Other
    const kids = [...node.children.values()].sort((a, b) => b.sessions - a.sessions);
    const kept: TreeNode[] = [];
    let otherN = 0;
    for (const k of kids) {
      k.sessions / pTotal >= MIN_FRAC ? kept.push(k) : (otherN += k.sessions);
    }
    if (otherN > 0) { const o = mkNode("Other"); o.sessions = otherN; kept.push(o); }

    let angle = sa;
    for (const child of kept) {
      const cs = angle;
      const ce = angle + (child.sessions / pTotal) * span;
      const cr = depth === 1 ? child.name : rootCat;
      const cp = [...path, child.name];
      out.push({
        name: child.name, depth, sessions: child.sessions,
        parentSessions: pTotal, startAngle: cs, endAngle: ce, rootCat: cr, path: cp,
      });
      walk(child, depth + 1, cs, ce, cr, cp);
      angle = ce;
    }
  }

  walk(root, 1, 0, 2 * Math.PI, "", []);
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SunburstChartProps {
  data: Record<string, unknown>[];
  selectedPage?: string | null;
  svgSize?: number;   // rendered width/height in px (default 500); viewBox stays at SVG_SIZE=540
  compact?: boolean;  // hides ring guide and narrows legend — use in dual-sunburst compare mode
}

export function SunburstChart({ data: rawData, selectedPage, svgSize = 500, compact = false }: SunburstChartProps) {
  const [hovered,  setHovered]  = useState<ArcDatum | null>(null);
  const [mouse,    setMouse]    = useState({ x: 0, y: 0 });
  const [focused,  setFocused]  = useState<string | null>(null);

  // Reset focus when the page selection changes
  const prevSelectedPage = React.useRef(selectedPage);
  if (prevSelectedPage.current !== selectedPage) {
    prevSelectedPage.current = selectedPage;
    // flush focus — done via useEffect below to avoid render-time setState
  }
  React.useEffect(() => { setFocused(null); }, [selectedPage]);

  const { root, total } = useMemo(
    () => buildTree(rawData, selectedPage ?? null, MAX_DEPTH),
    [rawData, selectedPage],
  );
  const arcs = useMemo(() => layoutArcs(root, MAX_DEPTH), [root]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    arcs.filter(a => a.depth === 1).forEach(a => baseColor(a.name, m));
    return m;
  }, [arcs]);

  const arcColor = (a: ArcDatum) => {
    const b = baseColor(a.rootCat || a.name, colorMap);
    return a.depth === 1 ? b : lighten(b, ((a.depth - 1) / MAX_DEPTH) * 0.58);
  };

  const opacity = (a: ArcDatum) =>
    !focused || a.rootCat === focused || (a.depth === 1 && a.name === focused) ? 1 : 0.10;

  if (!arcs.length) {
    return (
      <div style={{ color: GA4_COLORS.textSecondary, textAlign: "center", padding: 40 }}>
        {selectedPage
          ? `No forward navigation data found after "${selectedPage}"`
          : "Not enough navigation data for sunburst chart"}
      </div>
    );
  }

  const depth1 = arcs.filter(a => a.depth === 1).sort((a, b) => b.sessions - a.sessions);
  const pct    = (n: number, of: number) => of ? ((n / of) * 100).toFixed(1) : "0.0";

  // Tooltip: clamp so it doesn't overflow the right/bottom edge of the 500px svg wrapper
  const ttLeft = Math.min(mouse.x + 16, 280);
  const ttTop  = Math.max(mouse.y - 60, 4);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
      {/* ── SVG ── */}
      <div
        style={{ flex: "0 0 auto", position: "relative" }}
        onMouseMove={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ display: "block", width: svgSize, height: svgSize }}
        >
          {/* background fill */}
          <circle cx={CX} cy={CY} r={R_CENTRE + MAX_DEPTH * RING_W + 10} fill={GA4_COLORS.pageBg} />

          {/* guide rings */}
          {Array.from({ length: MAX_DEPTH + 1 }, (_, i) => (
            <circle
              key={i} cx={CX} cy={CY} r={R_CENTRE + i * RING_W}
              fill="none" stroke={GA4_COLORS.border} strokeWidth="0.5"
            />
          ))}

          {/* arcs */}
          <g transform={`translate(${CX},${CY})`}>
            {arcs.map((arc, i) => {
              const ir  = R_CENTRE + (arc.depth - 1) * RING_W;
              const or_ = R_CENTRE + arc.depth * RING_W;
              return (
                <g
                  key={i}
                  style={{
                    opacity: opacity(arc),
                    transition: "opacity 0.2s",
                    cursor: arc.depth === 1 ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (arc.depth === 1) setFocused(f => f === arc.name ? null : arc.name);
                  }}
                  onMouseEnter={() => setHovered(arc)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <path
                    d={isNearFullCircle(arc.startAngle, arc.endAngle)
                      ? donutPath(ir, or_)
                      : arcPath(arc.startAngle, arc.endAngle, ir, or_)}
                    fill={arcColor(arc)}
                    fillRule={isNearFullCircle(arc.startAngle, arc.endAngle) ? "evenodd" : undefined}
                    stroke="white"
                    strokeWidth={arc.depth === 1 ? 1.5 : 0.7}
                  />
                  <ArcLabel
                    sa={arc.startAngle} ea={arc.endAngle}
                    ir={ir} or_={or_} text={arc.name}
                    fs={arc.depth === 1 ? 9 : 7.5}
                  />
                </g>
              );
            })}
          </g>

          {/* centre disc */}
          <circle cx={CX} cy={CY} r={R_CENTRE - 3} fill="white" stroke={GA4_COLORS.border} strokeWidth="1" />
          <text x={CX} y={CY - (selectedPage ? 13 : 8)}
            textAnchor="middle" fill={GA4_COLORS.textPrimary} fontSize={20} fontWeight="700">
            {total.toLocaleString()}
          </text>
          <text x={CX} y={CY + (selectedPage ? 3 : 8)}
            textAnchor="middle" fill={GA4_COLORS.textSecondary} fontSize={10}>
            {selectedPage ? "visits" : "sessions"}
          </text>
          {selectedPage && (
            <text x={CX} y={CY + 17}
              textAnchor="middle" fill={GA4_COLORS.textTertiary} fontSize={8}>
              via {selectedPage.length > 12 ? selectedPage.slice(0, 11) + "…" : selectedPage}
            </text>
          )}
          {focused && (
            <text
              x={CX} y={CY + (selectedPage ? 28 : 22)}
              textAnchor="middle" fill={GA4_COLORS.primary} fontSize={8.5}
              onClick={() => setFocused(null)} style={{ cursor: "pointer" }}
            >
              ✕ clear focus
            </text>
          )}
        </svg>

        {/* tooltip */}
        {hovered && (
          <div style={{
            position: "absolute",
            left: ttLeft, top: ttTop,
            background: "white",
            border: `1px solid ${GA4_COLORS.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            width: 210,
            pointerEvents: "none",
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            fontSize: 12,
            color: GA4_COLORS.textPrimary,
            lineHeight: 1.65,
          }}>
            <div style={{ fontWeight: 700, color: arcColor(hovered), marginBottom: 3 }}>
              {hovered.name}
            </div>
            {/* breadcrumb path */}
            <div style={{ fontSize: 10, color: GA4_COLORS.textTertiary, marginBottom: 5 }}>
              {(selectedPage
                ? [selectedPage, ...hovered.path]
                : hovered.path
              ).join(" → ")}
            </div>
            <div>
              <strong>{hovered.sessions.toLocaleString()}</strong>{" "}
              <span style={{ color: GA4_COLORS.textSecondary }}>
                {hovered.depth === 1
                  ? (selectedPage ? "went here next" : "started here")
                  : "continued here"}
              </span>
            </div>
            <div style={{ color: GA4_COLORS.textTertiary, fontSize: 11, marginTop: 2 }}>
              {pct(hovered.sessions, hovered.parentSessions)}% of prev. step
              {" · "}
              {pct(hovered.sessions, total)}% of all {selectedPage ? "visits" : "sessions"}
            </div>
          </div>
        )}
      </div>

      {/* ── Legend + ring guide ── */}
      <div style={{ flex: 1, minWidth: compact ? 90 : 180, maxWidth: compact ? 110 : undefined, paddingTop: 14, overflow: "hidden" }}>
        {/* Entry page / after-page legend */}
        <div style={{
          fontSize: compact ? 10 : 11, color: GA4_COLORS.textSecondary, fontWeight: 600,
          marginBottom: compact ? 6 : 10, textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {selectedPage ? `After "${selectedPage}"` : "Entry pages"}
        </div>

        {depth1.map(arc => (
          <div
            key={arc.name}
            style={{
              display: "flex", alignItems: "center", gap: compact ? 5 : 8, marginBottom: compact ? 3 : 5,
              cursor: "pointer",
              opacity: !focused || focused === arc.name ? 1 : 0.3,
              transition: "opacity 0.2s",
            }}
            onClick={() => setFocused(f => f === arc.name ? null : arc.name)}
          >
            <div style={{
              width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: 2,
              background: arcColor(arc), flexShrink: 0,
            }} />
            <span style={{ fontSize: compact ? 11 : 12, color: GA4_COLORS.textPrimary, flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {arc.name}
            </span>
            {!compact && (
              <span style={{ fontSize: 11, color: GA4_COLORS.textSecondary }}>
                {arc.sessions.toLocaleString()}
              </span>
            )}
            <span style={{
              fontSize: 10, color: GA4_COLORS.textTertiary,
              minWidth: 28, textAlign: "right", flexShrink: 0,
            }}>
              {pct(arc.sessions, total)}%
            </span>
          </div>
        ))}

        {/* Ring guide — hidden in compact mode */}
        {!compact && (
          <div style={{
            marginTop: 20,
            borderTop: `1px solid ${GA4_COLORS.border}`,
            paddingTop: 12,
          }}>
            <div style={{
              fontSize: 10, color: GA4_COLORS.textTertiary, fontWeight: 600,
              marginBottom: 7, textTransform: "uppercase",
            }}>
              Ring guide
            </div>
            {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map(d => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: GA4_COLORS.border, flexShrink: 0,
                }} />
                <span style={{ fontSize: 10, color: GA4_COLORS.textTertiary }}>
                  <strong>Ring {d}:</strong>{" "}
                  {d === 1
                    ? (selectedPage ? `1st page after ${selectedPage}` : "Entry / landing page")
                    : `Step ${d}${selectedPage ? ` after ${selectedPage}` : ""}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {focused && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setFocused(null)}
              style={{
                background: "transparent",
                border: `1px solid ${GA4_COLORS.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                color: GA4_COLORS.primary,
                cursor: "pointer",
              }}
            >
              ✕ Clear focus on "{focused}"
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── extractPageCategories — used by JourneysPage ──────────────────────────────

export function extractPageCategories(rawData: Record<string, unknown>[]): string[] {
  const cats = new Set<string>();
  for (const row of rawData) {
    const pages = row["pages"];
    if (!Array.isArray(pages)) continue;
    for (const p of pages) cats.add(groupPagePath(String(p ?? "")));
  }
  return [...cats].sort((a, b) => {
    if (a === "Home") return -1;
    if (b === "Home") return 1;
    return a.localeCompare(b);
  });
}
