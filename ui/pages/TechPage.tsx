/**
 * pages/TechPage.tsx
 *
 * GA4-style Technology details page.
 * Shows browser, OS, device type, screen resolution, and geographic breakdowns.
 * Supports segment A/B comparison when globalFilterB is provided.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { DonutChart } from "../components/DonutChart";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

const COLOR_A = "#1a73e8";
const COLOR_B = "#e03e2d";

interface TechPageProps {
  appId: string;
  timeframe: string;
  globalFilter?: string;
  globalFilterB?: string;
  refreshKey: number;
  onLoadEnd?: () => void;
}

// ── Data shape ────────────────────────────────────────────────────────────────

interface PageData {
  browsers:    Record<string, unknown>[];
  osList:      Record<string, unknown>[];
  devices:     { label: string; value: number }[];
  resolutions: BarItem[];
  countries:   Record<string, unknown>[];
  cities:      Record<string, unknown>[];
}

async function fetchPageData(appId: string, timeframe: string, filter: string): Promise<PageData> {
  const results = await executeMultipleDql({
    browsers:    Q.withFilter(Q.techBrowsers(appId, timeframe), filter),
    os:          Q.withFilter(Q.techOS(appId, timeframe), filter),
    devices:     Q.withFilter(Q.techDevices(appId, timeframe), filter),
    resolutions: Q.withFilter(Q.techScreenResolutions(appId, timeframe), filter),
    countries:   Q.withFilter(Q.geoByCountry(appId, timeframe), filter),
    cities:      Q.withFilter(Q.geoByCity(appId, timeframe), filter),
  });

  const devices = results.devices
    .filter(r => r["device.type"])
    .map(r => ({ label: String(r["device.type"]), value: Number(r["sessions"]) || 0 }));

  const resolutions = results.resolutions
    .filter(r => r["resolution"])
    .map(r => ({ label: String(r["resolution"]), value: Number(r["sessions"]) || 0 }));

  return {
    browsers: results.browsers,
    osList: results.os,
    devices,
    resolutions,
    countries: results.countries,
    cities: results.cities,
  };
}

// ── Compare table ─────────────────────────────────────────────────────────────

function CompareTable({
  dataA, dataB, keyField, keyLabel, metricField, metricLabel,
}: {
  dataA: Record<string, unknown>[];
  dataB: Record<string, unknown>[];
  keyField: string;
  keyLabel: string;
  metricField: string;
  metricLabel: string;
}) {
  const mapB = new Map(dataB.map(r => [String(r[keyField]), r]));
  const merged = dataA.map(rowA => {
    const rowB = mapB.get(String(rowA[keyField])) ?? {};
    const a = Number(rowA[metricField]) || 0;
    const b = Number((rowB as Record<string, unknown>)[metricField]) || 0;
    return { key: String(rowA[keyField]), a, b };
  });

  if (merged.length === 0) return (
    <div style={{ padding: 32, textAlign: "center", color: GA4_COLORS.textTertiary }}>No data</div>
  );

  const maxAB = Math.max(...merged.map(r => Math.max(r.a, r.b)), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={GA4_STYLES.tableHeader}>{keyLabel}</th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "16%" }}>
              <span style={{ color: COLOR_A }}>{metricLabel} A</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "16%" }}>
              <span style={{ color: COLOR_B }}>{metricLabel} B</span>
            </th>
            <th style={{ ...GA4_STYLES.tableHeader, textAlign: "right", width: "10%" }}>Δ</th>
            <th style={{ ...GA4_STYLES.tableHeader, width: "22%" }}>A vs B</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((row, idx) => {
            const diff = row.a > 0 ? ((row.b - row.a) / row.a) * 100 : null;
            return (
              <tr key={idx}
                style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
              >
                <td style={GA4_STYLES.tableCell}>{row.key}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_A, fontWeight: 500 }}>{row.a.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right", color: COLOR_B, fontWeight: 500 }}>{row.b.toLocaleString()}</td>
                <td style={{ ...GA4_STYLES.tableCell, textAlign: "right" }}>
                  {diff !== null ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                      background: diff >= 0 ? "#e6f4ea" : "#fce8e6",
                      color: diff >= 0 ? "#2d7a3a" : "#c0392b",
                    }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>
                  ) : "—"}
                </td>
                <td style={{ ...GA4_STYLES.tableCell, paddingRight: 12 }}>
                  <div style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "50%", width: `${(row.a / maxAB) * 100}%`, background: COLOR_A, opacity: 0.7 }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, height: "50%", width: `${(row.b / maxAB) * 100}%`, background: COLOR_B, opacity: 0.7 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Donut pair (A left / B right) ─────────────────────────────────────────────

function DonutPair({
  title, dataA, dataB, loading, colors,
}: {
  title: string;
  dataA: { label: string; value: number }[];
  dataB: { label: string; value: number }[];
  loading: boolean;
  colors?: readonly string[];
}) {
  return (
    <div style={GA4_STYLES.card} className="ga4-animate">
      <div style={GA4_STYLES.sectionTitle}>{title}</div>
      {loading ? <CardSkeleton height={200} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_A, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT A</div>
            <DonutChart data={dataA} size={170} colors={colors} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR_B, textAlign: "center", marginBottom: 6, letterSpacing: "0.4px" }}>SEGMENT B</div>
            <DonutChart data={dataB} size={170} colors={colors} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TechPage({
  appId, timeframe, globalFilter = "", globalFilterB, refreshKey, onLoadEnd,
}: TechPageProps) {
  const compareMode = globalFilterB !== undefined;

  const [dataA, setDataA] = useState<PageData>({ browsers: [], osList: [], devices: [], resolutions: [], countries: [], cities: [] });
  const [dataB, setDataB] = useState<PageData>({ browsers: [], osList: [], devices: [], resolutions: [], countries: [], cities: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (compareMode) {
        const [a, b] = await Promise.all([
          fetchPageData(appId, timeframe, globalFilter),
          fetchPageData(appId, timeframe, globalFilterB!),
        ]);
        setDataA(a);
        setDataB(b);
      } else {
        const a = await fetchPageData(appId, timeframe, globalFilter);
        setDataA(a);
      }
    } catch (err) {
      console.error("[Tech] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe, globalFilter, globalFilterB, compareMode]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const browserDonutA = dataA.browsers.filter(r => r["browser.name"])
    .map(r => ({ label: String(r["browser.name"]), value: Number(r["sessions"]) || 0 }));
  const browserDonutB = dataB.browsers.filter(r => r["browser.name"])
    .map(r => ({ label: String(r["browser.name"]), value: Number(r["sessions"]) || 0 }));

  const osDonutA = dataA.osList.filter(r => r["os.name"])
    .map(r => ({ label: String(r["os.name"]), value: Number(r["sessions"]) || 0 }));
  const osDonutB = dataB.osList.filter(r => r["os.name"])
    .map(r => ({ label: String(r["os.name"]), value: Number(r["sessions"]) || 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Environment
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Browser, device, OS, and location analytics
          {compareMode && <span style={{ marginLeft: 8, fontSize: 12, color: GA4_COLORS.textTertiary }}>— comparing two segments</span>}
        </p>
      </div>

      {/* Device / Browser / OS donuts */}
      {compareMode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.cardGap }}>
          <DonutPair
            title="Device type"
            dataA={dataA.devices}
            dataB={dataB.devices}
            loading={loading}
            colors={[GA4_COLORS.chart[0], GA4_COLORS.chart[3], GA4_COLORS.chart[2]]}
          />
          <DonutPair
            title="Browser"
            dataA={browserDonutA}
            dataB={browserDonutB}
            loading={loading}
          />
          <DonutPair
            title="Operating system"
            dataA={osDonutA}
            dataB={osDonutB}
            loading={loading}
            colors={GA4_COLORS.chart.slice(2)}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GA4_SPACING.cardGap }}>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Device type</div>
            {loading ? <CardSkeleton height={200} /> : (
              <DonutChart data={dataA.devices} size={160} colors={[GA4_COLORS.chart[0], GA4_COLORS.chart[3], GA4_COLORS.chart[2]]} />
            )}
          </div>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Browser</div>
            {loading ? <CardSkeleton height={200} /> : <DonutChart data={browserDonutA} size={160} />}
          </div>
          <div style={GA4_STYLES.card} className="ga4-animate">
            <div style={GA4_STYLES.sectionTitle}>Operating system</div>
            {loading ? <CardSkeleton height={200} /> : (
              <DonutChart data={osDonutA} size={160} colors={GA4_COLORS.chart.slice(2)} />
            )}
          </div>
        </div>
      )}

      {/* Browser table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Browsers</div>
        {loading ? <CardSkeleton height={300} /> : compareMode ? (
          <CompareTable
            dataA={dataA.browsers}
            dataB={dataB.browsers}
            keyField="browser.name"
            keyLabel="Browser"
            metricField="sessions"
            metricLabel="Sessions"
          />
        ) : (
          <DataTable
            columns={[
              { key: "browser.name", label: "Browser" },
              { key: "sessions", label: "Sessions", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "20%" },
              { key: "users", label: "Users", align: "right",
                format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={dataA.browsers}
          />
        )}
      </div>

      {/* Screen resolutions — single mode only (not meaningful in compare) */}
      {!compareMode && (
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Screen resolution</div>
          {loading ? <CardSkeleton height={280} /> : (
            <BarChart data={dataA.resolutions} color={GA4_COLORS.chart[5]} maxBars={8} />
          )}
        </div>
      )}

      {/* Geography */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 400, margin: "0 0 16px", color: GA4_COLORS.textPrimary }}>
          Geography
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: GA4_SPACING.cardGap }}>
        {/* Country table */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions by country</div>
          {loading ? <CardSkeleton height={350} /> : compareMode ? (
            <CompareTable
              dataA={dataA.countries}
              dataB={dataB.countries}
              keyField="geo.country.iso_code"
              keyLabel="Country"
              metricField="sessions"
              metricLabel="Sessions"
            />
          ) : (
            <DataTable
              columns={[
                { key: "geo.country.iso_code", label: "Country" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "25%" },
                { key: "users", label: "Users", align: "right",
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={dataA.countries}
              maxRows={15}
            />
          )}
        </div>

        {/* ISP table */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions by ISP</div>
          {loading ? <CardSkeleton height={350} /> : compareMode ? (
            <CompareTable
              dataA={dataA.cities}
              dataB={dataB.cities}
              keyField="client.isp"
              keyLabel="ISP"
              metricField="sessions"
              metricLabel="Sessions"
            />
          ) : (
            <DataTable
              columns={[
                { key: "client.isp", label: "ISP" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "25%" },
                { key: "users", label: "Users", align: "right",
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={dataA.cities}
              maxRows={15}
            />
          )}
        </div>
      </div>
    </div>
  );
}
