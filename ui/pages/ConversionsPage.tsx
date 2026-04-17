/**
 * pages/ConversionsPage.tsx
 *
 * Conversions page.
 * Shows page depth funnel, conversion goal pages, and overall conversion rate.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface ConversionsPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  onLoadEnd?: () => void;
}

export function ConversionsPage({ appId, timeframe, refreshKey, onLoadEnd }: ConversionsPageProps) {
  const [funnel, setFunnel] = useState<BarItem[]>([]);
  const [goalPages, setGoalPages] = useState<Record<string, unknown>[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [convertedSessions, setConvertedSessions] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        funnel: Q.conversionPageDepthFunnel(appId, timeframe),
        goals:  Q.conversionGoalPages(appId, timeframe),
        rate:   Q.conversionRate(appId, timeframe),
      });

      const funnelRow = results.funnel[0];
      if (funnelRow) {
        setFunnel([
          { label: "1+ pages", value: Number(funnelRow["reached1"]) || 0 },
          { label: "2+ pages", value: Number(funnelRow["reached2"]) || 0 },
          { label: "3+ pages", value: Number(funnelRow["reached3"]) || 0 },
          { label: "5+ pages", value: Number(funnelRow["reached5"]) || 0 },
          { label: "10+ pages", value: Number(funnelRow["reached10"]) || 0 },
        ]);
      }

      setGoalPages(results.goals);

      const rateRow = results.rate[0];
      if (rateRow) {
        setTotalSessions(Number(rateRow["totalSessions"]) || 0);
        setConvertedSessions(Number(rateRow["convertedSessions"]) || 0);
        setConversionRate(Number(rateRow["conversionRate"]) || 0);
      }
    } catch (err) {
      console.error("[Conversions] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Conversions
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Goal completions and conversion funnel analysis
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total Sessions" value={totalSessions} loading={loading} />
        <MetricCard label="Converted Sessions" value={convertedSessions} loading={loading} />
        <MetricCard label="Conversion Rate" value={`${conversionRate.toFixed(1)}%`} loading={loading} />
      </div>

      <div style={{
        ...GA4_STYLES.card,
        background: `linear-gradient(135deg, ${GA4_COLORS.primaryBg}, ${GA4_COLORS.cardBg})`,
      }}>
        <div style={{ fontSize: 12, color: GA4_COLORS.textSecondary, marginBottom: 4 }}>
          Conversion defined as sessions reaching: booking, order, checkout, confirm, payment, thank, success, basket, cart, or reserve pages
        </div>
      </div>

      {/* Page depth funnel */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Session depth funnel</div>
        {loading ? <CardSkeleton height={280} /> : (
          <BarChart data={funnel} color={GA4_COLORS.primary} maxBars={5} />
        )}
      </div>

      {/* Goal pages */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Goal pages detected</div>
        <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 12 }}>
          Pages matching conversion keywords (booking, order, checkout, confirm, payment, etc.)
        </div>
        {loading ? <CardSkeleton height={320} /> : (
          goalPages.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: GA4_COLORS.textTertiary }}>
              No goal pages detected in this timeframe. Try a longer time range.
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "page.url.path", label: "Page", width: "40%" },
                { key: "views", label: "Views", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "15%" },
                { key: "sessions", label: "Sessions", align: "right",
                  format: v => Number(v).toLocaleString(), width: "15%" },
                { key: "users", label: "Users", align: "right",
                  format: v => Number(v).toLocaleString(), width: "15%" },
              ]}
              data={goalPages}
              maxRows={20}
            />
          )
        )}
      </div>
    </div>
  );
}
