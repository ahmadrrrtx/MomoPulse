import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Providers } from "./providers";
import { BootGate } from "@/components/BootGate";

const ui = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ui",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MomoPulse — Launchpad Terminal for Cookie Chain",
  description:
    "True positions, exact bonding-curve exit values and one-click claims for the MomoSwap Launchpad on Cookie Chain. See the curve shares no wallet shows.",
  applicationName: "MomoPulse",
  keywords: ["Cookie Chain", "MomoSwap", "launchpad", "bonding curve", "terminal", "COOK"],
  openGraph: {
    title: "MomoPulse — The Launchpad Terminal for Cookie Chain",
    description:
      "Bonding-curve positions no wallet shows, valued with program-exact math. Live on Cookie Chain.",
    siteName: "MomoPulse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MomoPulse — The Launchpad Terminal for Cookie Chain",
    description: "See the curve shares no wallet shows.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0a07",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body>
        <BootGate />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
