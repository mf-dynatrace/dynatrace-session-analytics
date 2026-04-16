/**
 * hooks/useApplications.ts
 *
 * Discovers all RUM applications on the Dynatrace tenant.
 * Returns a list of { id, name } objects for the app selector dropdown.
 */

import { useState, useEffect, useCallback } from "react";
import { queryExecutionClient } from "@dynatrace-sdk/client-query";
import { discoverApplications } from "../dql/queries";

export interface RumApplication {
  id:   string;
  name: string;
}

export interface UseApplicationsResult {
  apps: RumApplication[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApplications(): UseApplicationsResult {
  const [apps, setApps]       = useState<RumApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryExecutionClient.queryExecute({
        body: {
          query: discoverApplications(),
          requestTimeoutMilliseconds: 30_000,
          fetchTimeoutSeconds: 30,
          maxResultRecords: 200,
        },
      });

      if (result.state === "SUCCEEDED" && result.result?.records) {
        const discovered = (result.result.records as Record<string, unknown>[])
          .filter(r => r && r["id"] && r["entity.name"])
          .map(r => ({
            id:   String(r["id"]),
            name: String(r["entity.name"]),
          }));
        setApps(discovered);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  return { apps, loading, error, refresh: fetchApps };
}
