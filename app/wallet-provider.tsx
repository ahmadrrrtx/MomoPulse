"use client";

/**
 * Wallet-adapter wiring (H8–10). Nightly FIRST — it is the hackathon-required wallet and the
 * one with verified Cookie Chain support; standard-wallet discovery fills in the rest.
 * autoConnect off: connecting implies network selection inside the extension, and the
 * useWalletGuard hook intercepts wrong-network connections via the genesis hash.
 */
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-nightly";
import { C } from "@/core/constants";

export default function WalletContext({ children }: { children: React.ReactNode }) {
  const endpoint = C.RPC;
  const wallets = useMemo(() => [new NightlyWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
