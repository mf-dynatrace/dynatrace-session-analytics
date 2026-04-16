/**
 * pages/JourneysPage.tsx
 *
 * User Journeys page.
 * Shows page-to-page flows, Sankey diagram, exit pages, and top paths.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { SankeyChart } from "../components/SankeyChart";
import { SunburstChart } from "../components/SunburstChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface JourneysPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
}

export function JourneysPage({ appId, timeframe, refreshKey }: JourneysPageProps) {
  const [flows, setFlows] = useState<Record<string, unknown>[]>([]);
  const [sankeyData, setSankeyData] = useState<Record<string, unknown>[]>([]);
  const [exitPages, setExitPages] = useState<BarItem[]>([]);
  const [topPaths, setTopPaths] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [sankeyLoading, setSankeyLoading] = useState(true);
  const [maxSteps, setMaxSteps] = useState(5);
  const [showAllFlows, setShowAllFlows] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSankeyLoading(true);
    try {
      const results = await executeMultipleDql({
        flows:   Q.journeyPageFlows(appId, timeframe),
        sankey:  Q.journeySankeyFlows(appId, timeframe, maxSteps),
        exits:   Q.journeyExitPages(appId, timeframe),
        paths:   Q.journeyTopPaths(appId, timeframe),
      });

      setFlows(results.flows);
      setSankeyData(results.sankey);
      setExitPages(
        results.exits
          .filter(r => r["exitPage"])
          .map(r => ({ label: String(r["exitPage"]), value: Number(r["exits"]) || 0 }))
      );
      setTopPaths(results.paths);
    } catch (err) {
      console.error("[Journeys] fetch error:", err);
    } finally {
      setLoading(false);
      setSankeyLoading(false);
    }
  }, [appId, timeframe, maxSteps]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          User journeys
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Understand how users navigate through your site
        </p>
      </div>

      {/* Page flows */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Top page transitions</div>
        {loading ? <CardSkeleton height={400} /> : (
          <>
            <DataTable
              columns={[
                { key: "fromPage", label: "From page", width: "35%" },
                { key: "toPage", label: "To page", width: "35%" },
                { key: "transitions", label: "Transitions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={flows}
              maxRows={showAllFlows ? 25 : 10}
            />
            {flows.length > 10 && (
              <button
                onClick={() => setShowAllFlows(prev => !prev)}
                style={{
                  display: "block",
                  margin: "12px auto 0",
                  padding: "6px 16px",
                  background: "transparent",
                  border: `1px solid ${GA4_COLORS.border}`,
                  borderRadius: 6,
                  color: GA4_COLORS.primary,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {showAllFlows ? "Show less" : `Show all ${Math.min(flows.length, 25)} transitions`}
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Top paths */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top user paths</div>
          {loading ? <CardSkeleton height={350} /> : (
            <DataTable
              columns={[
                { key: "path", label: "Journey path", width: "50%" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "20%" },
                { key: "avgDepth", label: "Avg depth", align: "right",
                  format: v => Number(v).toFixed(1), width: "20%" },
              ]}
              data={topPaths}
              maxRows={12}
            />
          )}
        </div>

        {/* Exit pages */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Top exit pages</div>
          {loading ? <CardSkeleton height={350} /> : (
            <BarChart data={exitPages} color={GA4_COLORS.chart[6]} maxBars={10} />
          )}
        </div>
      </div>

      {/* Journey sunburst — entry/exit flow */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Journey sunburst</div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Inner ring shows entry pages, outer ring shows exit pages. Click to focus a category.
        </p>
        {sankeyLoading ? <CardSkeleton height={440} /> : (
          <SunburstChart data={sankeyData} />
        )}
      </div>

      {/* Sankey flow diagram — bottom of page */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={GA4_STYLES.sectionTitle}>Navigation flow</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, fontWeight: 500 }}>Steps</span>
            <select
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              style={{
                background: GA4_COLORS.cardBg,
                color: GA4_COLORS.textPrimary,
                border: `1px solid ${GA4_COLORS.border}`,
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
                minWidth: 52,
              }}
              title="Maximum navigation steps to display"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12, color: GA4_COLORS.textSecondary, margin: "0 0 12px" }}>
          Page categories grouped automatically from URL paths. Hover for details.
        </p>
        {sankeyLoading ? <CardSkeleton height={420} /> : (
          <SankeyChart data={sankeyData} topN={8} maxSteps={maxSteps} />
        )}
      </div>
    </div>
  );
}
