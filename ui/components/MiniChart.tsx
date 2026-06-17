/**
 * components/MiniChart.tsx
 *
 * Small sparkline-style area chart for inline metric trends.
 * Uses SVG for zero-dependency rendering.
 */

import React from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

interface MiniChartProps {
  data:    number[];
  width?:  number;
  height?: number;
  color?:  string;
  showArea?: boolean;
}

export function MiniChart({
  data,
  width = 200,
  height = 48,
  color = GA4_COLORS.primary,
  showArea = true,
}: MiniChartProps) {
  if (!data.length) return null;

  const padding = 2;
  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
    y: padding + (1 - (v - minVal) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {showArea && (
        <path d={areaPath} fill={color} fillOpacity={0.1} />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
