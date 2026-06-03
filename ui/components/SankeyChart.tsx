/**
 * components/SankeyChart.tsx
 *
 * Generic Sankey diagram for user session page flows.
 * Receives per-session page arrays from DQL and performs all step extraction,
 * page grouping (top N categories per step + "Other" bucket), and transition
 * aggregation client-side to avoid DQL record-limit truncation.
 *
 * Uses d3-sankey for layout, SVG for rendering.
 */

import React, { useMemo, useState, useRef, useCallback } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { GA4_COLORS } from "../styles/ga4Theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SNode {
  id: string;
  category: string;
  step: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
  index?: number;
}

interface SLink {
  source: SNode | number | string;
  target: SNode | number | string;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
}

interface TooltipState {
  x: number;
  y: number;
  content: React.ReactNode;
}

interface SankeyChartProps {
  data: Record<string, unknown>[];
  width?: number;
  height?: number;
  topN?: number;
  maxSteps?: number;
}

// ── Colour palette (auto-assigned to categories) ─────────────────────────────

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6",
  "#06b6d4", "#ef4444", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e879f9", "#eab308", "#22d3ee", "#a855f7",
];

const OTHER_COLOR = "#64748b";

function getCategoryColor(category: string, colorMap: Map<string, string>): string {
  if (category === "Other") return OTHER_COLOR;
  if (!colorMap.has(category)) {
    colorMap.set(category, PALETTE[colorMap.size % PALETTE.length]);
  }
  return colorMap.get(category)!;
}

// ── Generic page grouping ────────────────────────────────────────────────────

function groupPagePath(path: string): string {
  if (!path || path === "/") return "Home";
  const clean = path.replace(/^\/+/, "").split("/")[0].split("?")[0];
  if (!clean) return "Home";
  return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
}

/**
 * Build Sankey nodes/links from per-session page arrays.
 * Each row has a `pages` field (array of URL paths) and `pageCount`.
 * Step extraction, page grouping, and transition aggregation all happen here.
 */
