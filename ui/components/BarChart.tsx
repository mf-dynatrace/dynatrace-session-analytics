/**
 * components/BarChart.tsx
 *
 * GA4-style horizontal bar chart for categorical breakdowns.
 * Pure SVG.
 */

import React, { useState } from "react";
import { GA4_COLORS, GA4_FONTS } from "../styles/ga4Theme";

export interface BarItem {
  label: string;
  value: number;
}

interface BarChartProps {
  data:     BarItem[];
  height?:  number;
  color?:   string;
  formatV?: (v: number) => string;
  maxBars?: number;
}

export function BarChart({
  data,
  height,
  color = GA4_COLORS.primary,
  formatV = defaultFormat,
  maxBars = 10,
}: BarChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const items = data.slice(0, maxBars);
  const barH = 32;
  const gap = 4;
  const labelW = 160;
  const valueW = 80;
  const chartW = 600;
  const totalH = height ?? items.length * (barH + gap) + 8;
  const maxVal = Math.max(...items.map(d => d.value), 1);
  const barAreaW = chartW - labelW - valueW;

  return (
    <svg viewBox={`0 0 ${chartW} ${totalH}`} width="100%" height={totalH}>
      {items.map((d, i) => {
        const y = i * (barH + gap) + 4;
        const w = (d.value / maxVal) * barAreaW;
        const isHovered = hoverIdx === i;
        return (
          <g
            key={i}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: "default" }}
          >
            {/* Label */}
            <text
              x={labelW - 8} y={y + barH / 2 + 5}
              textAnchor="end" fontSize={13}
              fill={GA4_COLORS.textPrimary}
              fontFamily={GA4_FONTS.family}
            >
              {truncateLabel(d.label, 22)}
            </text>
            {/* Bar background */}
            <rect
              x={labelW} y={y + 4}
              width={barAreaW} height={barH - 8}
              rx={3} fill={GA4_COLORS.pageBg}
            />
            {/* Bar fill */}
            <rect
              x={labelW} y={y + 4}
              width={w} height={barH - 8}
              rx={3}
              fill={color}
              opacity={isHovered ? 1 : 0.75}
              style={{ transition: "width 0.3s ease, opacity 0.2s" }}
            />
            {/* Value */}
            <text
              x={labelW + barAreaW + 8} y={y + barH / 2 + 5}
              fontSize={13} fontWeight={500}
              fill={GA4_COLORS.textPrimary}
              fontFamily={GA4_FONTS.family}
            >
              {formatV(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function truncateLabel(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) + "…" : s;
}

function defaultFormat(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString();
}
