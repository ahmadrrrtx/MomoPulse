/**
 * GET /api/safety?mint=<mint>&symbol=<sym> — the pre-trade safety layer (judge bar):
 *   1. mint authority renounced?  (parse SPL/Token-2022 Mint layout on-chain)
 *   2. transfer hooks?            (Token-2022 TLV scan for TransferHook extension, type 14)
 *   3. impostor mints?            (CookieScan registry: same symbol, different mint)
 *   4. token program + decimals + supply snapshot
 * One RPC read + one registry search; cached 60s. Never blocks trading — informs it.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getConnection } from "@/clients/rpc";
import { scanTransferHook } from "@/core/relay/eligibility";
import { searchAssets } from "@/clients/cookiescan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const EXT_TRANSFER_HOOK = 14; // spl-token-2022 ExtensionType::TransferHook

interface RegistryAsset {
  id?: string;
  address?: string;
  content?: { metadata?: { name?: string; symbol?: string } };
  mint?: string;
}

function parseMint(data: Buffer) {
  // COption<Pubkey>(4+32) · supply u64(8) · decimals u8 · isInitialized u8 · COption<Pubkey>(4+32) = 82
  if (data.length < 82) return null;
  const mintAuthOpt = data.readUInt32LE(0);
  const mintAuthority = mintAuthOpt === 1 ? bs58.encode(data.subarray(4, 36)) : null;
  const supply = data.readBigUInt64LE(36);
  const decimals = data.readUInt8(44);
  const freezeOpt = data.readUInt8(45) === 1 ? data.readUInt32LE(46) : data.readUInt32LE(46);
  const freezeAuthority = data.readUInt32LE(46) === 1 ? bs58.encode(data.subarray(50, 82)) : null;
  void freezeOpt;
  return { mintAuthority, freezeAuthority, supply: supply.toString(), decimals };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mintStr = url.searchParams.get("mint") ?? "";
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  }

  const out: Record<string, unknown> = {
    mint: mintStr,
    program: null,
    tokenProgramName: null,
    mintAuthority: undefined as string | null | undefined,
    freezeAuthority: undefined as string | null | undefined,
    decimals: null,
    supply: null,
    transferHook: { present: false, programId: null },
    impostors: [] as { mint: string; name: string }[],
    registryVerified: false,
  };

  try {
    const info = await getConnection().getAccountInfo(mint);
    if (info) {
      const owner = info.owner.toBase58();
      out.program = owner;
      out.tokenProgramName =
        owner === TOKEN_PROGRAM ? "SPL Token" : owner === TOKEN_2022_PROGRAM ? "Token-2022" : "unknown";
      const parsed = parseMint(Buffer.from(info.data));
      if (parsed) {
        out.mintAuthority = parsed.mintAuthority;
        out.freezeAuthority = parsed.freezeAuthority;
        out.decimals = parsed.decimals;
        out.supply = parsed.supply;
      }
      if (owner === TOKEN_2022_PROGRAM) {
        out.transferHook = scanTransferHook(Buffer.from(info.data));
      }
    }
  } catch {
    /* safety degrades to "unknown", never blocks */
  }

  if (symbol) {
    try {
      const res = (await searchAssets(symbol)) as { data?: RegistryAsset[] } | RegistryAsset[];
      const list = Array.isArray(res) ? res : (res.data ?? []);
      const same = list.filter((a) => {
        const m = a.address ?? a.mint ?? a.id ?? "";
        const sym = (a.content?.metadata?.symbol ?? "").toUpperCase();
        return sym === symbol && m !== mintStr;
      });
      out.impostors = same.slice(0, 5).map((a) => ({
        mint: (a.address ?? a.mint ?? a.id ?? "").toString(),
        name: a.content?.metadata?.name ?? "?",
      }));
      out.registryVerified = list.some((a) => (a.address ?? a.mint ?? a.id) === mintStr);
    } catch {
      /* registry optional */
    }
  }

  return NextResponse.json(out, {
    headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
