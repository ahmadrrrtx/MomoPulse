/**
 * cookie-mcp external-signer bridge (H26–28) — FEATURE FLAGGED, OFF BY DEFAULT.
 *
 * Decision log: cookie-mcp v0.5.0 declares Node ≥22; this deployment targets Node 20
 * (Vercel 20 + local). That is exactly the "library friction" cut-line the plan defined:
 * ship direct-build only, keep the MCP path behind MCP_ENABLED=true for environments that
 * run Node 22+. When enabled, this route embeds runWithRequestContext({wallet}, …) and
 * exposes needs_signature → Nightly → submitSignedTransaction for the agent path.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = process.env.MCP_ENABLED === "true";
  return NextResponse.json(
    {
      enabled,
      mode: enabled ? "cookie-mcp external signer" : "direct-build (primary path)",
      reason: enabled
        ? undefined
        : "MCP_ENABLED unset — cookie-mcp requires Node ≥22; direct-build path is live and primary. Read-only MCP tools remain demonstrable via /api/scan, /api/pools, /api/trades.",
    },
    { status: enabled ? 200 : 501 },
  );
}
