/**
 * Canonical Cookie Chain / MomoSwap constants — all live-verified 2026-09-19 against
 * rpc.cookiescan.io, api.momoswap.fun and api.cookiescan.io.
 *
 * ⚠ Economics (fees, reserves, targets) are NEVER hardcoded — they are admin-tunable and
 * snapshotted per pool at creation. Fetch /config and prefer the pool's own snapshot.
 */

export const C = {
  RPC: "https://rpc.cookiescan.io",
  WSS: "https://wss.cookiescan.io",
  DAS_API: "https://api.cookiescan.io",
  DAS_WS: "wss://api.cookiescan.io/stream",
  MOMO_API: "https://api.momoswap.fun/v1/launchpad",

  GENESIS_HASH: "9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2",

  COOK_DECIMALS: 9,
  COOK_SYMBOL: "COOK",
  /** Display fallback only — the real target comes from /config or the pool's own snapshot (1M COOK as of 2026-09-19). */
  GRADUATION_TARGET_FALLBACK: "1000000000000000",
  /** Native wrapped COOK mint on Cookie Chain. Same string as wSOL on Solana — different asset. */
  WCOOK_MINT: "So11111111111111111111111111111111111111112",
  /** Bridged COOK on Solana mainnet (Token-2022, 6 decimals). */
  SCOOK_MINT_SOLANA: "36ZrtQoab5MhhySaP1YSTwUahSk6GRVUTtZ6cuVfm9e1",

  /**
   * Launchpad program FALLBACK only. The launchpad has been redeployed before and old pools are
   * stranded on the old program id forever — resolve the real id at runtime from `pool.owner`
   * (see core/decode.ts fetchPoolPrograms). A hardcoded id fails silently: PDAs simply don't exist.
   */
  LAUNCHPAD_PROGRAM_FALLBACK: "momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw",
  /** Frozen, pinned Address Lookup Table for v0 create-pool builds (dev-buy path). */
  LAUNCHPAD_ALT: "CawUNMrsk6KwjXZ8kNPQgC1obMD4QM5oqvo3rF2bErX6",

  LIMIT_ORDER_PROGRAM: "L1M1tkE57jpgimzjs5S8HVsmwk4uwrWoDFuUvXpVniH",
  COOKIEBOX_DAMM: "DAMMjDCEFTDkt7ywazZS8GoaLtjb3HaJo3pLbf64xrPY",
  COOKIEBOX_CLMM: "CLMMmWqTtyNSomqXP3kETJy2SGKPdr31USsm4GfbLyKs",
  COOKIEBOX_DBC: "DBCg4ugDEztk6MbqHEJvx5a5YGJTj45Jb5NvtQ48Rvsf",
  COOKIEBOX_AGG: "https://agg.cookiebox.app",
  COOKIESWAP_BAMM: "WTzkPUoprVx7PDc1tfKA5sS7k1ynCgU89WtwZhksHX5",
  CANDY_SHOP: "https://swap.cookiescan.io",

  BRIDGE: "https://hyperlane.cookiescan.io",
  EXPLORER: "https://cookiescan.io",
  COOKIE_JAR: "568tU9FMksJDxjkLBjWisSA4J4C5uPH87NCCkyREwrxe",

  /** Anchor discriminator (first 8 bytes) of the launchpad's UserPosition account. */
  USER_POSITION_DISCRIMINATOR: [251, 248, 209, 245, 83, 234, 17, 27],

  /** Login domain for the MomoSwap session handshake (byte-exact contract with the backend). */
  LOGIN_DOMAIN: "momoswap.fun",
} as const;

export const explorerTxUrl = (sig: string) => `${C.EXPLORER}/tx/${sig}`;
export const explorerAddrUrl = (addr: string) => `${C.EXPLORER}/address/${addr}`;
export const launchpadPoolUrl = (pool: string) => `https://momoswap.fun/pool/${pool}`;
export const launchpadTokenUrl = (mint: string) => `https://momoswap.fun/token/${mint}`;
