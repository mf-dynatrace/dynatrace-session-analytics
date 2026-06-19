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

import React, { useState, useEffect, useRef, useCallback } from "react";
import { GA4_COLORS, GA4_FONTS, GA4_SPACING, GA4_GLOBAL_CSS } from "./styles/ga4Theme";
import { useApplications, RumApplication } from "./hooks/useApplications";
import { DynatraceLoader } from "./components/DynatraceLoader";
import { useSavedSegments } from "./hooks/useSavedSegments";
import {
  SegmentState, EMPTY_SEGMENT, COUNTRIES,
  segmentToFilter, segmentActiveCount, SegmentForm,
} from "./components/SegmentForm";

const COLOR_A_PILL = "#1a73e8";
const COLOR_B_PILL = "#e03e2d";

// ── CombinedSegmentPicker ─────────────────────────────────────────────────────
// Single pill that manages both segment A and (optional) segment B.
// segmentB === null means compare mode is off.

interface CombinedSegmentPickerProps {
  segmentA: SegmentState;
  onChangeA: (s: SegmentState) => void;
  segmentB: SegmentState | null;
  onChangeB: (s: SegmentState | null) => void;
}

function CombinedSegmentPicker({ segmentA, onChangeA, segmentB, onChangeB }: CombinedSegmentPickerProps) {
  const compareMode = segmentB !== null;
  const [open, setOpen] = useState(false);
  const [draftA, setDraftA] = useState<SegmentState>(segmentA);
  const [draftB, setDraftB] = useState<SegmentState>(segmentB ?? EMPTY_SEGMENT);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { segments: savedSegments, saveSegment, deleteSegment } = useSavedSegments();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync drafts when panel is closed / values change externally
  useEffect(() => {
    if (!open) {
      setDraftA(segmentA);
      setDraftB(segmentB ?? EMPTY_SEGMENT);
    }
  }, [open, segmentA, segmentB]);

  const countA = segmentActiveCount(segmentA);
  const countB = segmentB !== null ? segmentActiveCount(segmentB) : 0;
  const hasActiveA = countA > 0;

  const apply = () => {
    onChangeA(draftA);
    if (compareMode) onChangeB(draftB);
    setOpen(false);
    setSaveMode(false);
  };

  const clearAll = () => {
    onChangeA(EMPTY_SEGMENT);
    if (compareMode) onChangeB(EMPTY_SEGMENT);
    setDraftA(EMPTY_SEGMENT);
    setDraftB(EMPTY_SEGMENT);
    setOpen(false);
    setSaveMode(false);
  };

  const enableCompare = () => {
    onChangeB(EMPTY_SEGMENT);
    setDraftB(EMPTY_SEGMENT);
  };

  const disableCompare = () => {
    onChangeB(null);
    setDraftB(EMPTY_SEGMENT);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await saveSegment({ name: saveName.trim(), ...draftA });
      setSaveMode(false);
      setSaveName("");
    } finally {
      setSaving(false);
    }
  };

  const loadSaved = (s: ReturnType<typeof useSavedSegments>["segments"][0], target: "A" | "B" = "A") => {
    const loaded: SegmentState = {
      hasErrors: s.hasErrors, isBounced: s.isBounced, hasReplay: s.hasReplay,
      country: s.country, browser: s.browser, os: s.os,
      url: s.url ?? "", urlOp: s.urlOp ?? "contains", urlField: s.urlField ?? "path",
    };
    if (target === "A") { setDraftA(loaded); onChangeA(loaded); }
    else { setDraftB(loaded); if (compareMode) onChangeB(loaded); }
    setOpen(false);
  };

  // Pill label & style
  const pillActive = compareMode || hasActiveA;
  const pillLabel = compareMode
    ? "A vs B"
    : hasActiveA ? `Segment (${countA})` : "Segment";

  const pillStyle: React.CSSProperties = {
    padding: "6px 14px", borderRadius: 16,
    border: pillActive ? `1.5px solid ${COLOR_A_PILL}` : `1px solid ${GA4_COLORS.border}`,
    background: pillActive ? `${COLOR_A_PILL}18` : GA4_COLORS.cardBg,
    color: pillActive ? COLOR_A_PILL : GA4_COLORS.textSecondary,
    fontSize: 13, fontWeight: pillActive ? 600 : 400,
    fontFamily: GA4_FONTS.family, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
    outline: "none", whiteSpace: "nowrap", transition: "all 0.15s",
  };

  const dot = (color: string, lbl: string) => (
    <span style={{
      width: 15, height: 15, borderRadius: "50%", background: color,
      color: "#fff", fontSize: 9, fontWeight: 700,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>{lbl}</span>
  );

  const colHeader = (color: string, lbl: string, title: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      {dot(color, lbl)}
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{title}</span>
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Pill button */}
      <button onClick={() => setOpen(o => !o)} style={pillStyle}>
        {compareMode ? (
          <>
            {dot(COLOR_A_PILL, "A")}
            <svg width={13} height={13} viewBox="0 0 24 24" fill={COLOR_A_PILL}>
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
            <span style={{ fontSize: 11, color: GA4_COLORS.textTertiary }}>vs</span>
            {dot(COLOR_B_PILL, "B")}
            {(countA > 0 || countB > 0) && (
              <span style={{ fontSize: 11, color: GA4_COLORS.textTertiary }}>
                ({countA}/{countB})
              </span>
            )}
          </>
        ) : (
          <>
            <svg width={13} height={13} viewBox="0 0 24 24"
              fill={hasActiveA ? COLOR_A_PILL : GA4_COLORS.textSecondary}>
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
            {pillLabel}
          </>
        )}
        <svg width={10} height={10} viewBox="0 0 24 24"
          fill={pillActive ? COLOR_A_PILL : GA4_COLORS.textSecondary}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1000,
          background: GA4_COLORS.cardBg, border: `1px solid ${GA4_COLORS.border}`,
          borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          padding: "16px", width: compareMode ? 920 : 280,
          overflow: "visible",
        }}>
          {compareMode ? (
            /* Two-column compare layout */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: "0 16px" }}>
              <div>
                {colHeader(COLOR_A_PILL, "A", "Segment A")}
                <SegmentForm draft={draftA} onDraftChange={setDraftA} accentColor={COLOR_A_PILL} />
              </div>
              {/* Vertical divider */}
              <div style={{ background: GA4_COLORS.border }} />
              <div>
                {colHeader(COLOR_B_PILL, "B", "Segment B")}
                <SegmentForm draft={draftB} onDraftChange={setDraftB} accentColor={COLOR_B_PILL} />
              </div>
            </div>
          ) : (
            /* Single-column layout */
            <>
              <SegmentForm draft={draftA} onDraftChange={setDraftA} accentColor={COLOR_A_PILL} />

              {/* Saved segments */}
              {savedSegments.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GA4_COLORS.textTertiary,
                    textTransform: "uppercase", letterSpacing: "0.8px", margin: "12px 0 6px" }}>
                    Saved segments
                  </div>
                  {savedSegments.map(s => (
                    <div key={s.objectId} style={{ display: "flex", alignItems: "center",
                      justifyContent: "space-between", padding: "4px 0" }}>
                      <button onClick={() => loadSaved(s)} style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        fontSize: 13, color: GA4_COLORS.primary, fontFamily: GA4_FONTS.family,
                        textAlign: "left",
                      }}>{s.name}</button>
                      <button onClick={() => deleteSegment(s.objectId, s.version)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 16, color: GA4_COLORS.textTertiary, lineHeight: 1, padding: "0 2px",
                      }} title="Delete segment">×</button>
                    </div>
                  ))}
                </>
              )}

              {/* Save as named segment */}
              {!saveMode ? (
                <button onClick={() => { setSaveMode(true); setSaveName(""); }}
                  style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, color: GA4_COLORS.primary, fontFamily: GA4_FONTS.family,
                    padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  + Save as segment
                </button>
              ) : (
                <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                  <input autoFocus type="text" value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaveMode(false); }}
                    placeholder="Segment name…"
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 13,
                      border: `1px solid ${GA4_COLORS.primary}`, fontFamily: GA4_FONTS.family,
                      color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none" }}
                  />
                  <button onClick={handleSave} disabled={saving || !saveName.trim()} style={{
                    padding: "5px 10px", borderRadius: 4, border: "none",
                    background: GA4_COLORS.primary, color: "#fff", fontSize: 12,
                    fontFamily: GA4_FONTS.family,
                    cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
                  }}>{saving ? "…" : "Save"}</button>
                </div>
              )}
            </>
          )}

          {/* Footer: compare toggle + Clear / Apply */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 14, paddingTop: 10, borderTop: `1px solid ${GA4_COLORS.border}`,
          }}>
            {!compareMode ? (
              <button onClick={enableCompare} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: GA4_COLORS.textSecondary, fontFamily: GA4_FONTS.family,
                padding: 0, display: "flex", alignItems: "center", gap: 5,
              }}>⇄ Compare with another segment</button>
            ) : (
              <button onClick={disableCompare} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: GA4_COLORS.textTertiary, fontFamily: GA4_FONTS.family,
                padding: 0, display: "flex", alignItems: "center", gap: 5,
              }}>✕ Remove comparison</button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={clearAll} style={{
                padding: "6px 14px", borderRadius: 4, border: `1px solid ${GA4_COLORS.border}`,
                background: "transparent", color: GA4_COLORS.textSecondary,
                fontSize: 13, fontFamily: GA4_FONTS.family, cursor: "pointer",
              }}>Clear</button>
              <button onClick={apply} style={{
                padding: "6px 14px", borderRadius: 4, border: "none",
                background: GA4_COLORS.primary, color: "#fff",
                fontSize: 13, fontWeight: 500, fontFamily: GA4_FONTS.family, cursor: "pointer",
              }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
import { SettingsPage }      from "./pages/SettingsPage";
import { ContentRequestsPage } from "./pages/ContentRequestsPage";
import { SegmentsPage }     from "./pages/SegmentsPage";

// ── Navigation items ──────────────────────────────────────────────────────────

type PageId = "overview" | "realtime" | "acquisition" | "engagement" | "tech"
  | "errors" | "journeys" | "sessions" | "vitals" | "retention" | "conversions" | "utm"
  | "segments" | "settings" | "aem-requests";

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
    id: "aem-requests",
    label: "Content Requests",
    // Web/globe icon
    icon: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 00-1.38-3.56A8.03 8.03 0 0118.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 015.08 16zm2.95-8H5.08a7.987 7.987 0 014.33-3.56A15.65 15.65 0 008.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z",
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
  {
    id: "segments",
    label: "Segments",
    // Filter/bookmark icon
    icon: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z",
    section: "Admin",
  },
  {
    id: "settings",
    label: "Settings",
    // Gear/cog icon
    icon: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.44.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z",
    section: "Admin",
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
  const [segmentA, setSegmentA] = useState<SegmentState>(EMPTY_SEGMENT);
  const [segmentB, setSegmentB] = useState<SegmentState | null>(null);
  const compareMode = segmentB !== null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarHover, setSidebarHover] = useState<string | null>(null);

  // Combined global DQL filter string — segment A only
  const globalFilter = segmentToFilter(segmentA);

  // Segment B filter; undefined when compare mode is off
  const globalFilterB = compareMode ? segmentToFilter(segmentB!) : undefined;

  // Custom date range picker state
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Long-range confirmation modal
  const [pendingTimeframe, setPendingTimeframe] = useState<string | null>(null);

  // Disclaimer modal
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Global loading overlay — shown on refresh, page change, timeframe change
  const [globalLoading, setGlobalLoading] = useState(false);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCustom = timeframe.startsWith("custom:");

  /** Is this timeframe longer than 7 days? */
  const isLongRange = (tf: string): boolean => {
    if (tf.startsWith("custom:")) {
      const [from, to] = tf.slice(7).split("/");
      const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
      return days > 7;
    }
    return tf === "28d" || tf === "30d" || tf === "90d";
  };

  /** Change timeframe — shows confirmation for long ranges */
  const requestTimeframe = (tf: string) => {
    if (isLongRange(tf)) {
      setPendingTimeframe(tf);
    } else {
      setTimeframe(tf);
    }
  };

  const confirmLongRange = () => {
    if (pendingTimeframe) setTimeframe(pendingTimeframe);
    setPendingTimeframe(null);
  };

  const cancelLongRange = () => {
    setPendingTimeframe(null);
  };

  const { apps, loading: appsLoading } = useApplications();

  // Check if disclaimer was dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('session-analytics-disclaimer-dismissed');
    if (!dismissed) {
      setShowDisclaimer(true);
    }
  }, []);

  // Auto-select first app when loaded
  useEffect(() => {
    if (apps.length > 0 && !selectedApp) {
      setSelectedApp(apps[0].id);
    }
  }, [apps, selectedApp]);

  const handleRefresh = () => setRefreshKey(k => k + 1);

  const handleDisclaimerClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('session-analytics-disclaimer-dismissed', 'true');
    }
    setShowDisclaimer(false);
  };

  // Show/hide loading overlay — pages call stopLoading() when data is ready
  const triggerLoading = () => {
    setGlobalLoading(true);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setGlobalLoading(false), 30000); // safety fallback
  };
  const stopLoading = () => {
    setGlobalLoading(false);
    if (loadingTimer.current) { clearTimeout(loadingTimer.current); loadingTimer.current = null; }
  };

  useEffect(() => {
    triggerLoading();
    return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); };
  }, [refreshKey, activePage, timeframe, selectedApp, globalFilter, globalFilterB]);

  const handleCustomApply = () => {
    if (rangeStart && rangeEnd) {
      const [sy, sm, sd] = rangeStart.split("-").map(Number);
      const [ey, em, ed] = rangeEnd.split("-").map(Number);
      const fromISO = new Date(sy, sm - 1, sd).toISOString();
      const toISO   = new Date(ey, em - 1, ed, 23, 59, 59).toISOString();
      const tf = `custom:${fromISO}/${toISO}`;
      requestTimeframe(tf);
      setShowCustomPicker(false);
    }
  };

  /** Handle clicking a day on the calendar */
  const handleCalendarClick = (dateStr: string) => {
    if (!rangeStart || rangeEnd) {
      // Start a new selection
      setRangeStart(dateStr);
      setRangeEnd(null);
      setHoverDate(null);
    } else {
      // Complete the selection — ensure start <= end
      if (dateStr < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(dateStr);
      } else {
        setRangeEnd(dateStr);
      }
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
            Session Analytics v2.8.0
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
                Frontend:
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

            {/* Segment filter (A + optional B compare) */}
            <CombinedSegmentPicker
              segmentA={segmentA}
              onChangeA={setSegmentA}
              segmentB={segmentB}
              onChangeB={setSegmentB}
            />

            {/* Separator */}
            <div style={{ width: 1, height: 24, background: GA4_COLORS.border, margin: "0 4px" }} />

            {/* Time Range Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
              <select
                value={isCustom ? "" : timeframe}
                onChange={e => { if (e.target.value) { requestTimeframe(e.target.value); setShowCustomPicker(false); } }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 16,
                  border: `1px solid ${!isCustom ? GA4_COLORS.primary : GA4_COLORS.border}`,
                  background: !isCustom ? GA4_COLORS.primaryBg : "transparent",
                  color: !isCustom ? GA4_COLORS.primary : GA4_COLORS.textSecondary,
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: GA4_FONTS.family,
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  paddingRight: 28,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                }}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

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

              {/* Custom date picker popover — visual calendar */}
              {showCustomPicker && (() => {
                const pad = (n: number) => String(n).padStart(2, "0");
                const localDateStr = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
                const today = new Date(); today.setHours(0,0,0,0);
                const todayStr = localDateStr(today);
                const year = calMonth.getFullYear();
                const month = calMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
                const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const monthLabel = calMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

                const effectiveEnd = rangeEnd || (rangeStart && hoverDate && !rangeEnd ? hoverDate : null);
                const selStart = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? effectiveEnd : rangeStart;
                const selEnd = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? rangeStart : effectiveEnd;

                const cells: { dateStr: string; day: number; isOutside: boolean }[] = [];
                for (let i = 0; i < startOffset; i++) {
                  const d = new Date(year, month, -startOffset + i + 1);
                  cells.push({ dateStr: localDateStr(d), day: d.getDate(), isOutside: true });
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const dt = new Date(year, month, d);
                  cells.push({ dateStr: localDateStr(dt), day: d, isOutside: false });
                }
                const remaining = 7 - (cells.length % 7);
                if (remaining < 7) {
                  for (let i = 1; i <= remaining; i++) {
                    const d = new Date(year, month + 1, i);
                    cells.push({ dateStr: localDateStr(d), day: d.getDate(), isOutside: true });
                  }
                }

                return (
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
                    width: 300,
                    userSelect: "none",
                  }}>
                    {/* Month header with nav arrows */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                        style={{ background: "none", border: "none", color: GA4_COLORS.textSecondary, cursor: "pointer", fontSize: 18, padding: "2px 8px" }}>‹</button>
                      <div style={{ fontSize: 13, fontWeight: 500, color: GA4_COLORS.textPrimary }}>{monthLabel}</div>
                      <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                        style={{ background: "none", border: "none", color: GA4_COLORS.textSecondary, cursor: "pointer", fontSize: 18, padding: "2px 8px" }}>›</button>
                    </div>

                    {/* Day-of-week headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 4 }}>
                      {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
                        <div key={d} style={{ textAlign: "center", fontSize: 10, color: GA4_COLORS.textTertiary, padding: "4px 0", fontWeight: 600 }}>{d}</div>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                      {cells.map(({ dateStr, day, isOutside }, idx) => {
                        const isFuture = dateStr > todayStr;
                        const isStart = dateStr === selStart;
                        const isEnd = dateStr === selEnd;
                        const isInRange = selStart && selEnd && dateStr > selStart && dateStr < selEnd;
                        const isToday = dateStr === todayStr;
                        const disabled = isFuture || isOutside;

                        let bg: string = "transparent";
                        let fg: string = isOutside ? GA4_COLORS.textTertiary : GA4_COLORS.textPrimary;
                        let borderR = "50%";
                        if (isFuture) fg = "rgba(255,255,255,0.15)";
                        if (isStart || isEnd) { bg = GA4_COLORS.primary; fg = "#fff"; }
                        else if (isInRange) { bg = `${GA4_COLORS.primary}30`; fg = GA4_COLORS.textPrimary; borderR = "0"; }

                        return (
                          <div
                            key={idx}
                            onClick={() => !disabled && handleCalendarClick(dateStr)}
                            onMouseEnter={() => { if (rangeStart && !rangeEnd && !disabled) setHoverDate(dateStr); }}
                            style={{
                              textAlign: "center",
                              fontSize: 12,
                              padding: "6px 0",
                              cursor: disabled ? "default" : "pointer",
                              background: bg,
                              color: fg,
                              borderRadius: isStart ? "50% 0 0 50%" : isEnd ? "0 50% 50% 0" : (isInRange ? "0" : "50%"),
                              fontWeight: isToday ? 700 : 400,
                              outline: isToday && !isStart && !isEnd ? `1px solid ${GA4_COLORS.primary}` : "none",
                              outlineOffset: -1,
                              transition: "background 0.1s",
                            }}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>

                    {/* Selection summary + buttons */}
                    <div style={{ marginTop: 12, fontSize: 12, color: GA4_COLORS.textSecondary, textAlign: "center", minHeight: 18 }}>
                      {rangeStart && rangeEnd
                        ? `${new Date(rangeStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(rangeEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                        : rangeStart
                          ? "Click an end date"
                          : "Click a start date"}
                    </div>

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        onClick={() => { setShowCustomPicker(false); setRangeStart(null); setRangeEnd(null); }}
                        style={{
                          padding: "6px 14px", borderRadius: 4,
                          border: `1px solid ${GA4_COLORS.border}`,
                          background: "transparent", color: GA4_COLORS.textSecondary,
                          fontSize: 13, fontFamily: GA4_FONTS.family, cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCustomApply}
                        disabled={!rangeStart || !rangeEnd}
                        style={{
                          padding: "6px 14px", borderRadius: 4, border: "none",
                          background: (!rangeStart || !rangeEnd) ? "#333" : GA4_COLORS.primary,
                          color: (!rangeStart || !rangeEnd) ? "#666" : "#fff",
                          fontSize: 13, fontWeight: 500, fontFamily: GA4_FONTS.family,
                          cursor: (!rangeStart || !rangeEnd) ? "default" : "pointer",
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })()}
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

            {/* Compare-mode banner for pages that don't support segment comparison */}
            {compareMode && !["overview", "acquisition", "engagement", "tech", "errors", "journeys"].includes(activePage) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", marginBottom: 16, borderRadius: 8,
                background: "rgba(26, 115, 232, 0.08)",
                border: "1px solid rgba(26, 115, 232, 0.25)",
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="#1a73e8" style={{ flexShrink: 0 }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
                <span style={{ fontSize: 13, color: "#1a73e8" }}>
                  Compare mode is active — segment comparison is not available on this page.
                  Data shown reflects <strong>Segment A</strong> only.
                </span>
              </div>
            )}
            {activePage === "overview" && (
              <OverviewPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "realtime" && (
              <RealtimePage appId={selectedApp} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "acquisition" && (
              <AcquisitionPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "engagement" && (
              <EngagementPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "tech" && (
              <TechPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "errors" && (
              <ErrorsPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoading={triggerLoading} onLoadEnd={stopLoading} />
            )}
            {activePage === "journeys" && (
              <JourneysPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} globalFilterB={globalFilterB} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "aem-requests" && (
              <ContentRequestsPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "sessions" && (
              <SessionExplorerPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "vitals" && (
              <WebVitalsPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoading={triggerLoading} onLoadEnd={stopLoading} />
            )}
            {activePage === "retention" && (
              <RetentionPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "conversions" && (
              <ConversionsPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "utm" && (
              <UTMPage appId={selectedApp} timeframe={timeframe} globalFilter={globalFilter} refreshKey={refreshKey} onLoadEnd={stopLoading} />
            )}
            {activePage === "segments" && (
              <SegmentsPage onLoadEnd={stopLoading} />
            )}
            {activePage === "settings" && (
              <SettingsPage onLoadEnd={stopLoading} />
            )}
          </main>
        </div>
      </div>

      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)",
        }}>
          <div style={{
            background: GA4_COLORS.cardBg,
            border: `1px solid ${GA4_COLORS.border}`,
            borderRadius: 12,
            padding: "32px 36px",
            maxWidth: 520,
            width: "90%",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: GA4_COLORS.textPrimary, marginBottom: 20 }}>
              IMPORTANT NOTICE
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: GA4_COLORS.textPrimary, marginBottom: 12 }}>
              Unofficial Community Application
            </div>
            <div style={{ fontSize: 13, color: GA4_COLORS.textSecondary, lineHeight: 1.7, marginBottom: 16 }}>
              This is <strong>not an official Dynatrace application</strong> and it is not something you can open a support ticket on.
            </div>
            <div style={{ fontSize: 13, color: GA4_COLORS.textSecondary, lineHeight: 1.7, marginBottom: 16 }}>
              You may create an issue on the GitHub repository:
            </div>
            <a
              href="https://github.com/mf-dynatrace/dynatrace-session-analytics"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 13,
                color: GA4_COLORS.primary,
                textDecoration: "none",
                marginBottom: 16,
                fontFamily: "monospace",
              }}
            >
              github.com/mf-dynatrace/dynatrace-session-analytics
            </a>
            <div style={{ fontSize: 13, color: GA4_COLORS.textSecondary, lineHeight: 1.7, marginBottom: 24 }}>
              Feel free to fork the repository for your own use as well.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, paddingTop: 16, borderTop: `1px solid ${GA4_COLORS.border}` }}>
              <input
                type="checkbox"
                id="disclaimer-checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <label
                htmlFor="disclaimer-checkbox"
                style={{ fontSize: 13, color: GA4_COLORS.textSecondary, cursor: "pointer", userSelect: "none" }}
              >
                Don't show this again
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={handleDisclaimerClose}
                style={{
                  padding: "10px 24px", borderRadius: 6,
                  border: "none",
                  background: GA4_COLORS.primary,
                  color: "#fff",
                  fontSize: 13, fontWeight: 500, fontFamily: GA4_FONTS.family,
                  cursor: "pointer",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-range confirmation modal */}
      {pendingTimeframe && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        }}>
          <div style={{
            background: GA4_COLORS.cardBg,
            border: `1px solid ${GA4_COLORS.border}`,
            borderRadius: 12,
            padding: "28px 32px",
            maxWidth: 420,
            width: "90%",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="#f9ab00">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              <div style={{ fontSize: 16, fontWeight: 500, color: GA4_COLORS.textPrimary }}>
                Extended loading time
              </div>
            </div>
            <div style={{ fontSize: 13, color: GA4_COLORS.textSecondary, lineHeight: 1.6, marginBottom: 24 }}>
              Loading times will be extended due to the amount of data being queried over a longer time range.
              Some pages may take considerably longer to load.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={cancelLongRange}
                style={{
                  padding: "8px 20px", borderRadius: 6,
                  border: `1px solid ${GA4_COLORS.border}`,
                  background: "transparent",
                  color: GA4_COLORS.textSecondary,
                  fontSize: 13, fontFamily: GA4_FONTS.family,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLongRange}
                style={{
                  padding: "8px 20px", borderRadius: 6,
                  border: "none",
                  background: GA4_COLORS.primary,
                  color: "#fff",
                  fontSize: 13, fontWeight: 500, fontFamily: GA4_FONTS.family,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
