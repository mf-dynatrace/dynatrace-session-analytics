/**
 * components/LoadingState.tsx
 *
 * GA4-style loading spinner and skeleton states.
 */

import React from "react";
import { GA4_COLORS } from "../styles/ga4Theme";

export function LoadingSpinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
        <circle
          cx={12} cy={12} r={10}
          fill="none" stroke={GA4_COLORS.border} strokeWidth={3}
        />
        <path
          d="M12 2 A10 10 0 0 1 22 12"
          fill="none" stroke={GA4_COLORS.primary} strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div style={{
      background: GA4_COLORS.cardBg,
      borderRadius: 8,
      border: `1px solid ${GA4_COLORS.cardBorder}`,
      height,
      animation: "pulse-bg 1.5s ease-in-out infinite",
    }}>
      <style>{`@keyframes pulse-bg { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
