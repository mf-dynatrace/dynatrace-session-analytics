/**
 * hooks/useSavedSegments.ts
 *
 * CRUD for named segments persisted via App Settings 2.0.
 * Schema: "segment-config" (see settings/schemas/segment-config.schema.json)
 */

import { useState, useEffect, useCallback } from "react";
import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";
import { UrlOp, UrlField } from "../components/SegmentForm";

const SCHEMA_ID = "segment-config";

export interface SavedSegment {
  objectId:  string;
  version:   string;
  name:      string;
  hasErrors: boolean;
  isBounced: boolean;
  hasReplay: boolean;
  country:   string;
  browser:   string;
  os:        string;
  url:       string;
  urlOp:     UrlOp;
  urlField:  UrlField;
}

export function useSavedSegments() {
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await appSettingsObjectsClient.getAppSettingsObjects({
        schemaId: SCHEMA_ID,
        addFields: "value,summary",
        pageSize: 50,
      });
      const parsed: SavedSegment[] = (response.items || []).map(item => ({
        objectId:  item.objectId,
        version:   item.version,
        name:      item.value?.name      ?? "",
        hasErrors: item.value?.hasErrors ?? false,
        isBounced: item.value?.isBounced ?? false,
        hasReplay: item.value?.hasReplay ?? false,
        country:   item.value?.country   ?? "",
        browser:   item.value?.browser   ?? "",
        os:        item.value?.os        ?? "",
        url:       item.value?.url       ?? "",
        urlOp:     (item.value?.urlOp    ?? "contains") as UrlOp,
        urlField:  (item.value?.urlField ?? "path")     as UrlField,
      }));
      setSegments(parsed);
    } catch (err: any) {
      console.error("[Segments] fetch error:", err);
      setError(err?.message || "Failed to load segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSegments(); }, [fetchSegments]);

  const saveSegment = useCallback(async (seg: Omit<SavedSegment, "objectId" | "version">) => {
    await appSettingsObjectsClient.postAppSettingsObject({
      body: {
        schemaId: SCHEMA_ID,
        value: {
          name:      seg.name,
          hasErrors: seg.hasErrors,
          isBounced: seg.isBounced,
          hasReplay: seg.hasReplay,
          country:   seg.country,
          browser:   seg.browser,
          os:        seg.os,
          url:       seg.url      ?? "",
          urlOp:     seg.urlOp    ?? "contains",
          urlField:  seg.urlField ?? "path",
        },
      },
    });
    await fetchSegments();
  }, [fetchSegments]);

  const deleteSegment = useCallback(async (objectId: string, version: string) => {
    await appSettingsObjectsClient.deleteAppSettingsObjectByObjectId({
      objectId,
      optimisticLockingVersion: version,
    });
    await fetchSegments();
  }, [fetchSegments]);

  return { segments, loading, error, saveSegment, deleteSegment, refresh: fetchSegments };
}
