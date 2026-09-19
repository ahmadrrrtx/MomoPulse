/**
 * Minimal JSON fetch with timeout, retry-on-network-error and envelope unwrapping.
 * No dependencies — runs identically in Node 20+ (CLI, API routes) and the browser.
 */
import { MomoPulseError } from "@/core/errors";

export interface FetchJsonOpts {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Retry count for NETWORK failures only (never for 4xx, never for sends). */
  retries?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchJson<T>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS, headers, retries = 2, signal } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onOuterAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onOuterAbort);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        // 4xx/5xx are NOT retried here — callers decide (a degraded launchpad API is a state, not a blip).
        const text = await res.text().catch(() => "");
        throw new MomoPulseError(
          `HTTP ${res.status} from ${new URL(url).host}`,
          text.slice(0, 200) || "the upstream service rejected the request",
        );
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof MomoPulseError) throw e; // HTTP-level error: no retry
      lastErr = e;
      if (signal?.aborted) throw new MomoPulseError("request aborted");
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1) + Math.random() * 200));
        continue;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }
  const detail = lastErr ? String((lastErr as Error)?.message ?? lastErr).slice(0, 120) : "";
  throw new MomoPulseError(
    `network failure calling ${new URL(url).host}`,
    `check your connection; the RPC/API may be degraded${detail ? ` (${detail})` : ""}`,
  );
}

/** MomoSwap/CookieScan-style envelopes: `{ success: false, error }` means a logical failure at HTTP 200. */
export function unwrap<T extends object>(res: T, what: string): T {
  const env = res as T & { success?: boolean; error?: string };
  if (env.success === false) {
    throw new MomoPulseError(env.error ?? `${what} failed`, "check the inputs and retry");
  }
  return res;
}
