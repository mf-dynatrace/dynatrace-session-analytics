/**
 * pages/RetentionPage.tsx
 *
 * Retention page.
 * Shows new vs returning visitors, returning visitor depth & frequency,
 * "new" visitor quality analysis (cookie/tracker blocking signals),
 * day-of-week patterns, and browser breakdown.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { MetricCard } from "../components/MetricCard";
import { AreaChart, TimeSeriesPoint } from "../components/AreaChart";
import { DonutChart } from "../components/DonutChart";
import { BarChart, BarItem } from "../components/BarChart";
import { DataTable } from "../components/DataTable";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface RetentionPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  onLoadEnd?: () => void;
}

export function RetentionPage({ appId, timeframe, refreshKey, globalFilter = "", onLoadEnd }: RetentionPageProps) {
  const [dailyTrend, setDailyTrend] = useState<TimeSeriesPoint[]>([]);
  const [sessionFreq, setSessionFreq] = useState<BarItem[]>([]);
  const [newVsReturn, setNewVsReturn] = useState<{ label: string; value: number }[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [returningPct, setReturningPct] = useState(0);
  const [loyaltyTiers, setLoyaltyTiers] = useState<Record<string, unknown>[]>([]);
  const [returnFrequency, setReturnFrequency] = useState<BarItem[]>([]);
  const [newQuality, setNewQuality] = useState<{
    totalNew: number; privacyBrowserNew: number; singlePageNew: number; multiPageNew: number;
  } | null>(null);
  const [newByBrowser, setNewByBrowser] = useState<BarItem[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<BarItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        daily:     Q.withFilter(Q.retentionDailyVisitors(appId, timeframe), globalFilter),
        freq:      Q.withFilter(Q.retentionSessionFrequency(appId, timeframe), globalFilter),
        nvr:       Q.withFilter(Q.retentionNewVsReturning(appId, timeframe), globalFilter),
        loyalty:   Q.withFilter(Q.retentionReturningDepth(appId, timeframe), globalFilter),
        retFreq:   Q.withFilter(Q.retentionReturningFrequency(appId, timeframe), globalFilter),
        newQual:   Q.withFilter(Q.retentionNewVisitorQuality(appId, timeframe), globalFilter),
        newBrow:   Q.withFilter(Q.retentionNewByBrowser(appId, timeframe), globalFilter),
        dow:       Q.withFilter(Q.retentionDayOfWeek(appId, timeframe), globalFilter),
      });

      setDailyTrend(extractTimeseries(results.daily));

      const order = ["1 session", "2-3 sessions", "4-5 sessions", "6-10 sessions", "11+ sessions"];
      setSessionFreq(
        results.freq
          .filter(r => r["freqBucket"])
          .sort((a, b) => order.indexOf(String(a["freqBucket"])) - order.indexOf(String(b["freqBucket"])))
          .map(r => ({ label: String(r["freqBucket"]), value: Number(r["users"]) || 0 }))
      );

      const nvrData = results.nvr
        .filter(r => r["visitorType"])
        .map(r => ({ label: String(r["visitorType"]), value: Number(r["users"]) || 0 }));
      setNewVsReturn(nvrData);

      const total = nvrData.reduce((s, d) => s + d.value, 0);
      setTotalUsers(total);
      const returning = nvrData.find(d => d.label === "Returning visitor")?.value ?? 0;
      setReturningPct(total > 0 ? (returning / total) * 100 : 0);

      // Loyalty tiers
      setLoyaltyTiers(results.loyalty.filter(r => r["loyaltyTier"]));

      // Return frequency bands
      const freqOrder = ["Daily (5+/wk)", "Several times/wk", "Weekly", "Monthly or less"];
      setReturnFrequency(
        results.retFreq
          .filter(r => r["freqBand"])
          .sort((a, b) => freqOrder.indexOf(String(a["freqBand"])) - freqOrder.indexOf(String(b["freqBand"])))
          .map(r => ({ label: String(r["freqBand"]), value: Number(r["users"]) || 0 }))
      );

      // New visitor quality
      const nqRow = results.newQual[0];
      if (nqRow) {
        setNewQuality({
          totalNew: Number(nqRow["totalNew"]) || 0,
          privacyBrowserNew: Number(nqRow["privacyBrowserNew"]) || 0,
          singlePageNew: Number(nqRow["singlePageNew"]) || 0,
          multiPageNew: Number(nqRow["multiPageNew"]) || 0,
        });
      }

      // New by browser
      setNewByBrowser(
        results.newBrow
          .filter(r => r["browserName"])
          .map(r => ({ label: String(r["browserName"]), value: Number(r["newVisitors"]) || 0 }))
      );

      // Day of week — sort Mon to Sun regardless of DQL sort
      const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayIndex = (name: string) => {
        const short = String(name).slice(0, 3);
        const idx = dayOrder.indexOf(short);
        return idx >= 0 ? idx : 99;
      };
      setDayOfWeek(
        results.dow
          .filter(r => r["dayName"])
          .sort((a, b) => dayIndex(String(a["dayName"])) - dayIndex(String(b["dayName"])))
          .map(r => ({ label: String(r["dayName"]).slice(0, 3), value: Number(r["visits"]) || 0 }))
      );
    } catch (err) {
      console.error("[Retention] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // Derived new-visitor quality metrics
  const privacyPct = newQuality && newQuality.totalNew > 0
    ? ((newQuality.privacyBrowserNew / newQuality.totalNew) * 100).toFixed(1)
    : "0";
  const singlePagePct = newQuality && newQuality.totalNew > 0
    ? ((newQuality.singlePageNew / newQuality.totalNew) * 100).toFixed(1)
    : "0";
  const suspectNew = newQuality
    ? Math.round(newQuality.privacyBrowserNew * 0.3 + (newQuality.singlePageNew - newQuality.privacyBrowserNew * 0.3) * 0.1)
    : 0;
  const suspectPct = newQuality && newQuality.totalNew > 0
    ? ((suspectNew / newQuality.totalNew) * 100).toFixed(0)
    : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Retention
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Visitor loyalty, return frequency, and new visitor quality analysis
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total Visitors" value={totalUsers} loading={loading} />
        <MetricCard label="Returning %" value={`${returningPct.toFixed(1)}%`} loading={loading} />
        <MetricCard label="New Visitors" value={newQuality?.totalNew ?? 0} loading={loading} />
        <MetricCard label="Suspect New %" value={`~${suspectPct}%`} loading={loading}
          subtitle="Likely returning (cookie reset)" />
      </div>

      {/* Daily visitors trend */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Unique visitors over time</div>
        {loading ? <CardSkeleton height={240} /> : (
          <AreaChart data={dailyTrend} color={GA4_COLORS.primary} label="Visitors" />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* New vs returning */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>New vs returning visitors</div>
          {loading ? <CardSkeleton height={250} /> : (
            <DonutChart data={newVsReturn} colors={[GA4_COLORS.primary, GA4_COLORS.chart[3]]} />
          )}
        </div>

        {/* Session frequency */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions per visitor</div>
          {loading ? <CardSkeleton height={250} /> : (
            <BarChart data={sessionFreq} color={GA4_COLORS.chart[1]} maxBars={5} />
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* RETURNING VISITORS DEEP DIVE */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: GA4_COLORS.textPrimary }}>
          Returning visitors — deep dive
        </h2>
        <p style={{ fontSize: 13, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          How loyal are your returning visitors and how often do they come back?
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Loyalty tiers */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Loyalty tiers</div>
          <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 12 }}>
            Returning visitors grouped by total sessions in this period
          </div>
          {loading ? <CardSkeleton height={200} /> : (
            loyaltyTiers.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: GA4_COLORS.textTertiary }}>
                No returning visitors in this timeframe
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "loyaltyTier", label: "Tier", width: "40%" },
                  { key: "users", label: "Visitors", align: "right" as const, showBar: true,
                    format: (v: unknown) => Number(v).toLocaleString(), width: "30%" },
                  { key: "avgSessions", label: "Avg Sessions", align: "right" as const,
                    format: (v: unknown) => Number(v).toFixed(1), width: "30%" },
                ]}
                data={loyaltyTiers}
                maxRows={4}
              />
            )
          )}
        </div>

        {/* Return frequency */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Visit frequency</div>
          <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 12 }}>
            How often returning visitors come back (active days per week)
          </div>
          {loading ? <CardSkeleton height={200} /> : (
            <BarChart data={returnFrequency} color={GA4_COLORS.chart[2]} maxBars={4} />
          )}
        </div>
      </div>

      {/* Day of week */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Returning visitor day-of-week pattern</div>
        <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 12 }}>
          Which days do returning visitors prefer to come back?
        </div>
        {loading ? <CardSkeleton height={200} /> : (
          <BarChart data={dayOfWeek} color={GA4_COLORS.chart[0]} maxBars={7} />
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* "NEW" VISITOR QUALITY ANALYSIS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: GA4_COLORS.textPrimary }}>
          "New" visitor quality analysis
        </h2>
        <p style={{ fontSize: 13, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Are your "new" visitors truly new, or are cookies being destroyed by privacy browsers?
        </p>
      </div>

      {/* Explainer banner */}
      <div style={{
        ...GA4_STYLES.card,
        background: `linear-gradient(135deg, ${GA4_COLORS.primaryBg}, ${GA4_COLORS.cardBg})`,
      }}>
        <div style={{ fontSize: 12, color: GA4_COLORS.textSecondary, lineHeight: 1.6 }}>
          <strong>Why "new" visitors may not be new:</strong> Browsers like Safari (ITP), Firefox (ETP), and
          Brave aggressively delete or partition cookies. A returning user on these browsers loses their
          <code style={{ fontSize: 11, background: "rgba(255,255,255,0.05)", padding: "1px 4px", borderRadius: 3 }}> dt.rum.instance.id</code> and
          appears as a new visitor on every visit. Key signals:
          <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
            <li><strong>Privacy browser %</strong> — High Safari/Firefox share among "new" visitors suggests cookie churn</li>
            <li><strong>Single-page bounce %</strong> — Bot traffic and preview crawlers create single-page "visits"</li>
            <li><strong>Multi-page "new"</strong> — New visitors who view 4+ pages likely know where they're going = returning</li>
          </ul>
        </div>
      </div>

      {/* Quality KPIs */}
      <div style={{ display: "flex", gap: GA4_SPACING.cardGap }}>
        <MetricCard label="Total 'New' Visitors" value={newQuality?.totalNew ?? 0} loading={loading} />
        <MetricCard label="Privacy Browser %" value={`${privacyPct}%`} loading={loading}
          subtitle="Safari, Firefox, Brave, DDG" />
        <MetricCard label="Single-Page Bounce" value={`${singlePagePct}%`} loading={loading}
          subtitle="1 page view only" />
        <MetricCard label="Multi-Page 'New'" value={newQuality?.multiPageNew ?? 0} loading={loading}
          subtitle="4+ pages (likely returning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* New by browser */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>"New" visitors by browser</div>
          <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 12 }}>
            <span style={{ color: "#f9ab00" }}>⚠</span> Safari &amp; Firefox dominating = high cookie churn risk
          </div>
          {loading ? <CardSkeleton height={250} /> : (
            <BarChart data={newByBrowser} color={GA4_COLORS.chart[4] || GA4_COLORS.primary} maxBars={10} />
          )}
        </div>

        {/* Cookie churn estimate */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Cookie churn estimate</div>
          <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginBottom: 16 }}>
            Estimated % of "new" visitors who are actually returning
          </div>
          {loading ? <CardSkeleton height={250} /> : newQuality ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
              <ChurnEstimateBar
                label="Privacy browsers (Safari ITP, Firefox ETP, Brave)"
                value={newQuality.privacyBrowserNew}
                total={newQuality.totalNew}
                churnRate={30}
                color="#f9ab00"
              />
              <ChurnEstimateBar
                label="Single-page bounces (bot/preview/accidental)"
                value={newQuality.singlePageNew}
                total={newQuality.totalNew}
                churnRate={15}
                color="#ea4335"
              />
              <ChurnEstimateBar
                label="Multi-page 'new' (navigates like a returner)"
                value={newQuality.multiPageNew}
                total={newQuality.totalNew}
                churnRate={50}
                color="#4285f4"
              />
              <div style={{
                marginTop: 8, padding: "12px 16px", borderRadius: 8,
                background: `${GA4_COLORS.primary}10`, border: `1px solid ${GA4_COLORS.primary}30`,
              }}>
                <div style={{ fontSize: 13, color: GA4_COLORS.textPrimary }}>
                  Estimated <strong>~{suspectPct}%</strong> of "new" visitors ({suspectNew.toLocaleString()})
                  are likely returning users with reset cookies
                </div>
                <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 4 }}>
                  Adjusted returning rate: ~{(returningPct + Number(suspectPct) * (100 - returningPct) / 100).toFixed(1)}%
                  (up from reported {returningPct.toFixed(1)}%)
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, textAlign: "center", color: GA4_COLORS.textTertiary }}>
              No data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cookie churn estimate bar component ─────────────────────────────────────

