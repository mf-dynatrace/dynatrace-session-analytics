/**
 * components/SegmentForm.tsx
 *
 * Shared segment state types, helpers, and filter-control form.
 * Used by CombinedSegmentPicker (header) and SegmentsPage.
 */

import React, { useState, useEffect, useRef } from "react";
import { GA4_COLORS, GA4_FONTS } from "../styles/ga4Theme";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UrlOp = "contains" | "not_contains" | "equals";
export type UrlField = "path" | "domain" | "full";

export interface SegmentState {
  hasErrors:  boolean;
  isBounced:  boolean;
  hasReplay:  boolean;
  country:    string;   // ISO-2 code, e.g. "IT"
  browser:    string;   // e.g. "Chrome"
  os:         string;   // e.g. "Windows"
  url:        string;   // URL value to match
  urlOp:      UrlOp;    // operator: contains | not_contains | equals
  urlField:   UrlField; // which part of the URL: path | domain | full
}

export const EMPTY_SEGMENT: SegmentState = {
  hasErrors: false, isBounced: false, hasReplay: false,
  country: "", browser: "", os: "",
  url: "", urlOp: "contains", urlField: "path",
};

// ── Country list ─────────────────────────────────────────────────────────────

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "AD", name: "Andorra" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "AR", name: "Argentina" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HR", name: "Croatia" },
  { code: "HU", name: "Hungary" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "LU", name: "Luxembourg" },
  { code: "MX", name: "Mexico" },
  { code: "MY", name: "Malaysia" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RS", name: "Serbia" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "TW", name: "Taiwan" },
  { code: "UA", name: "Ukraine" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
  { code: "ZA", name: "South Africa" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const URL_FIELD_MAP: Record<UrlField, string> = {
  path:   "page.url.path",
  domain: "page.url.domain",
  full:   "page.url.full",
};

export function segmentToFilter(s: SegmentState): string {
  const c: string[] = [];
  if (s.hasErrors) c.push("error.count > 0");
  if (s.isBounced) c.push("navigation_count <= 1");
  if (s.hasReplay) c.push("characteristics.has_replay == true");
  if (s.country.trim()) c.push(\`geo.country.iso_code == "\${s.country.trim().toUpperCase()}"\`);
  if (s.browser.trim()) c.push(\`contains(browser.name, "\${s.browser.trim()}")\`);
  if (s.os.trim()) c.push(\`contains(os.name, "\${s.os.trim()}")\`);
  if (s.url.trim()) {
    const field = URL_FIELD_MAP[s.urlField ?? "path"];
    const val = s.url.trim();
    if (s.urlOp === "not_contains") c.push(\`NOT contains(\${field}, "\${val}")\`);
    else if (s.urlOp === "equals")  c.push(\`\${field} == "\${val}"\`);
    else                            c.push(\`contains(\${field}, "\${val}")\`);
  }
  return c.join(" AND ");
}

export function segmentActiveCount(s: SegmentState): number {
  return [s.hasErrors, s.isBounced, s.hasReplay,
    !!s.country.trim(), !!s.browser.trim(), !!s.os.trim(), !!s.url.trim()].filter(Boolean).length;
}

/** Human-readable filter tags for a saved segment */
export function segmentTags(s: SegmentState): string[] {
  const tags: string[] = [];
  if (s.hasErrors)   tags.push("Has errors");
  if (s.isBounced)   tags.push("Bounced");
  if (s.hasReplay)   tags.push("Has replay");
  if (s.country)     tags.push(COUNTRIES.find(c => c.code === s.country.toUpperCase())?.name ?? s.country);
  if (s.browser)     tags.push(\`Browser: \${s.browser}\`);
  if (s.os)          tags.push(\`OS: \${s.os}\`);
  if (s.url.trim()) {
    const fieldLabel = s.urlField === "domain" ? "Host" : s.urlField === "full" ? "Full URL" : "URL path";
    const opLabel    = s.urlOp === "not_contains" ? "excludes" : s.urlOp === "equals" ? "=" : "contains";
    tags.push(\`\${fieldLabel} \${opLabel} "\${s.url.trim()}"\`);
  }
  return tags;
}

// ── SegmentForm ───────────────────────────────────────────────────────────────
// Filter controls only — no pill / dropdown wrapper.

interface SegmentFormProps {
  draft: SegmentState;
  onDraftChange: (s: SegmentState) => void;
  accentColor: string;
}

export function SegmentForm({ draft, onDraftChange, accentColor }: SegmentFormProps) {
  const toggle = (key: keyof Pick<SegmentState, "hasErrors" | "isBounced" | "hasReplay">) =>
    onDraftChange({ ...draft, [key]: !draft[key] });

  const setField = (key: keyof Pick<SegmentState, "country" | "browser" | "os" | "url">, val: string) =>
    onDraftChange({ ...draft, [key]: val });

  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
        setCountrySearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const selectedCountryName = draft.country
    ? (COUNTRIES.find(c => c.code === draft.country.toUpperCase())?.name ?? draft.country)
    : "";

  return (
    <div>
      {/* Quick filters */}
      <div style={{ fontSize: 11, fontWeight: 600, color: GA4_COLORS.textTertiary,
        textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
        Quick filters
      </div>
      {(["hasErrors", "isBounced", "hasReplay"] as const).map((key, i) => {
        const labels = ["Sessions with errors", "Bounced sessions", "Has session replay"];
        return (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            padding: "5px 0", fontSize: 13, color: GA4_COLORS.textPrimary }}>
            <input type="checkbox" checked={draft[key]} onChange={() => toggle(key)}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor }} />
            {labels[i]}
          </label>
        );
      })}

      {/* Dimension filters */}
      <div style={{ fontSize: 11, fontWeight: 600, color: GA4_COLORS.textTertiary,
        textTransform: "uppercase", letterSpacing: "0.8px", margin: "12px 0 6px" }}>
        Filter by
      </div>

      {/* Country picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, width: 60, flexShrink: 0 }}>
          Country
        </span>
        <div ref={countryRef} style={{ position: "relative", flex: 1 }}>
          <button
            onClick={() => { setCountryOpen(o => !o); setCountrySearch(""); }}
            style={{
              width: "100%", padding: "5px 8px", borderRadius: 4, fontSize: 13, textAlign: "left",
              border: \`1px solid \${draft.country ? accentColor : GA4_COLORS.border}\`,
              background: GA4_COLORS.pageBg, fontFamily: GA4_FONTS.family,
              color: draft.country ? GA4_COLORS.textPrimary : GA4_COLORS.textTertiary,
              cursor: "pointer", outline: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <span>{selectedCountryName || "All countries"}</span>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {draft.country && (
                <span onClick={e => { e.stopPropagation(); setField("country", ""); }}
                  style={{ color: GA4_COLORS.textTertiary, fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                  title="Clear">×</span>
              )}
              <svg width={10} height={10} viewBox="0 0 24 24" fill={GA4_COLORS.textSecondary}
                style={{ transform: countryOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </span>
          </button>
          {countryOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 3000,
              background: GA4_COLORS.cardBg, border: \`1px solid \${GA4_COLORS.border}\`,
              borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
              maxHeight: 200, display: "flex", flexDirection: "column",
            }}>
              <div style={{ padding: "6px 8px", borderBottom: \`1px solid \${GA4_COLORS.border}\` }}>
                <input autoFocus type="text" value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Search country…"
                  style={{
                    width: "100%", padding: "4px 6px", borderRadius: 4, fontSize: 12,
                    border: \`1px solid \${GA4_COLORS.border}\`, fontFamily: GA4_FONTS.family,
                    color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {filteredCountries.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: GA4_COLORS.textTertiary }}>
                    No countries found
                  </div>
                ) : filteredCountries.map(c => (
                  <div key={c.code}
                    onClick={() => { setField("country", c.code); setCountryOpen(false); setCountrySearch(""); }}
                    style={{
                      padding: "7px 12px", fontSize: 13, cursor: "pointer",
                      color: GA4_COLORS.textPrimary,
                      background: draft.country === c.code ? GA4_COLORS.primaryBg : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                    onMouseEnter={e => { if (draft.country !== c.code) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { if (draft.country !== c.code) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span>{c.name}</span>
                    <span style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginLeft: 8 }}>{c.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Browser / OS text inputs */}
      {(["browser", "os"] as const).map(key => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, width: 60, flexShrink: 0 }}>
            {key === "browser" ? "Browser" : "OS"}
          </span>
          <input
            type="text"
            value={draft[key]}
            onChange={e => setField(key, e.target.value)}
            placeholder={key === "browser" ? "Chrome, Firefox…" : "Windows, macOS…"}
            style={{
              flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 13,
              border: \`1px solid \${GA4_COLORS.border}\`, fontFamily: GA4_FONTS.family,
              color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
            }}
          />
        </div>
      ))}

      {/* URL / Host / Query filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
        <span style={{ fontSize: 12, color: GA4_COLORS.textSecondary, width: 60, flexShrink: 0 }}>
          URL
        </span>
        {/* Field selector */}
        <select
          value={draft.urlField ?? "path"}
          onChange={e => onDraftChange({ ...draft, urlField: e.target.value as UrlField })}
          style={{
            padding: "5px 6px", borderRadius: 4, fontSize: 12,
            border: \`1px solid \${GA4_COLORS.border}\`, fontFamily: GA4_FONTS.family,
            color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
            flexShrink: 0,
          }}
        >
          <option value="path">Path</option>
          <option value="domain">Host</option>
          <option value="full">Full URL</option>
        </select>
        {/* Operator selector */}
        <select
          value={draft.urlOp ?? "contains"}
          onChange={e => onDraftChange({ ...draft, urlOp: e.target.value as UrlOp })}
          style={{
            padding: "5px 6px", borderRadius: 4, fontSize: 12,
            border: \`1px solid \${GA4_COLORS.border}\`, fontFamily: GA4_FONTS.family,
            color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
            flexShrink: 0,
          }}
        >
          <option value="contains">contains</option>
          <option value="not_contains">excludes</option>
          <option value="equals">equals</option>
        </select>
        {/* Value input */}
        <input
          type="text"
          value={draft.url ?? ""}
          onChange={e => setField("url", e.target.value)}
          placeholder="/checkout, example.com…"
          style={{
            flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 13,
            border: \`1px solid \${draft.url?.trim() ? accentColor : GA4_COLORS.border}\`,
            fontFamily: GA4_FONTS.family,
            color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
          }}
        />
      </div>
    </div>
  );
}
