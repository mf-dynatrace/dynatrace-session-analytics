/**
 * pages/TechPage.tsx
 *
 * GA4-style Technology details page.
 * Shows browser, OS, device type, screen resolution, and geographic breakdowns.
 */

import React, { useEffect, useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { DonutChart } from "../components/DonutChart";
import { DataTable } from "../components/DataTable";
import { BarChart, BarItem } from "../components/BarChart";
import { CardSkeleton } from "../components/LoadingState";
import { executeMultipleDql } from "../hooks/useDqlQuery";
import * as Q from "../dql/queries";

interface TechPageProps {
  appId: string;
  timeframe: string;
  refreshKey: number;
  globalFilter?: string;
  globalFilterB?: string;
  onLoadEnd?: () => void;
}

export function TechPage({ appId, timeframe, refreshKey, globalFilter, globalFilterB, onLoadEnd }: TechPageProps) {
  const [browsers, setBrowsers] = useState<Record<string, unknown>[]>([]);
  const [osList, setOsList] = useState<Record<string, unknown>[]>([]);
  const [devices, setDevices] = useState<{ label: string; value: number }[]>([]);
  const [resolutions, setResolutions] = useState<BarItem[]>([]);
  const [countries, setCountries] = useState<Record<string, unknown>[]>([]);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await executeMultipleDql({
        browsers:    Q.techBrowsers(appId, timeframe),
        os:          Q.techOS(appId, timeframe),
        devices:     Q.techDevices(appId, timeframe),
        resolutions: Q.techScreenResolutions(appId, timeframe),
        countries:   Q.geoByCountry(appId, timeframe),
        cities:      Q.geoByCity(appId, timeframe),
      });

      setBrowsers(results.browsers);
      setOsList(results.os);

      setDevices(
        results.devices
          .filter(r => r["device.type"])
          .map(r => ({ label: String(r["device.type"]), value: Number(r["sessions"]) || 0 }))
      );

      setResolutions(
        results.resolutions
          .filter(r => r["resolution"])
          .map(r => ({ label: String(r["resolution"]), value: Number(r["sessions"]) || 0 }))
      );

      setCountries(results.countries);
      setCities(results.cities);
    } catch (err) {
      console.error("[Tech] fetch error:", err);
    } finally {
      setLoading(false);
      onLoadEnd?.();
    }
  }, [appId, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const browserDonut = browsers
    .filter(r => r["browser.name"])
    .map(r => ({ label: String(r["browser.name"]), value: Number(r["sessions"]) || 0 }));

  const osDonut = osList
    .filter(r => r["os.name"])
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
        </p>
      </div>

      {/* Device / Browser / OS donuts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GA4_SPACING.cardGap }}>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Device type</div>
          {loading ? <CardSkeleton height={200} /> : (
            <DonutChart
              data={devices}
              size={160}
              colors={[GA4_COLORS.chart[0], GA4_COLORS.chart[3], GA4_COLORS.chart[2]]}
            />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Browser</div>
          {loading ? <CardSkeleton height={200} /> : (
            <DonutChart data={browserDonut} size={160} />
          )}
        </div>
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Operating system</div>
          {loading ? <CardSkeleton height={200} /> : (
            <DonutChart data={osDonut} size={160} colors={GA4_COLORS.chart.slice(2)} />
          )}
        </div>
      </div>

      {/* Browser table */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Browsers</div>
        {loading ? <CardSkeleton height={300} /> : (
          <DataTable
            columns={[
              { key: "browser.name", label: "Browser" },
              { key: "sessions", label: "Sessions", align: "right", showBar: true,
                format: v => Number(v).toLocaleString(), width: "20%" },
              { key: "users", label: "Users", align: "right",
                format: v => Number(v).toLocaleString(), width: "15%" },
            ]}
            data={browsers}
          />
        )}
      </div>

      {/* Screen resolutions */}
      <div style={GA4_STYLES.card} className="ga4-animate">
        <div style={GA4_STYLES.sectionTitle}>Screen resolution</div>
        {loading ? <CardSkeleton height={280} /> : (
          <BarChart data={resolutions} color={GA4_COLORS.chart[5]} maxBars={8} />
        )}
      </div>

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
          {loading ? <CardSkeleton height={350} /> : (
            <DataTable
              columns={[
                { key: "geo.country.iso_code", label: "Country" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "25%" },
                { key: "users", label: "Users", align: "right",
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={countries}
              maxRows={15}
            />
          )}
        </div>

        {/* City table */}
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={GA4_STYLES.sectionTitle}>Sessions by ISP</div>
          {loading ? <CardSkeleton height={350} /> : (
            <DataTable
              columns={[
                { key: "client.isp", label: "ISP" },
                { key: "sessions", label: "Sessions", align: "right", showBar: true,
                  format: v => Number(v).toLocaleString(), width: "25%" },
                { key: "users", label: "Users", align: "right",
                  format: v => Number(v).toLocaleString(), width: "20%" },
              ]}
              data={cities}
              maxRows={15}
            />
          )}
        </div>
      </div>
    </div>
  );
}