function ChurnEstimateBar({ label, value, total, churnRate, color }: {
  label: string; value: number; total: number; churnRate: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const estimated = Math.round(value * churnRate / 100);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: GA4_COLORS.textSecondary }}>{label}</span>
        <span style={{ color: GA4_COLORS.textTertiary }}>
          {value.toLocaleString()} ({pct.toFixed(1)}%) — ~{churnRate}% churn → ~{estimated.toLocaleString()} suspect
        </span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 4,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ── Timeseries extraction helper ────────────────────────────────────────────

function extractTimeseries(records: Record<string, unknown>[]): TimeSeriesPoint[] {
  const filtered = records.filter(Boolean);
  if (!filtered.length) return [];
  const record = filtered[0];
  const metricKey = Object.keys(record).find(k => k !== "timeframe" && k !== "interval");
  if (!metricKey) return [];
  const values = record[metricKey];
  if (!Array.isArray(values)) return [];
  const timeframe = record["timeframe"] as { start?: string } | undefined;
  const intervalNs = Number(record["interval"]) || 0;
  const startMs = timeframe?.start ? new Date(timeframe.start).getTime() : 0;
  const intervalMs = intervalNs / 1_000_000;
  return values.map((v, i) => ({
    timestamp: startMs && intervalMs ? new Date(startMs + i * intervalMs).toISOString() : String(i),
    value: Number(v) || 0,
  }));
}
