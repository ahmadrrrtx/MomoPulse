import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MomoPulse — Launchpad Terminal for Cookie Chain",
  description:
    "True positions, exact bonding-curve exit values and one-click claims for the MomoSwap Launchpad on Cookie Chain. See the curve shares no wallet shows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
