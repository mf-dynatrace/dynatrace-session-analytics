/**
 * pages/AcquisitionPage.tsx
 *
 * GA4-style Acquisition page.
 * Shows traffic channels, sources, new vs returning users.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DonutChart } from "../components/DonutChart";
import { DataTable } from "../components/DataTable";
import { BarChart } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface AcquisitionPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  globalFilterB?: string;
  onLoadEnd?: () => void;
}

export function AcquisitionPage({ appId, timeframe, refreshKey, globalFilter, globalFilterB, onLoadEnd }: AcquisitionPageProps) {
  const [channelData, setChannelData] = useState<Record<string, unknown>[]>([]);
  const [sourceData, setSourceData] = useState<Record<string, unknown>[]>([]);
  const [newVsReturning, setNewVsReturning] = useState<{ label: string; value: number }[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        channels:  Q.acquisitionByChannel(appId, timeframe),
        sources:   Q.acquisitionBySource(appId, timeframe),
        nvr:       Q.acquisitionNewVsReturning(appId, timeframe),
      });

      setChannelData(results.channels);
      setSourceData(results.sources);

      // Compute totals from channels
      let users = 0, sessions = 0;
      results.channels.forEach(r => {
        users += Number(r["users"]) || 0;
        sessions += Number(r["sessions"]) || 0;
      });
      setTotalUsers(users);
      setTotalSessions(sessions);

      // Device type breakdown
      setNewVsReturning(
        results.nvr
          .filter(r => r["device.type"])
          .map(r => ({ label: String(r["device.type"]), value: Number(r["users"]) || 0 }))
      );
    } catch (err) {
      console.error("[Acquisition] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const channelDonut = channelData
    .filter(r => r["channel"])
    .map(r => ({ label: String(r["channel"]), value: Number(r["sessions"]) || 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Traffic sources
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand where your users come from
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total Users" value={totalUsers} loading={loading} />
        <MetricCard label="Total Sessions" value={totalSessions} loading={loading} />
        <MetricCard
          label="Users"
          value={totalUsers}
          loading={loading}
        />
      </div>

      {/* Channels + New vs Returning */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions by channel</div>
          {loading ? <CardSkeleton height={220} /> : (
            <DonutChart data={channelDonut} />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions by device type</div>
          {loading ? <CardSkeleton height={220} /> : (
            <DonutChart
              data={newVsReturning}
              colors={[GA4_COLORS.primary, GA4_COLORS.chart[4]]}
            />
          )}
        </div>
      </div>

      {/* Channel breakdown table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Traffic by channel</div>
        {loading ? <CardSkeleton height={320} /> : (
          <DataTable
            columns={[
              { key: "channel", label: "Channel" },
              { key: "users", label: "Users", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "15%" },
              { key: "sessions", label: "Sessions", align: "right",
                format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={channelData}
          />
        )}
      </div>

      {/* Top sources table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top traffic sources</div>
        {loading ? <CardSkeleton height={320} /> : (
          <DataTable
            columns={[
              { key: "source", label: "Source" },
              { key: "users", label: "Users", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "20%" },
              { key: "sessions", label: "Sessions", align: "right",
                format: v => Number(v).toLocaleString(), width: "20%" },
            ]}
            data={sourceData}
            maxRows={15}
          />
        )}
      </div>
    </div>
  );
}
