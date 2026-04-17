/**
 * pages/SettingsPage.tsx
 *
 * Admin-only settings page for managing conversion configurations.
 * Uses App Settings 2.0 to persist per-Frontend conversion page patterns.
 * Regular users see read-only view; users with write permissions can edit.
 */

import React, { useState, useCallback } from "react";
import { GA4_COLORS, GA4_STYLES, GA4_SPACING } from "../styles/ga4Theme";
import { useConversionSettings, ConversionConfig, DEFAULT_CONVERSION_PATTERNS } from "../hooks/useConversionSettings";
import { useApplications } from "../hooks/useApplications";

interface SettingsPageProps {
  onLoadEnd?: () => void;
}

export function SettingsPage({ onLoadEnd }: SettingsPageProps) {
  const { configs, loading, canWrite, error, saveConfig, updateConfig, deleteConfig, refresh } = useConversionSettings();
  const { apps } = useApplications();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAppId, setFormAppId] = useState("");
  const [formPatterns, setFormPatterns] = useState("");

  React.useEffect(() => {
    if (!loading) onLoadEnd?.();
  }, [loading]);

  const appName = (id: string) => apps.find(a => a.id === id)?.name || id;

  const startEdit = useCallback((config: ConversionConfig) => {
    setEditingId(config.objectId);
    setFormName(config.name);
    setFormAppId(config.applicationId);
    setFormPatterns(config.conversionPatterns.join(", "));
    setShowNew(false);
    setSaveError(null);
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    setShowNew(true);
    setFormName("");
    setFormAppId("");
    setFormPatterns(DEFAULT_CONVERSION_PATTERNS.join(", "));
    setSaveError(null);
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setShowNew(false);
    setSaveError(null);
  }, []);

  const parsePatterns = (raw: string): string[] =>
    raw.split(",").map(s => s.trim()).filter(Boolean);

  const handleSave = useCallback(async () => {
    const patterns = parsePatterns(formPatterns);
    if (!formName || !formAppId || patterns.length === 0) {
      setSaveError("All fields are required. Provide at least one conversion pattern.");
      return;
    }
    if (!/^APPLICATION-[A-F0-9]+$/.test(formAppId)) {
      setSaveError("Application ID must match format APPLICATION-XXXX (hex uppercase).");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (editingId) {
        const existing = configs.find(c => c.objectId === editingId);
        if (existing) {
          await updateConfig({ ...existing, name: formName, applicationId: formAppId, conversionPatterns: patterns });
        }
      } else {
        await saveConfig({ name: formName, applicationId: formAppId, conversionPatterns: patterns });
      }
      setEditingId(null);
      setShowNew(false);
    } catch (err: any) {
      console.error("[Settings] save error:", err);
      setSaveError(err?.message || "Failed to save. You may not have write permissions.");
    } finally {
      setSaving(false);
    }
  }, [editingId, formName, formAppId, formPatterns, configs, updateConfig, saveConfig]);

  const handleDelete = useCallback(async (config: ConversionConfig) => {
    if (!confirm(`Delete conversion config "${config.name}"?`)) return;
    setSaving(true);
    try {
      await deleteConfig(config.objectId, config.version);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  }, [deleteConfig]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: GA4_COLORS.cardBg,
    border: `1px solid ${GA4_COLORS.border}`,
    borderRadius: 6,
    color: GA4_COLORS.textPrimary,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const btnStyle = (variant: "primary" | "secondary" | "danger"): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    cursor: saving ? "wait" : "pointer",
    fontSize: 13,
    fontWeight: 500,
    opacity: saving ? 0.6 : 1,
    ...(variant === "primary" ? { background: GA4_COLORS.primary, color: "#fff" } :
      variant === "danger" ? { background: "#d93025", color: "#fff" } :
      { background: GA4_COLORS.cardBg, color: GA4_COLORS.textPrimary, border: `1px solid ${GA4_COLORS.border}` }),
  });

  const renderForm = () => (
    <div style={{ ...GA4_STYLES.card, border: `1px solid ${GA4_COLORS.primary}40` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: GA4_COLORS.textPrimary }}>
          {editingId ? "Edit Configuration" : "New Conversion Configuration"}
        </div>

        <div>
          <label style={{ fontSize: 12, color: GA4_COLORS.textSecondary, display: "block", marginBottom: 4 }}>
            Configuration Name
          </label>
          <input
            style={inputStyle}
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g. Sizzling Pubs Conversions"
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: GA4_COLORS.textSecondary, display: "block", marginBottom: 4 }}>
            Frontend Application ID
          </label>
          <select
            style={{ ...inputStyle, appearance: "auto" }}
            value={formAppId}
            onChange={e => setFormAppId(e.target.value)}
          >
            <option value="">Select a Frontend…</option>
            {apps.map(app => (
              <option key={app.id} value={app.id}>{app.name} ({app.id})</option>
            ))}
          </select>
          {formAppId && !apps.find(a => a.id === formAppId) && (
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={formAppId}
              onChange={e => setFormAppId(e.target.value)}
              placeholder="APPLICATION-XXXX"
            />
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, color: GA4_COLORS.textSecondary, display: "block", marginBottom: 4 }}>
            Conversion Patterns (comma-separated URL path keywords)
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "monospace" }}
            value={formPatterns}
            onChange={e => setFormPatterns(e.target.value)}
            placeholder="booking, order, checkout, confirm, payment, thank, success"
          />
          <div style={{ fontSize: 11, color: GA4_COLORS.textTertiary, marginTop: 4 }}>
            A session is "converted" if it visits any page whose URL path contains one of these keywords.
          </div>
        </div>

        {saveError && (
          <div style={{ padding: "8px 12px", background: "#d9302510", border: "1px solid #d93025", borderRadius: 6, color: "#d93025", fontSize: 13 }}>
            {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnStyle("primary")} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update" : "Create"}
          </button>
          <button style={btnStyle("secondary")} onClick={cancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GA4_SPACING.sectionGap }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: GA4_COLORS.textPrimary }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: GA4_COLORS.textSecondary, margin: "4px 0 0" }}>
          Configure conversion page patterns per Frontend application
        </p>
      </div>

      {/* Info banner */}
      <div style={{
        ...GA4_STYLES.card,
        background: `linear-gradient(135deg, ${GA4_COLORS.primaryBg}, ${GA4_COLORS.cardBg})`,
      }}>
        <div style={{ fontSize: 12, color: GA4_COLORS.textSecondary }}>
          Conversion patterns define which URL paths count as "goal completions". Each Frontend can have its own set of patterns.
          When no custom configuration exists, the default patterns are used:{" "}
          <span style={{ fontFamily: "monospace", color: GA4_COLORS.textTertiary }}>
            {DEFAULT_CONVERSION_PATTERNS.join(", ")}
          </span>
        </div>
        {!canWrite && (
          <div style={{ fontSize: 12, color: GA4_COLORS.textTertiary, marginTop: 8, fontStyle: "italic" }}>
            🔒 You have read-only access. Only Dynatrace environment admins (settings:objects:write) can modify these settings.
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...GA4_STYLES.card, border: "1px solid #d93025" }}>
          <div style={{ color: "#d93025", fontSize: 13 }}>{error}</div>
          <button style={{ ...btnStyle("secondary"), marginTop: 8 }} onClick={refresh}>Retry</button>
        </div>
      )}

      {/* Add new */}
      {canWrite && !showNew && !editingId && (
        <button
          style={{ ...btnStyle("primary"), alignSelf: "flex-start" }}
          onClick={startNew}
        >
          + Add Conversion Config
        </button>
      )}

      {showNew && renderForm()}

      {/* Existing configs */}
      {loading ? (
        <div style={GA4_STYLES.card}>
          <div style={{ padding: 24, textAlign: "center", color: GA4_COLORS.textTertiary }}>
            Loading settings…
          </div>
        </div>
      ) : configs.length === 0 && !showNew ? (
        <div style={GA4_STYLES.card}>
          <div style={{ padding: 24, textAlign: "center", color: GA4_COLORS.textTertiary }}>
            No conversion configurations yet. Using default patterns for all Frontends.
          </div>
        </div>
      ) : (
        configs.map(config => (
          <div key={config.objectId} style={GA4_STYLES.card}>
            {editingId === config.objectId ? renderForm() : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: GA4_COLORS.textPrimary, marginBottom: 4 }}>
                    {config.name}
                  </div>
                  <div style={{ fontSize: 12, color: GA4_COLORS.textSecondary, marginBottom: 8 }}>
                    Frontend: {appName(config.applicationId)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {config.conversionPatterns.map((p, i) => (
                      <span key={i} style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        background: `${GA4_COLORS.primary}20`,
                        color: GA4_COLORS.primary,
                        borderRadius: 12,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                {canWrite && (
                  <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
                    <button style={btnStyle("secondary")} onClick={() => startEdit(config)}>Edit</button>
                    <button style={btnStyle("danger")} onClick={() => handleDelete(config)}>Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
