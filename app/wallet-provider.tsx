"use client";

/**
 * Wallet-adapter wiring (H8–10 + Phase 2 expansion). Order matters: Nightly FIRST — it is the
 * hackathon-required wallet and the one with verified Cookie Chain support. Phantom, Solflare
 * and Backpack follow; wallet-standard discovery (injected extensions) fills in the rest.
 * autoConnect stays off: connecting implies a network choice inside the extension, and the
 * useWalletGuard genesis check intercepts wrong-network sessions before any action.
 */
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-nightly";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { C } from "@/core/constants";

export default function WalletContext({ children }: { children: React.ReactNode }) {
  const endpoint = C.RPC;
  const wallets = useMemo(
    () => [
      new NightlyWalletAdapter(),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
