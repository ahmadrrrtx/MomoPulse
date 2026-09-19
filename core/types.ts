/**
 * MomoSwap launchpad domain types — mirrors the live api.momoswap.fun/v1/launchpad shapes
 * (audited against cookie-mcp@0.5.0 src/core/launchpad/api.ts and a live /config + /pools pull
 * on 2026-09-19). All u64+ values arrive as DECIMAL STRINGS — keep them as strings through
 * state; convert with BigInt() only inside pure math.
 */

export type PoolStatus = "upcoming" | "live" | "ended" | "graduated" | "expired";
/** `ended` is locally derived (API status still `live` but now > endTs) — see core/phases.ts. */
export type PoolPhase = PoolStatus;
export type ExpiryMode = "dead" | "fair" | "jackpot" | "survivor";
export type ClaimKind = "fair" | "winner" | "graduated_tokens" | "creator_vest";

/** Global launchpad economics (admin-tunable; every pool snapshots these at creation). */
export interface LaunchpadConfig {
  paymentMint: string;
  tradeFeeBps: number;
  treasuryFeeBps: number;
  creatorFeeBps: number;
  referralFeeBps: number;
  buybackFeeBps: number;
  creationFeeLamports: string;
  graduationTarget: string;
  graduationFee: string;
  creatorVestBps: number;
  defaultTokenDecimals: number;
  defaultTotalSupply: string;
  defaultSaleSupply: string;
  /** Opening curve reserves — only published by newer backends; degrade, never guess constants. */
  defaultVirtualPaymentReserve?: string;
  defaultVirtualTokenReserve?: string;
  paused: boolean;
  /** Pre-ground `momo` vanity mints in reserve (0 → launches unavailable). */
  momoReady?: number;
  momoReserveTarget?: number;
  /** Post-graduation swap economics on the migrated pool. */
  postGradFeeBps?: number;
  postGradTreasuryFeeBps?: number;
  postGradCreatorFeeBps?: number;
  postGradPaused?: boolean;
  treasuryPayment?: string;
  buybackPayment?: string;
  lpBurnBps?: number;
}

export interface LaunchpadPool {
  pubkey: string;
  config?: string;
  creator: string;
  creatorPaymentAccount?: string;
  poolId: string;
  name: string;
  symbol: string;
  uri: string;
  tokenMint: string;
  paymentMint: string;
  tokenVault: string;
  paymentVault: string;
  launchTs: number;
  endTs: number;
  durationSecs: number;
  expiryMode: ExpiryMode;
  migratable: boolean;
  antiSnipe: boolean;
  state: string;
  status: PoolStatus;
  /** "0" = unset. */
  minBuy: string;
  maxBuyPerWallet: string;
  maxPaymentRaise: string;
  totalTokenSupply: string;
  saleTokenSupply: string;
  virtualPaymentReserve: string;
  virtualTokenReserve: string;
  tokensSold: string;
  totalActiveShares: string;
  paymentRaisedGross: string;
  paymentRaisedNet: string;
  participantCount: string;
  expiryLiquidity: string;
  totalExpiryShares: string;
  settlementRootSet: boolean;
  graduatedAt: number;
  winnerClaimedTotal?: string;
  creatorVestAmount: string;
  creatorVestClaimed: string;
  creatorVestStart: number;
  creatorVestEnd: number;
  graduationTarget: string;
  // --- economics SNAPSHOTTED onto the pool at create_pool -------------------------------------
  // The backend now emits these (verified live 2026-09-19). ALWAYS resolve per pool via
  // core/fees.ts — a pool keeps the schedule it launched with; /config may disagree.
  tradeFeeBps?: number;
  treasuryFeeBps?: number;
  creatorFeeBps?: number;
  referralFeeBps?: number;
  buybackFeeBps?: number;
  lpBurnBps?: number;
  creatorVestBps?: number;
  /** i64 seconds — the pool's own linear creator-vest duration. */
  creatorVestSeconds?: string;
}

/** One page of GET /pools. Pagination fields absent on deployments that predate paging. */
export interface PoolPage {
  pools?: LaunchpadPool[];
  count?: number;
  total?: number;
  skipped?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
}

/** A wallet's bonding-curve position, decoded from its UserPosition PDA (NOT an SPL token). */
export interface LaunchpadPosition {
  pool: string;
  owner: string;
  /** Token base units (pool's token decimals, default 6). Program-tracked curve shares. */
  shares: string;
  /** Lifetime COOK spent on this pool (base units, 9 dec). */
  totalPaymentIn: string;
  /** Lifetime COOK received back from this pool (base units, 9 dec). */
  totalPaymentOut: string;
  /** Fair-mode refund claimed. */
  claimed: boolean;
  /** Jackpot/Survivor settlement payout claimed. */
  winnerClaimed: boolean;
  /** Real SPL token claimed after graduation. */
  graduatedTokensClaimed: boolean;
}

/** A built transaction from the launchpad API: base64 + the blockhash window to confirm against. */
export interface BuiltTx {
  transactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  /** create-pool only: the leased `momo` vanity mint. */
  mint?: string;
  /** 0 when the payload is a v0 VersionedTransaction; absent for legacy builds. */
  txVersion?: 0;
  /** INFORMATIONAL ONLY — verify against our own pinned constant, never trust the builder. */
  lookupTables?: string[];
}

export interface LaunchpadMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  extensions?: Record<string, string>;
}

/** On-chain PoolParams minus pool_id (API mints a random one) — snake_case per the IDL. */
export interface CreatePoolParams {
  name: string;
  symbol: string;
  launch_ts: number;
  duration_secs: number;
  expiry_mode: ExpiryMode;
  migratable: boolean;
  anti_snipe: boolean;
  min_buy: string;
  max_buy_per_wallet: string;
  max_payment_raise: string;
}

/** CookieScan DAS / REST shapes we consume (subset). */
export interface CookPrice {
  mint: string;
  name: string;
  symbol: string;
  priceUsd: number;
  lastUpdated: number;
}

export interface ApiStatus {
  status: string;
  cookUsd: number;
  cookMint: string;
  activeTokens: number;
  totalTokens: number;
  timestamp: number;
}
