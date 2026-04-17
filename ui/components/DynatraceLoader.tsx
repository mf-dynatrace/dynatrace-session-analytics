/**
 * components/DynatraceLoader.tsx
 *
 * Animated loading overlay: Dynatrace logo with orbiting comet ring.
 * Shows as a centered overlay when data is refreshing.
 */

import React from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

const KEYFRAMES = `
@keyframes dt-orbit {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes dt-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.05); }
}
@keyframes dt-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

export function DynatraceLoader({ size = 120 }: { size?: number }) {
  const cx = size / 2;
  const orbitR = size * 0.42;   // orbit radius
  const logoScale = size / 120; // scale relative to default 120

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(15, 17, 20, 0.75)",
      backdropFilter: "blur(2px)",
      zIndex: 50,
      animation: "dt-fade-in 0.3s ease-out",
    }}>
      <style>{KEYFRAMES}</style>
      <div style={{
        position: "relative",
        width: size,
        height: size,
        animation: "dt-pulse 2.5s ease-in-out infinite",
      }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Outer track circle (faint) */}
          <circle
            cx={cx} cy={cx} r={orbitR}
            fill="none"
            stroke={GA4_COLORS.border}
            strokeWidth={1.5}
            opacity={0.3}
          />

          {/* Orbiting comet — conic gradient via rotating group */}
          <g style={{ transformOrigin: `${cx}px ${cx}px`, animation: "dt-orbit 1.8s linear infinite" }}>
            {/* Comet tail (arc gradient using multiple segments) */}
            {[...Array(8)].map((_, i) => {
              const angle = -(i * 12) * (Math.PI / 180); // trailing segments
              const x = cx + orbitR * Math.cos(angle);
              const y = cx + orbitR * Math.sin(angle);
              const opacity = 1 - i * 0.12;
              const r = 3.5 - i * 0.3;
              return (
                <circle
                  key={i}
                  cx={x} cy={y} r={Math.max(r, 0.5)}
                  fill={GA4_COLORS.primary}
                  opacity={opacity}
                />
              );
            })}
            {/* Comet head (bright) */}
            <circle
              cx={cx + orbitR} cy={cx} r={4}
              fill="#ffffff"
            />
            <circle
              cx={cx + orbitR} cy={cx} r={7}
              fill={GA4_COLORS.primary}
              opacity={0.4}
            />
          </g>

          {/* Dynatrace logo — three-bar chart icon inspired by DT */}
          <g transform={`translate(${cx}, ${cx}) scale(${logoScale})`}>
            {/* Bar 1 (left, short — green/teal) */}
            <rect x={-18} y={-2} width={10} height={20} rx={2.5}
              fill={GA4_COLORS.chart[2]} opacity={0.9} />
            {/* Bar 2 (center, tall — primary blue) */}
            <rect x={-5} y={-16} width={10} height={34} rx={2.5}
              fill={GA4_COLORS.primary} />
            {/* Bar 3 (right, medium — purple) */}
            <rect x={8} y={-8} width={10} height={26} rx={2.5}
              fill={GA4_COLORS.chart[3]} opacity={0.9} />
          </g>
        </svg>

        {/* Loading text */}
        <div style={{
          position: "absolute",
          bottom: -28,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          color: GA4_COLORS.textTertiary,
          letterSpacing: "1px",
          fontWeight: 500,
        }}>
          LOADING
        </div>
      </div>
    </div>
  );
}
