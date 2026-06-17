/**
 * pages/SegmentsPage.tsx
 *
 * Manage saved segments — list, create, and delete named segment presets.
 */

import React, { useState } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_FONTS, GA4_SPACING } from "../styles/ga4Theme";
import { SegmentForm, SegmentState, EMPTY_SEGMENT, segmentTags, segmentActiveCount } from "../components/SegmentForm";
import { useSavedSegments } from "../hooks/useSavedSegments";

const ACCENT = "#1a73e8";

interface SegmentsPageProps {
  onLoadEnd?: () => void;
}

function FilterTag({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 10,
      background: `${ACCENT}18`, border: `1px solid ${ACCENT}30`,
      color: ACCENT, fontSize: 11, fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

export function SegmentsPage({ onLoadEnd }: SegmentsPageProps) {
  const { segments, loading, error, saveSegment, deleteSegment, refresh } = useSavedSegments();

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<SegmentState>(EMPTY_SEGMENT);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Notify parent the page has loaded
  React.useEffect(() => { if (!loading) onLoadEnd?.(); }, [loading]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveSegment({ name: name.trim(), ...draft });
      setDraft(EMPTY_SEGMENT);
      setName("");
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (objectId: string, version: string) => {
    setDeleting(objectId);
    try {
      await deleteSegment(objectId, version);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
            Segments
          </h1>
          <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
            Save and manage named session filter presets
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setDraft(EMPTY_SEGMENT); setName(""); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 500,
              fontFamily: GA4_FONTS.family, cursor: "pointer",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            New segment
          </button>
        )}
      </div>

      {/* New segment form */}
      {showForm && (
        <div style={{ ...GA4_STYLES.card, borderLeft: `3px solid ${ACCENT}` }} className="ga4-animate">
          <div style={{ fontSize: 15, fontWeight: 500, color: GA4_COLORS.textPrimary, marginBottom: 16 }}>
            New segment
          </div>

          {/* Name input */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: GA4_COLORS.textSecondary, width: 60, flexShrink: 0 }}>
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowForm(false); }}
              placeholder="e.g. Mobile users with errors"
              style={{
                flex: 1, padding: "7px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${ACCENT}`, fontFamily: GA4_FONTS.family,
                color: GA4_COLORS.textPrimary, background: GA4_COLORS.pageBg, outline: "none",
              }}
            />
          </div>

          {/* Filters */}
          <SegmentForm draft={draft} onDraftChange={setDraft} accentColor={ACCENT} />

          {/* Preview */}
          {segmentActiveCount(draft) > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {segmentTags(draft).map(tag => <FilterTag key={tag} label={tag} />)}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "7px 16px", borderRadius: 6,
                border: `1px solid ${GA4_COLORS.border}`,
                background: "transparent", color: GA4_COLORS.textSecondary,
                fontSize: 13, fontFamily: GA4_FONTS.family, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              style={{
                padding: "7px 20px", borderRadius: 6, border: "none",
                background: !name.trim() ? "#333" : ACCENT,
                color: !name.trim() ? "#666" : "#fff",
                fontSize: 13, fontWeight: 500, fontFamily: GA4_FONTS.family,
                cursor: (!name.trim() || saving) ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save segment"}
            </button>
          </div>
        </div>
      )}

      {/* Segments list */}
      {loading ? (
        <div style={GA4_STYLES.card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 56, borderRadius: 6, background: "rgba(255,255,255,0.05)",
                animation: "pulse 1.5s ease-in-out infinite",
              }} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div style={{ ...GA4_STYLES.card, color: "#e03e2d", fontSize: 13 }}>
          Failed to load segments: {error}
        </div>
      ) : segments.length === 0 && !showForm ? (
        <div style={{
          ...GA4_STYLES.card, textAlign: "center", padding: "48px 24px",
          color: GA4_COLORS.textTertiary, fontSize: 14,
        }}>
          <svg width={40} height={40} viewBox="0 0 24 24" fill={GA4_COLORS.textTertiary}
            style={{ marginBottom: 12, display: "block", margin: "0 auto 12px" }}>
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          No saved segments yet.
          <br />
          <button onClick={() => { setShowForm(true); setDraft(EMPTY_SEGMENT); setName(""); }}
            style={{
              marginTop: 12, background: "none", border: "none", cursor: "pointer",
              color: ACCENT, fontSize: 13, fontFamily: GA4_FONTS.family, padding: 0,
            }}>
            Create your first segment →
          </button>
        </div>
      ) : segments.length > 0 ? (
        <div style={GA4_STYLES.card} className="ga4-animate">
          <div style={{ fontSize: 13, fontWeight: 500, color: GA4_COLORS.textSecondary, marginBottom: 12 }}>
            {segments.length} saved {segments.length === 1 ? "segment" : "segments"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {segments.map((seg, idx) => {
              const tags = segmentTags(seg);
              const isExpanded = expandedId === seg.objectId;
              const isDeleting = deleting === seg.objectId;
              return (
                <div
                  key={seg.objectId}
                  style={{
                    padding: "14px 0",
                    borderTop: idx > 0 ? `1px solid ${GA4_COLORS.border}` : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    {/* Name + expand */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : seg.objectId)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "none", border: "none", cursor: "pointer",
                        padding: 0, textAlign: "left", flex: 1,
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill={GA4_COLORS.textTertiary}
                        style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                      </svg>
                      <span style={{ fontSize: 14, fontWeight: 500, color: GA4_COLORS.textPrimary }}>
                        {seg.name}
                      </span>
                      {tags.length === 0 && (
                        <span style={{ fontSize: 12, color: GA4_COLORS.textTertiary }}>(no filters)</span>
                      )}
                    </button>

                    {/* Inline tags preview (collapsed) */}
                    {!isExpanded && tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                        {tags.map(tag => <FilterTag key={tag} label={tag} />)}
                      </div>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(seg.objectId, seg.version)}
                      disabled={isDeleting}
                      title="Delete segment"
                      style={{
                        background: "none", border: "none", cursor: isDeleting ? "wait" : "pointer",
                        color: GA4_COLORS.textTertiary, fontSize: 18, lineHeight: 1,
                        padding: "2px 4px", flexShrink: 0, opacity: isDeleting ? 0.5 : 1,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { if (!isDeleting) (e.currentTarget as HTMLElement).style.color = "#e03e2d"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = GA4_COLORS.textTertiary; }}
                    >
                      {isDeleting ? "…" : "×"}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 10, paddingLeft: 22 }}>
                      {tags.length === 0 ? (
                        <div style={{ fontSize: 13, color: GA4_COLORS.textTertiary }}>No filters applied (matches all sessions)</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: GA4_COLORS.textTertiary,
                            textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
                            Active filters
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {tags.map(tag => <FilterTag key={tag} label={tag} />)}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 11, color: GA4_COLORS.textTertiary,
                            fontFamily: "monospace", background: "rgba(0,0,0,0.3)", borderRadius: 4,
                            padding: "6px 10px", wordBreak: "break-all" }}>
                            {[
                              seg.hasErrors  && "error.count > 0",
                              seg.isBounced  && "navigation_count <= 1",
                              seg.hasReplay  && "characteristics.has_replay == true",
                              seg.country    && `geo.country.iso_code == "${seg.country.toUpperCase()}"`,
                              seg.browser    && `contains(browser.name, "${seg.browser}")`,
                              seg.os         && `contains(os.name, "${seg.os}")`,
                              seg.url        && (
                                seg.urlOp === "not_contains"
                                  ? `NOT contains(${seg.urlField === "domain" ? "page.url.domain" : seg.urlField === "full" ? "page.url.full" : "page.url.path"}, "${seg.url}")`
                                  : seg.urlOp === "equals"
                                    ? `${seg.urlField === "domain" ? "page.url.domain" : seg.urlField === "full" ? "page.url.full" : "page.url.path"} == "${seg.url}"`
                                    : `contains(${seg.urlField === "domain" ? "page.url.domain" : seg.urlField === "full" ? "page.url.full" : "page.url.path"}, "${seg.url}")`
                              ),
                            ].filter(Boolean).join(" AND ")}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
