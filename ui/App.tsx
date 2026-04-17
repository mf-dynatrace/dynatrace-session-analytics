/**
 * App.tsx — Dynatrace Session Analytics root component
 *
 * Layout:
 *   ┌───────────┬──────────────────────────────────────────────┐
 *   │           │  Header bar: App selector, Time range, Refresh │
 *   │  Sidebar  ├──────────────────────────────────────────────┤
 *   │  Nav      │                                              │
 *   │           │  Active Page Content                         │
 *   │           │                                              │
 *   └───────────┴──────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useRef } from "react";
import { GA4_COLORS, GA4_FONTS, GA4_SPACING, GA4_GLOBAL_CSS } from "./styles/ga4Theme";
import { useApplications, RumApplication } from "./hooks/useApplications";
import { DynatraceLoader } from "./components/DynatraceLoader";

// Pages
import { OverviewPage }      from "./pages/OverviewPage";
import { RealtimePage }      from "./pages/RealtimePage";
import { AcquisitionPage }   from "./pages/AcquisitionPage";
import { EngagementPage }    from "./pages/EngagementPage";
import { TechPage }          from "./pages/TechPage";
import { ErrorsPage }        from "./pages/ErrorsPage";
import { JourneysPage }      from "./pages/JourneysPage";
import { SessionExplorerPage } from "./pages/SessionExplorerPage";
import { WebVitalsPage }     from "./pages/WebVitalsPage";
import { RetentionPage }     from "./pages/RetentionPage";
import { ConversionsPage }   from "./pages/ConversionsPage";
import { UTMPage }           from "./pages/UTMPage";

// ── Navigation items ──────────────────────────────────────────────────────────

type PageId = "overview" | "realtime" | "acquisition" | "engagement" | "tech"
  | "errors" | "journeys" | "sessions" | "vitals" | "retention" | "conversions" | "utm";

interface NavItem {
  id:    PageId;
  label: string;
  icon:  string;  // SVG path data
  section?: string;
}

// Dynatrace-style icons and renamed pages
const NAV_ITEMS: NavItem[] = [
  {
    id: "overview",
    label: "Dashboard",
    // Grid/dashboard icon
    icon: "M4 5v5h6V5H4zm8 0v5h6V5h-6zm-8 7v5h6v-5H4zm8 0v5h6v-5h-6z",
    section: "Analytics",
  },
  {
    id: "realtime",
    label: "Live activity",
    // Pulse/activity icon
    icon: "M3 13h2l2-4 3 8 4-12 2 8h5",
    section: "Analytics",
  },
  {
    id: "acquisition",
    label: "Traffic sources",
    // Funnel/inflow icon
    icon: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
    section: "Insights",
  },
  {
    id: "engagement",
    label: "User behavior",
    // Cursor click icon
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z",
    section: "Insights",
  },
  {
    id: "tech",
    label: "Environment",
    // Browser/device icon
    icon: "M4 6h18V4H2v16h6v-2H4V6zm14 2H8v10h2v2h8v-2h2V8zm-2 10h-8V10h8v8z",
    section: "Platform",
  },
  {
    id: "errors",
    label: "Errors & Performance",
    // Warning triangle icon
    icon: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    section: "Diagnostics",
  },
  {
    id: "vitals",
    label: "Web Vitals",
    // Heart/pulse icon
    icon: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    section: "Diagnostics",
  },
  {
    id: "journeys",
    label: "User Journeys",
    // Route/path icon
    icon: "M9.78 11.16l-1.42 1.42a7.282 7.282 0 01-1.79-2.94l1.94-.49c.32.89.77 1.5 1.27 2.01zM11 6L7 2 3 6h3.02c.02.81.08 1.54.19 2.17l1.94-.49C8.08 7.2 8.03 6.63 8.02 6H11zm10 0l-4-4-4 4h2.99c-.1 3.68-1.28 4.75-2.54 5.88-.5.44-1.01.92-1.45 1.55-.34-.49-.73-.88-1.13-1.24L9.46 13.6c.93.85 1.54 1.54 1.54 3.4v5h2v-5c0-2.02.71-2.66 1.79-3.63 1.38-1.24 3.08-2.78 3.2-7.37H21z",
    section: "Insights",
  },
  {
    id: "sessions",
    label: "Session Explorer",
    // List/table icon
    icon: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
    section: "Insights",
  },
  {
    id: "utm",
    label: "UTM Campaigns",
    // Megaphone/campaign icon
    icon: "M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1l5 3V6L5 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z",
    section: "Insights",
  },
  {
    id: "retention",
    label: "Retention",
    // People/group icon
    icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    section: "Growth",
  },
  {
    id: "conversions",
    label: "Conversions",
    // Target/flag icon
    icon: "M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z",
    section: "Growth",
  },
];

// ── Time range options ────────────────────────────────────────────────────────

interface TimeOption {
  label: string;
  value: string;
}

const TIME_OPTIONS: TimeOption[] = [
  { label: "Last 30 minutes", value: "30m" },
  { label: "Last 1 hour",     value: "1h" },
  { label: "Last 6 hours",    value: "6h" },
  { label: "Last 24 hours",   value: "24h" },
  { label: "Last 7 days",     value: "7d" },
  { label: "Last 28 days",    value: "28d" },
];

// ── App Component ─────────────────────────────────────────────────────────────

export function App() {
  const [activePage, setActivePage] = useState<PageId>("overview");
  const [selectedApp, setSelectedApp] = useState("");
  const [timeframe, setTimeframe] = useState("24h");
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarHover, setSidebarHover] = useState<string | null>(null);

  // Custom date range picker state
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Global loading overlay — shown on refresh, page change, timeframe change
  const [globalLoading, setGlobalLoading] = useState(false);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCustom = timeframe.startsWith("custom:");

  const { apps, loading: appsLoading } = useApplications();

  // Auto-select first app when loaded
  useEffect(() => {
    if (apps.length > 0 && !selectedApp) {
      setSelectedApp(apps[0].id);
    }
  }, [apps, selectedApp]);

  const handleRefresh = () => setRefreshKey(k => k + 1);

  // Show loading overlay when data-affecting state changes
  useEffect(() => {
    setGlobalLoading(true);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setGlobalLoading(false), 4000);
    return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); };
  }, [refreshKey, activePage, timeframe]);

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const fromISO = new Date(customFrom).toISOString();
      const toISO   = new Date(customTo + "T23:59:59").toISOString();
      setTimeframe(`custom:${fromISO}/${toISO}`);
      setShowCustomPicker(false);
    }
  };

  /** Readable label for the active custom range */
  const customLabel = isCustom
    ? (() => {
        const [f, t] = timeframe.slice(7).split("/");
        const fmt = (iso: string) =>
          new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return `${fmt(f)} – ${fmt(t)}`;
      })()
    : "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Inject global styles */}
      <style>{GA4_GLOBAL_CSS}</style>

      <div style={{
        display: "flex",
        height: "100vh",
        fontFamily: GA4_FONTS.family,
        background: GA4_COLORS.pageBg,
        color: GA4_COLORS.textPrimary,
      }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <nav style={{
          width: GA4_SPACING.sidebarWidth,
          background: GA4_COLORS.sidebarBg,
          borderRight: `1px solid #2a2f35`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
        }}>
          {/* Logo / App Name */}
          <div style={{
            padding: "20px 20px 16px",
            borderBottom: `1px solid #2a2f35`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Dynatrace-style analytics icon */}
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <rect x={1} y={14} width={6} height={8} rx={1} fill={GA4_COLORS.chart[2]} />
                <rect x={9} y={8} width={6} height={14} rx={1} fill={GA4_COLORS.primary} />
                <rect x={17} y={2} width={6} height={20} rx={1} fill={GA4_COLORS.chart[3]} />
              </svg>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#ffffff" }}>
                  Session Analytics
                </div>
                <div style={{ fontSize: 11, color: "#6d7680" }}>
                  Powered by Dynatrace
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <div style={{ padding: "8px 0", flex: 1 }}>
            {NAV_ITEMS.map((item, idx) => {
              const isActive = activePage === item.id;
              const isHovered = sidebarHover === item.id;
              const showSection = item.section && (idx === 0 || NAV_ITEMS[idx - 1].section !== item.section);

              return (
                <React.Fragment key={item.id}>
                  {showSection && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#525960",
                      textTransform: "uppercase",
                      letterSpacing: "1.2px",
                      padding: `${idx > 0 ? 24 : 12}px 20px 6px`,
                    }}>
                      {item.section}
                    </div>
                  )}
                  <button
                    onClick={() => setActivePage(item.id)}
                    onMouseEnter={() => setSidebarHover(item.id)}
                    onMouseLeave={() => setSidebarHover(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 20px",
                      border: "none",
                      borderLeft: isActive ? `3px solid ${GA4_COLORS.primary}` : "3px solid transparent",
                      borderRadius: 0,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      fontFamily: GA4_FONTS.family,
                      color: isActive ? "#ffffff" : GA4_COLORS.sidebarText,
                      background: isActive
                        ? "rgba(20, 150, 255, 0.12)"
                        : isHovered
                          ? "rgba(255, 255, 255, 0.05)"
                          : "transparent",
                      transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      outline: "none",
                    }}
                  >
                    <svg width={18} height={18} viewBox="0 0 24 24"
                      fill={item.id === "realtime" ? "none" : (isActive ? "#ffffff" : GA4_COLORS.sidebarIcon)}
                      stroke={item.id === "realtime" ? (isActive ? "#ffffff" : GA4_COLORS.sidebarIcon) : "none"}
                      strokeWidth={item.id === "realtime" ? 2.5 : 0}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "12px 16px",
            borderTop: `1px solid #2a2f35`,
            fontSize: 11,
            color: "#6d7680",
          }}>
            User Session Analytics v2.1.8
            <br />
            Dynatrace Gen 3 Grail
          </div>
        </nav>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header Bar */}
          <header style={{
            height: GA4_SPACING.headerHeight,
            background: GA4_COLORS.cardBg,
            borderBottom: `1px solid ${GA4_COLORS.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: 16,
            flexShrink: 0,
          }}>
            {/* App Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, color: GA4_COLORS.textSecondary, whiteSpace: "nowrap" }}>
                Property:
              </label>
              <select
                value={selectedApp}
                onChange={e => setSelectedApp(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: `1px solid ${GA4_COLORS.border}`,
                  background: GA4_COLORS.cardBg,
                  fontSize: 14,
                  color: GA4_COLORS.textPrimary,
                  fontFamily: GA4_FONTS.family,
                  minWidth: 240,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="">All applications</option>
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>
              {appsLoading && (
                <span style={{ fontSize: 12, color: GA4_COLORS.textTertiary }}>Loading...</span>
              )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Time Range Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setTimeframe(opt.value); setShowCustomPicker(false); }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 16,
                    border: timeframe === opt.value
                      ? `1px solid ${GA4_COLORS.primary}`
                      : `1px solid transparent`,
                    background: timeframe === opt.value ? GA4_COLORS.primaryBg : "transparent",
                    color: timeframe === opt.value ? GA4_COLORS.primary : GA4_COLORS.textSecondary,
                    fontSize: 13,
                    fontWeight: timeframe === opt.value ? 500 : 400,
                    fontFamily: GA4_FONTS.family,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    outline: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </button>
              ))}

              {/* Custom range button */}
              <button
                onClick={() => setShowCustomPicker(prev => !prev)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 16,
                  border: isCustom
                    ? `1px solid ${GA4_COLORS.primary}`
                    : `1px solid transparent`,
                  background: isCustom ? GA4_COLORS.primaryBg : "transparent",
                  color: isCustom ? GA4_COLORS.primary : GA4_COLORS.textSecondary,
                  fontSize: 13,
                  fontWeight: isCustom ? 500 : 400,
                  fontFamily: GA4_FONTS.family,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  outline: "none",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24"
                  fill={isCustom ? GA4_COLORS.primary : GA4_COLORS.textSecondary}>
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
                </svg>
                {isCustom ? customLabel : "Custom"}
              </button>

              {/* Custom date picker popover */}
              {showCustomPicker && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  background: GA4_COLORS.cardBg,
                  border: `1px solid ${GA4_COLORS.border}`,
                  borderRadius: 8,
                  padding: 16,
                  zIndex: 100,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minWidth: 260,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: GA4_COLORS.textPrimary }}>
                    Custom date range
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ fontSize: 12, color: GA4_COLORS.textSecondary }}>From</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: `1px solid ${GA4_COLORS.border}`,
                        background: GA4_COLORS.pageBg,
                        color: GA4_COLORS.textPrimary,
                        fontSize: 13,
                        fontFamily: GA4_FONTS.family,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ fontSize: 12, color: GA4_COLORS.textSecondary }}>To</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: `1px solid ${GA4_COLORS.border}`,
                        background: GA4_COLORS.pageBg,
                        color: GA4_COLORS.textPrimary,
                        fontSize: 13,
                        fontFamily: GA4_FONTS.family,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 4,
                        border: `1px solid ${GA4_COLORS.border}`,
                        background: "transparent",
                        color: GA4_COLORS.textSecondary,
                        fontSize: 13,
                        fontFamily: GA4_FONTS.family,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCustomApply}
                      disabled={!customFrom || !customTo}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 4,
                        border: "none",
                        background: (!customFrom || !customTo) ? "#333" : GA4_COLORS.primary,
                        color: (!customFrom || !customTo) ? "#666" : "#fff",
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: GA4_FONTS.family,
                        cursor: (!customFrom || !customTo) ? "default" : "pointer",
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              title="Refresh data"
              style={{
                padding: "8px",
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = GA4_COLORS.sidebarHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill={GA4_COLORS.textSecondary}>
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          </header>

          {/* Page Content */}
          <main style={{
            flex: 1,
            overflow: "auto",
            padding: GA4_SPACING.cardPadding,
            position: "relative",
          }}>
            {globalLoading && <DynatraceLoader />}
            {activePage === "overview" && (
              <OverviewPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "realtime" && (
              <RealtimePage appId={selectedApp} refreshKey={refreshKey} />
            )}
            {activePage === "acquisition" && (
              <AcquisitionPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "engagement" && (
              <EngagementPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "tech" && (
              <TechPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "errors" && (
              <ErrorsPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "journeys" && (
              <JourneysPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "sessions" && (
              <SessionExplorerPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "vitals" && (
              <WebVitalsPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "retention" && (
              <RetentionPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "conversions" && (
              <ConversionsPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
            {activePage === "utm" && (
              <UTMPage appId={selectedApp} timeframe={timeframe} refreshKey={refreshKey} />
            )}
          </main>
        </div>
      </div>
    </>
  );
}
