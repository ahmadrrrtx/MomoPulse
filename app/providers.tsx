"use client";

/**
 * Client providers: Buffer polyfill (web3.js in the browser), TanStack Query, wallet-adapter.
 * The wallet provider is code-split (dynamic, ssr:false) — the adapter touches window/document.
 */
import { Buffer } from "buffer";
import dynamic from "next/dynamic";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

const WalletContext = dynamic(() => import("./wallet-provider"), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletContext>{children}</WalletContext>
    </QueryClientProvider>
  );
}