function buildSankeyData(
  rawData: Record<string, unknown>[],
  topN: number,
  maxSteps: number
): { nodes: SNode[]; links: SLink[]; totalSessions: number } {
  // Extract page arrays from session rows
  const sessions: string[][] = [];
  for (const row of rawData) {
    const pages = row["pages"];
    if (!Array.isArray(pages) || pages.length < 2) continue;
    // Limit to maxSteps pages per session
    const trimmed = pages.slice(0, maxSteps).map(p => String(p ?? ""));
    sessions.push(trimmed);
  }

  if (sessions.length === 0) return { nodes: [], links: [], totalSessions: 0 };

  // Step 1: Count category volume at each step position (for top-N selection)
  const stepCategoryVolume = new Map<number, Map<string, number>>();
  for (const pages of sessions) {
    for (let i = 0; i < pages.length; i++) {
      const step = i + 1;
      const cat = groupPagePath(pages[i]);
      if (!stepCategoryVolume.has(step)) stepCategoryVolume.set(step, new Map());
      const m = stepCategoryVolume.get(step)!;
      m.set(cat, (m.get(cat) ?? 0) + 1);
    }
  }

  // Step 2: Determine top-N categories per step
  const topCategories = new Map<number, Set<string>>();
  for (const [step, cats] of stepCategoryVolume) {
    const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    topCategories.set(step, new Set(sorted.slice(0, topN).map(([c]) => c)));
  }

  const resolveCategory = (step: number, path: string): string => {
    const cat = groupPagePath(path);
    const top = topCategories.get(step);
    return top && top.has(cat) ? cat : "Other";
  };

  // Step 3: Build transitions from consecutive steps
  const linkMap = new Map<string, number>();
  const nodeSet = new Set<string>();

  for (const pages of sessions) {
    for (let i = 0; i < pages.length - 1; i++) {
      const step = i + 1;
      const fromCat = resolveCategory(step, pages[i]);
      const toCat = resolveCategory(step + 1, pages[i + 1]);
      const fromId = `Step ${step}: ${fromCat}`;
      const toId = `Step ${step + 1}: ${toCat}`;

      nodeSet.add(fromId);
      nodeSet.add(toId);
      const key = `${fromId}|||${toId}`;
      linkMap.set(key, (linkMap.get(key) ?? 0) + 1);
    }
  }

  // Build nodes
  const nodes: SNode[] = [...nodeSet].map(id => {
    const match = id.match(/^Step (\d+): (.+)$/);
    return {
      id,
      step: match ? parseInt(match[1], 10) : 1,
      category: match ? match[2] : id,
    };
  });
  nodes.sort((a, b) => a.step - b.step || a.category.localeCompare(b.category));

  // Build links (top 150 to avoid clutter)
  const links = [...linkMap.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split("|||");
      return { source, target, value } as SLink;
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 150);

  // Prune disconnected nodes
  const connected = new Set<string>();
  for (const l of links) {
    connected.add(l.source as string);
    connected.add(l.target as string);
  }

  return {
    nodes: nodes.filter(n => connected.has(n.id)),
    links,
    totalSessions: sessions.length,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SankeyChart({
  data: rawData,
  width = 960,
  height: heightProp,
  topN = 8,
  maxSteps = 5,
}: SankeyChartProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toRelative = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: e.clientX, y: e.clientY };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const colorMap = useMemo(() => new Map<string, string>(), []);
  const { nodes: sankeyNodes, links: sankeyLinks, totalSessions } = useMemo(
    () => buildSankeyData(rawData, topN, maxSteps),
    [rawData, topN, maxSteps]
  );

  const height = heightProp ?? Math.max(400, sankeyNodes.length * 24);
  const margin = { top: 32, right: 120, bottom: 20, left: 20 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const graph = useMemo(() => {
    if (!sankeyNodes.length || !sankeyLinks.length) return null;

    try {
      const customAlign = (node: any) => (node as SNode).step - 1;
      const generator = sankey<SNode, SLink>()
        .nodeId((d: any) => d.id)
        .nodeAlign(customAlign)
        .nodeWidth(16)
        .nodePadding(10)
        .nodeSort(null as any)
        .extent([[0, 0], [innerW, innerH]]);

      return generator({
        nodes: sankeyNodes.map(n => ({ ...n })),
        links: sankeyLinks.map(l => ({ ...l })),
      });
    } catch (err) {
      console.error("[Sankey] Layout error:", err);
      return null;
    }
  }, [sankeyNodes, sankeyLinks, innerW, innerH]);

  const linkPath = sankeyLinkHorizontal();

  if (!graph) {
    return (
      <div style={{ color: GA4_COLORS.textSecondary, textAlign: "center", padding: 40 }}>
        Not enough navigation data for Sankey diagram
      </div>
    );
  }

  const steps = [...new Set(sankeyNodes.map(n => n.step))].sort((a, b) => a - b);
  const maxStep = steps[steps.length - 1] ?? 1;

  const isLinkHighlighted = (link: SLink): boolean => {
    if (!hoveredNode) return false;
    const src = link.source as SNode;
    const tgt = link.target as SNode;
    return src.id === hoveredNode || tgt.id === hoveredNode;
  };

  // ── Legend: unique categories across all nodes ──────────────────────────────
  const categories = [...new Set(sankeyNodes.map(n => n.category))].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  return (
    <div ref={containerRef} style={{ position: "relative" }} onMouseMove={(e) => {
      if (tooltip) { const p = toRelative(e); setTooltip(prev => prev ? { ...prev, x: p.x, y: p.y } : null); }
    }}>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, paddingLeft: 4 }}>
        {categories.map(cat => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: getCategoryColor(cat, colorMap),
            }} />
            <span style={{ fontSize: 11, color: GA4_COLORS.textSecondary }}>{cat}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: "block", width: "100%", height: "auto",
          background: GA4_COLORS.cardBg,
          borderRadius: 8,
          border: `1px solid ${GA4_COLORS.border}`,
        }}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>

          {/* Step column labels */}
          {steps.map(step => {
            const nodesInStep = graph.nodes.filter(n => n.step === step);
            if (nodesInStep.length === 0) return null;
            const x = ((nodesInStep[0].x0 ?? 0) + (nodesInStep[0].x1 ?? 0)) / 2;
            return (
              <text
                key={step}
                x={x}
                y={-14}
                textAnchor="middle"
                fill={GA4_COLORS.textSecondary}
                fontSize={11}
                fontWeight={600}
              >
                Step {step}
              </text>
            );
          })}

          {/* Links */}
          {graph.links.map((link, i) => {
            const srcNode = link.source as SNode;
            const highlighted = isLinkHighlighted(link) || hoveredLink === i;
            const color = getCategoryColor(srcNode.category, colorMap);

            return (
              <path
                key={i}
                d={linkPath(link as any) ?? ""}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={hoveredNode && !highlighted ? 0.06 : highlighted ? 0.7 : 0.3}
                style={{ transition: "stroke-opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredLink(i);
                  const tgtNode = link.target as SNode;
                  const p = toRelative(e);
                  setTooltip({
                    x: p.x, y: p.y,
                    content: (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          <span style={{ color: getCategoryColor(srcNode.category, colorMap) }}>{srcNode.category}</span>
                          {" → "}
                          <span style={{ color: getCategoryColor(tgtNode.category, colorMap) }}>{tgtNode.category}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                          Step {srcNode.step} → Step {tgtNode.step}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{link.value.toLocaleString()}</span>
                          <span style={{ color: "#94a3b8" }}> sessions</span>
                        </div>
                        {totalSessions > 0 && (
                          <div style={{ color: "#94a3b8", fontSize: 11 }}>
                            {((link.value / totalSessions) * 100).toFixed(1)}% of sessions
                          </div>
                        )}
                      </>
                    ),
                  });
                }}
                onMouseLeave={() => { setHoveredLink(null); setTooltip(null); }}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const nodeW = (node.x1 ?? 0) - (node.x0 ?? 0);
            const nodeH = (node.y1 ?? 0) - (node.y0 ?? 0);
            const dimmed = hoveredNode && hoveredNode !== node.id;
            const color = getCategoryColor(node.category, colorMap);
            const isLast = node.step === maxStep;

            return (
              <g
                key={node.id}
                style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredNode(node.id);
                  const p = toRelative(e);
                  setTooltip({
                    x: p.x, y: p.y,
                    content: (
                      <>
                        <div style={{ fontWeight: 600, color, marginBottom: 4 }}>{node.category}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Step {node.step}</div>
                        <div>
                          <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{(node.value ?? 0).toLocaleString()}</span>
                          <span style={{ color: "#94a3b8" }}> sessions</span>
                        </div>
                      </>
                    ),
                  });
                }}
                onMouseLeave={() => { setHoveredNode(null); setTooltip(null); }}
              >
                <rect
                  x={node.x0} y={node.y0}
                  width={nodeW} height={nodeH}
                  fill={color} rx={3}
                />
                {/* Label to the right of the node (or left for last step) */}
                {nodeH > 8 && (
                  <text
                    x={isLast ? (node.x0 ?? 0) - 4 : (node.x1 ?? 0) + 4}
                    y={(node.y0 ?? 0) + nodeH / 2}
                    dominantBaseline="middle"
                    textAnchor={isLast ? "end" : "start"}
                    fill={GA4_COLORS.textSecondary}
                    fontSize={nodeH > 14 ? 10 : 8}
                    fontWeight={500}
                  >
                    {(node.value ?? 0).toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x + 14, top: tooltip.y - 10,
          background: "rgba(32,33,36,0.97)",
          border: `1px solid ${GA4_COLORS.border}`,
          borderRadius: 8,
          padding: "10px 14px",
          maxWidth: 260,
          pointerEvents: "none",
          zIndex: 9999,
          fontSize: 12,
          color: "#e2e8f0",
          lineHeight: 1.5,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
