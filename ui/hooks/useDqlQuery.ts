/**
 * hooks/useDqlQuery.ts
 *
 * Generic hook for executing DQL queries against Dynatrace Grail.
 * Handles loading states, polling for long-running queries, and error handling.
 */

import { useState, useCallback } from "react";
import { queryExecutionClient } from "@dynatrace-sdk/client-query";

export interface DqlQueryResult<T = Record<string, unknown>> {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  execute: (query: string) => Promise<T[]>;
}

/**
 * Execute a single DQL query and return typed records.
 * Handles polling for RUNNING state automatically.
 */
export async function executeDql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const result = await queryExecutionClient.queryExecute({
    body: {
      query,
      requestTimeoutMilliseconds: 60_000,
      fetchTimeoutSeconds: 60,
      maxResultRecords: 5000,
      maxResultBytes: 10_000_000,
    },
  });

  if (result.state === "RUNNING" && result.requestToken) {
    let attempts = 0;
    while (attempts < 15) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
      const poll = await queryExecutionClient.queryPoll({
        requestToken: result.requestToken,
      });
      if (poll.state === "SUCCEEDED") {
        return (poll.result?.records ?? []).filter(Boolean) as T[];
      }
      if (poll.state === "FAILED" || poll.state === "CANCELLED") {
        throw new Error(`Query ${poll.state.toLowerCase()}`);
      }
    }
    throw new Error("Query timed out after polling");
  }

  if (result.state !== "SUCCEEDED") {
    throw new Error(`Query ${result.state?.toLowerCase() ?? "failed"}`);
  }

  return (result.result?.records ?? []).filter(Boolean) as T[];
}

/**
 * React hook wrapping DQL query execution with loading/error state.
 */
export function useDqlQuery<T = Record<string, unknown>>(): DqlQueryResult<T> {
  const [data, setData]       = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const execute = useCallback(async (query: string): Promise<T[]> => {
    setLoading(true);
    setError(null);
    try {
      const records = await executeDql<T>(query);
      setData(records);
      return records;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setData(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, execute };
}

/**
 * Execute multiple DQL queries in parallel and return all results.
 * Useful for dashboard pages that need several data sets at once.
 */
export async function executeMultipleDql(
  queries: Record<string, string>
): Promise<Record<string, Record<string, unknown>[]>> {
  const keys = Object.keys(queries);
  const results = await Promise.all(
    keys.map(key => executeDql(queries[key]).catch(() => []))
  );
  const output: Record<string, Record<string, unknown>[]> = {};
  keys.forEach((key, i) => { output[key] = results[i]; });
  return output;
}
