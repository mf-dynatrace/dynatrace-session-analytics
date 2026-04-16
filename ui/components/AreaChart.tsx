/**
 * components/AreaChart.tsx
 *
 * GA4-style area/line chart for time series data.
 * Pure SVG with hover tooltips.
 */

import React, { useState, useRef } from "react";
import { GA4_COLORS, GA4_FONTS } from "../styles/ga4Theme";

export interface TimeSeriesPoint {
  timestamp: string | number;
  value: number;
}

export interface ChartThreshold {
  value: number;
  color: string;
  label: string;
}

interface AreaChartProps {
  data:        TimeSeriesPoint[];
  height?:     number;
  color?:      string;
  label?:      string;
  formatY?:    (v: number) => string;
  thresholds?: ChartThreshold[];
}

export function AreaChart({
  data,
  height = 240,
  color = GA4_COLORS.primary,
  label = "",
  formatY = defaultFormat,
  thresholds = [],
}: AreaChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: GA4_COLORS.textTertiary }}>
        No data
      </div>
    );
  }

  const padding = { top: 20, right: thresholds.length ? 60 : 20, bottom: 32, left: 56 };
  const chartWidth = 800; // responsive via viewBox
  const chartHeight = height;
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const values = data.map(d => d.value);
  const thresholdValues = thresholds.map(t => t.value);
  const allValues = [...values, ...thresholdValues];
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * innerW,
    y: padding.top + (1 - (d.value - minVal) / range) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    const y = padding.top + (1 - i / 4) * innerH;
    return { val, y };
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xPx = xRatio * chartWidth;
    const idx = Math.round(((xPx - padding.left) / innerW) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      width="100%"
      height={height}
      style={{ display: "block" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padding.left} y1={t.y}
            x2={chartWidth - padding.right} y2={t.y}
            stroke={GA4_COLORS.divider} strokeWidth={1}
          />
          <text
            x={padding.left - 8} y={t.y + 4}
            textAnchor="end" fontSize={11}
            fill={GA4_COLORS.textTertiary}
            fontFamily={GA4_FONTS.family}
          >
            {formatY(t.val)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={color} fillOpacity={0.08} />

      {/* Threshold lines (RAG boundaries) */}
      {thresholds.map((t, i) => {
        const yPos = padding.top + (1 - (t.value - minVal) / range) * innerH;
        if (yPos < padding.top || yPos > padding.top + innerH) return null;
        return (
          <g key={`thresh-${i}`}>
            <line
              x1={padding.left} y1={yPos}
              x2={chartWidth - padding.right} y2={yPos}
              stroke={t.color} strokeWidth={1.5} strokeDasharray="6 4"
              strokeOpacity={0.7}
            />
            <text
              x={chartWidth - padding.right + 4} y={yPos + 4}
              fontSize={10} fontWeight={600}
              fill={t.color} fontFamily={GA4_FONTS.family}
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <path
        d={linePath}
        fill="none" stroke={color} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Hover indicator */}
      {hoverIdx !== null && points[hoverIdx] && (
        <>
          <line
            x1={points[hoverIdx].x} y1={padding.top}
            x2={points[hoverIdx].x} y2={padding.top + innerH}
            stroke={GA4_COLORS.textTertiary} strokeWidth={1} strokeDasharray="4 3"
          />
          <circle
            cx={points[hoverIdx].x} cy={points[hoverIdx].y}
            r={5} fill={color} stroke="#fff" strokeWidth={2}
          />
          {/* Tooltip */}
          <rect
            x={points[hoverIdx].x - 50} y={points[hoverIdx].y - 38}
            width={100} height={28} rx={4}
            fill={GA4_COLORS.textPrimary}
          />
          <text
            x={points[hoverIdx].x} y={points[hoverIdx].y - 20}
            textAnchor="middle" fontSize={12} fontWeight={500}
            fill="#fff" fontFamily={GA4_FONTS.family}
          >
            {formatY(data[hoverIdx].value)}
          </text>
        </>
      )}

      {/* Label */}
      {label && (
        <text
          x={padding.left} y={14}
          fontSize={12} fontWeight={500}
          fill={GA4_COLORS.textSecondary}
          fontFamily={GA4_FONTS.family}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

function defaultFormat(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + "K";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(1);
}
