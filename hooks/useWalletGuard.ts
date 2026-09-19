"use client";

/**
 * Genesis-hash wallet guard (H8–10, judge-bar requirement).
 *
 * Cookie Chain is a *separate* L1 that looks exactly like Solana — a wallet pointed at Solana
 * mainnet will happily "connect" and every subsequent transaction will fail or, worse, silently
 * target the wrong chain. The only trustworthy discriminator is the genesis hash:
 *   Cookie Chain: 9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2
 *
 * The guard verifies the RPC we are about to transact through. Any trade/claim path in the app
 * MUST refuse to proceed while status !== "ok".
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { checkGenesis, type GenesisCheck } from "@/clients/rpc";
import { C } from "@/core/constants";

export type GuardStatus = "checking" | "ok" | "wrong-network" | "unreachable";

export interface WalletGuardState {
  status: GuardStatus;
  genesisHash: string | null;
  detail: string | null;
}

export function useWalletGuard(): WalletGuardState {
  const { publicKey, connecting } = useWallet();
  const [state, setState] = useState<WalletGuardState>({
    status: "checking",
    genesisHash: null,
    detail: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: "checking" }));
    checkGenesis()
      .then((g: GenesisCheck) => {
        if (cancelled) return;
        // checkGenesis never throws: ok=false + null hash means the RPC itself is unreachable.
        if (g.ok) {
          setState({ status: "ok", genesisHash: g.genesisHash, detail: null });
        } else if (g.genesisHash) {
          setState({
            status: "wrong-network",
            genesisHash: g.genesisHash,
            detail: `RPC genesis ${g.genesisHash} ≠ Cookie Chain (${C.GENESIS_HASH.slice(0, 8)}…) — wrong network. Switch your wallet's RPC to ${C.RPC}.`,
          });
        } else {
          setState({
            status: "unreachable",
            genesisHash: null,
            detail: `RPC unreachable at ${C.RPC} — cannot verify the genesis hash. Trades are blocked until it responds.`,
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "unreachable",
          genesisHash: null,
          detail: `RPC verification failed: ${e?.message ?? e}`,
        });
      });
    return () => {
      cancelled = true;
    };
    // Re-verify on every connect attempt / wallet switch — cheap, and this is the security gate.
  }, [publicKey, connecting]);

  return state;
}
