/**
 * styles/ga4Theme.ts
 *
 * Dynatrace-branded theme constants and CSS.
 * Uses the official Dynatrace color palette and BerninaSans font.
 */

// ── Dynatrace Color Palette ──────────────────────────────────────────────────

export const GA4_COLORS = {
  // Primary Dynatrace brand colors
  primary:       "#1496ff",   // Dynatrace blue
  primaryLight:  "#6dd2ff",   // Light blue accent
  primaryDark:   "#0078d4",   // Darker blue for hover
  primaryBg:     "#e6f4ff",   // Blue tint background

  // Sidebar (Dynatrace dark nav)
  sidebarBg:     "#1b1f23",
  sidebarHover:  "#2a2f35",
  sidebarActive: "#1496ff22",
  sidebarText:   "#b7bfc7",
  sidebarIcon:   "#b7bfc7",

  // Background & surface
  pageBg:        "#f4f5f6",
  cardBg:        "#ffffff",
  cardBorder:    "#e0e3e5",

  // Text
  textPrimary:   "#1b1f23",
  textSecondary: "#6d7680",
  textTertiary:  "#9ba3ab",
  textLink:      "#1496ff",

  // Data visualization (Dynatrace chart palette)
  chart: [
    "#1496ff", // Dynatrace blue
    "#6f2da8", // Dynatrace purple
    "#00b9cc", // Turquoise
    "#73be28", // Dynatrace green
    "#fd8232", // Orange
    "#b4dc00", // Lime
    "#c41425", // Red
    "#eda61e", // Amber
    "#14a8f5", // Sky blue
    "#9355b7", // Light purple
  ],

  // Status
  positive:      "#73be28",   // Dynatrace green
  negative:      "#c41425",   // Dynatrace red
  warning:       "#eda61e",   // Dynatrace amber
  neutral:       "#6d7680",

  // Borders & dividers
  divider:       "#e0e3e5",
  border:        "#e0e3e5",
} as const;

// ── Dynatrace Typography ─────────────────────────────────────────────────────

export const GA4_FONTS = {
  family: "DynatraceFlow, Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono:   "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
} as const;

// ── GA4 Spacing ───────────────────────────────────────────────────────────────

export const GA4_SPACING = {
  sidebarWidth:   256,
  sidebarCollapsed: 72,
  headerHeight:   64,
  cardPadding:    24,
  cardGap:        16,
  sectionGap:     24,
} as const;

// ── Global CSS (inject once via <style> tag) ──────────────────────────────────

export const GA4_GLOBAL_CSS = `
  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0;
    background: ${GA4_COLORS.pageBg};
    font-family: ${GA4_FONTS.family};
    color: ${GA4_COLORS.textPrimary};
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #bdc1c6; }

  @keyframes ga4-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes ga4-slide-in {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes ga4-count-up {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .ga4-animate { animation: ga4-fade-in 0.3s ease-out forwards; }
  .ga4-slide   { animation: ga4-slide-in 0.25s ease-out forwards; }
`;

// ── Reusable style objects ────────────────────────────────────────────────────

export const GA4_STYLES = {
  /** Card container - white rounded card with subtle border */
  card: {
    background:   GA4_COLORS.cardBg,
    borderRadius: 8,
    border:       `1px solid ${GA4_COLORS.cardBorder}`,
    padding:      GA4_SPACING.cardPadding,
  } as React.CSSProperties,

  /** Metric card - compact KPI display */
  metricCard: {
    background:   GA4_COLORS.cardBg,
    borderRadius: 8,
    border:       `1px solid ${GA4_COLORS.cardBorder}`,
    padding:      "20px 24px",
    flex:         1,
    minWidth:     200,
  } as React.CSSProperties,

  /** Section title (like GA4 section headers) */
  sectionTitle: {
    fontSize:     14,
    fontWeight:   500,
    color:        GA4_COLORS.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    margin:       "0 0 16px 0",
  } as React.CSSProperties,

  /** Big metric number */
  metricValue: {
    fontSize:   28,
    fontWeight: 400,
    color:      GA4_COLORS.textPrimary,
    lineHeight: 1.2,
    margin:     "4px 0",
  } as React.CSSProperties,

  /** Metric label */
  metricLabel: {
    fontSize:   12,
    fontWeight: 500,
    color:      GA4_COLORS.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
  } as React.CSSProperties,

  /** Change indicator (positive/negative) */
  changePositive: {
    fontSize:   13,
    fontWeight: 500,
    color:      GA4_COLORS.positive,
  } as React.CSSProperties,

  changeNegative: {
    fontSize:   13,
    fontWeight: 500,
    color:      GA4_COLORS.negative,
  } as React.CSSProperties,

  /** Table header */
  tableHeader: {
    fontSize:     12,
    fontWeight:   500,
    color:        GA4_COLORS.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
    padding:      "12px 16px",
    borderBottom: `1px solid ${GA4_COLORS.divider}`,
    textAlign:    "left" as const,
  } as React.CSSProperties,

  /** Table cell */
  tableCell: {
    fontSize:     14,
    color:        GA4_COLORS.textPrimary,
    padding:      "12px 16px",
    borderBottom: `1px solid ${GA4_COLORS.divider}`,
  } as React.CSSProperties,
} as const;
