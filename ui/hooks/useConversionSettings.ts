/**
 * hooks/useConversionSettings.ts
 *
 * Hook to read/write conversion configuration from App Settings 2.0.
 * Schema: "conversion-config" (see settings/schemas/conversion-config.schema.json)
 */

import { useState, useEffect, useCallback } from "react";
import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";

const SCHEMA_ID = "conversion-config";

/** Default conversion patterns used when no settings are configured */
export const DEFAULT_CONVERSION_PATTERNS = [
  "booking", "order", "checkout", "confirm", "payment",
  "thank", "success", "basket", "cart", "reserve",
];

export interface ConversionConfig {
  objectId: string;
  version: string;
  name: string;
  applicationId: string;
  conversionPatterns: string[];
}

export function useConversionSettings() {
  const [configs, setConfigs] = useState<ConversionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await appSettingsObjectsClient.getAppSettingsObjects({
        schemaId: SCHEMA_ID,
        addFields: "value,summary",
        pageSize: 50,
      });

      const parsed: ConversionConfig[] = (response.items || []).map((item) => ({
        objectId: item.objectId,
        version: item.version,
        name: item.value?.name || "",
        applicationId: item.value?.applicationId || "",
        conversionPatterns: item.value?.conversionPatterns || [],
      }));

      setConfigs(parsed);
    } catch (err: any) {
      console.error("[Settings] fetch error:", err);
      setError(err?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkWritePermission = useCallback(async () => {
    try {
      // Probe settings:objects:write — a platform scope that Dynatrace admins have by default.
      // A 403 response means the user is NOT an admin → read-only mode.
      const resp = await fetch(
        "/platform/classic/environment-api/v2/settings/objects?validateOnly=true",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            schemaId: "builtin:alerting.profile",
            value: { name: "__perm_check__" },
            scope: "environment",
          }]),
        },
      );
      // 403 = no settings:objects:write → read-only
      // Any other status (200, 400, 422) = user has write permission
      setCanWrite(resp.status !== 403);
    } catch {
      // Network/runtime error — fail open so the write call itself can return the real error
      setCanWrite(true);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    checkWritePermission();
  }, [fetchConfigs, checkWritePermission]);

  const saveConfig = useCallback(async (config: Omit<ConversionConfig, "objectId" | "version">) => {
    const body = {
      schemaId: SCHEMA_ID,
      value: {
        name: config.name,
        applicationId: config.applicationId,
        conversionPatterns: config.conversionPatterns,
      },
    };
    await appSettingsObjectsClient.postAppSettingsObject({ body });
    await fetchConfigs();
  }, [fetchConfigs]);

  const updateConfig = useCallback(async (config: ConversionConfig) => {
    await appSettingsObjectsClient.putAppSettingsObjectByObjectId({
      objectId: config.objectId,
      optimisticLockingVersion: config.version,
      body: {
        value: {
          name: config.name,
          applicationId: config.applicationId,
          conversionPatterns: config.conversionPatterns,
        },
      },
    });
    await fetchConfigs();
  }, [fetchConfigs]);

  const deleteConfig = useCallback(async (objectId: string, version: string) => {
    await appSettingsObjectsClient.deleteAppSettingsObjectByObjectId({
      objectId,
      optimisticLockingVersion: version,
    });
    await fetchConfigs();
  }, [fetchConfigs]);

  /** Get conversion patterns for a specific application ID, or defaults if none configured */
  const getPatternsForApp = useCallback((applicationId: string): string[] => {
    const match = configs.find(c => c.applicationId === applicationId);
    return match ? match.conversionPatterns : DEFAULT_CONVERSION_PATTERNS;
  }, [configs]);

  return {
    configs,
    loading,
    canWrite,
    error,
    saveConfig,
    updateConfig,
    deleteConfig,
    getPatternsForApp,
    refresh: fetchConfigs,
  };
}
