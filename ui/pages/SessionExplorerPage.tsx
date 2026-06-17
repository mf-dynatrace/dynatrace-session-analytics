/**
 * pages/SessionExplorerPage.tsx
 *
 * Session Explorer page.
 * Shows a searchable table of individual sessions with key dimensions.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DataTable } from "../components/DataTable";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface SessionExplorerPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  onLoadEnd?: () => void;
}

function formatDuration(ns: number): string {
  const totalSec = ns;
  if (totalSec < 60) return `${Math.floor(totalSec)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min}m ${sec}s`;
}

export function SessionExplorerPage({ appId, timeframe, refreshKey, globalFilter, onLoadEnd }: SessionExplorerPageProps) {
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        sessions: Q.sessionList(appId, timeframe),
      });
      setSessions(results.sessions);
    } catch (err) {
      console.error("[SessionExplorer] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const totalSessions = sessions.length;
  const withErrors = sessions.filter(s => Number(s["errors"]) > 0).length;
  const avgPages = totalSessions > 0
    ? sessions.reduce((sum, s) => sum + (Number(s["pageViews"]) || 0), 0) / totalSessions
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Session explorer
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Browse individual user sessions
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Sessions loaded" value={totalSessions} loading={loading} />
        <MetricCard label="With errors" value={withErrors} loading={loading} />
        <MetricCard label="Avg pages/session" value={avgPages.toFixed(1)} loading={loading} />
      </div>

      {/* Session table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Recent sessions</div>
        {loading ? <CardSkeleton height={500} /> : (
          <DataTable
            columns={[
              { key: "startTime", label: "Start time", width: "14%",
                format: v => {
                  try { return new Date(String(v)).toLocaleString(); } catch { return String(v); }
                }},
              { key: "firstPage", label: "Landing page", width: "18%" },
              { key: "pageViews", label: "Pages", align: "right", width: "7%",
                format: v => Number(v).toLocaleString() },
              { key: "durationSec", label: "Duration", align: "right", width: "10%",
                format: v => formatDuration(Number(v)) },
              { key: "errors", label: "Errors", align: "right", width: "7%",
                format: v => {
                  const n = Number(v);
                  return n > 0 ? `⚠ ${n}` : "0";
                }},
              { key: "device.type", label: "Device", width: "8%" },
              { key: "browser.name", label: "Browser", width: "10%" },
              { key: "geo.country.iso_code", label: "Country", width: "7%" },
              { key: "lastPage", label: "Exit page", width: "18%" },
            ]}
            data={sessions}
            maxRows={50}
          />
        )}
      </div>
    </div>
  );
}
