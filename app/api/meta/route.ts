/**
 * GET /api/meta?uri=ipfs://… — token metadata (name/symbol/description/image) resolved
 * server-side through a working IPFS gateway and edge-cached for an hour. Cards get real
 * artwork without each browser hitting slow public gateways.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TokenMeta {
  name: string | null;
  symbol: string | null;
  description: string | null;
  image: string | null;
}

export async function GET(req: Request) {
  const uri = new URL(req.url).searchParams.get("uri") ?? "";
  if (!uri) return NextResponse.json({ error: "uri required" }, { status: 400 });
  const target = uri.startsWith("ipfs://") ? `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}` : uri;
  if (!target.startsWith("https://")) return NextResponse.json({ error: "bad uri" }, { status: 400 });
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const json = (await res.json()) as Partial<TokenMeta>;
    const out: TokenMeta = {
      name: json.name ?? null,
      symbol: json.symbol ?? null,
      description: json.description ?? null,
      image: json.image ?? null,
    };
    return NextResponse.json(out, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json(
      { name: null, symbol: null, description: null, image: null },
      { headers: { "cache-control": "public, s-maxage=60" }, status: 502 },
    );
  }
}
