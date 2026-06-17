/**
 * components/DonutChart.tsx
 *
 * GA4-style donut chart for categorical breakdowns (channels, devices, browsers).
 * Pure SVG implementation.
 */

import React, { useState } from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

interface DonutSegment {
  label: string;
  value: number;
}

interface DonutChartProps {
  data:    DonutSegment[];
  size?:   number;
  colors?: readonly string[];
}

export function DonutChart({ data, size = 200, colors = GA4_COLORS.chart }: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2 - 8;
  const innerRadius = radius * 0.6;
  const cx = size / 2;
  const cy = size / 2;

  let currentAngle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(startAngle);
    const iy1 = cy + innerRadius * Math.sin(startAngle);
    const ix2 = cx + innerRadius * Math.cos(endAngle);
    const iy2 = cy + innerRadius * Math.sin(endAngle);

    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");

    return { path, color: colors[i % colors.length], segment: d, index: i };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {segments.map(s => (
          <path
            key={s.index}
            d={s.path}
            fill={s.color}
            opacity={hoveredIdx !== null && hoveredIdx !== s.index ? 0.4 : 1}
            style={{ transition: "opacity 0.2s", cursor: "pointer" }}
            onMouseEnter={() => setHoveredIdx(s.index)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
        {/* Center label */}
        {hoveredIdx !== null && (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={20} fontWeight={500} fill={GA4_COLORS.textPrimary}>
              {((data[hoveredIdx].value / total) * 100).toFixed(1)}%
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill={GA4_COLORS.textSecondary}>
              {data[hoveredIdx].label}
            </text>
          </>
        )}
        {hoveredIdx === null && (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize={18} fontWeight={500} fill={GA4_COLORS.textPrimary}>
            {total.toLocaleString()}
          </text>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.slice(0, 8).map((d, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: colors[i % colors.length], flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: GA4_COLORS.textPrimary, whiteSpace: "nowrap" }}>
              {d.label}
            </span>
            <span style={{ fontSize: 13, color: GA4_COLORS.textSecondary, marginLeft: "auto" }}>
              {d.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
