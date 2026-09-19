"use client";

/** Wallet-backed transaction context: signer adapter, connection, Stage-4 reconcile. */
import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "@solana/web3.js";

export interface TxSigner {
  publicKey: import("@solana/web3.js").PublicKey;
  signTransaction: <T extends Transaction>(t: T) => Promise<T>;
}

export function useTx() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  const signer = useMemo<TxSigner | null>(
    () => (publicKey && signTransaction ? { publicKey, signTransaction } : null),
    [publicKey, signTransaction],
  );

  /** Stage-4 reconcile: invalidate everything a confirmed tx could have moved. */
  const reconcile = useMemo(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: ["scan"] });
      void queryClient.invalidateQueries({ queryKey: ["pools", "all"] });
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["trades"] });
    },
    [queryClient],
  );

  return { connected, publicKey, signer, connection, reconcile };
}

/** Disclosed referral: 20% of the 1% trade fee goes to the app wallet (config-driven). */
export const COOKIE_REFERRER: string | undefined = process.env.NEXT_PUBLIC_COOKIE_REFERRER || undefined;
