/**
 * Terminal UI state (client-only). Server state lives in TanStack Query; this store holds
 * ONLY what is ephemeral UI: selection, drawer, mobile tab, feed filters.
 */
import { create } from "zustand";

export type MobileTab = "feed" | "chart" | "trade" | "ramp";
export type FeedFilter = "live" | "all" | "graduated" | "settled";
export type FeedSort = "raised" | "ending" | "newest" | "holders";

interface TerminalState {
  selectedPool: string | null;
  selectPool: (pubkey: string) => void;

  drawerOpen: boolean;
  setDrawer: (open: boolean) => void;

  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;

  feedFilter: FeedFilter;
  setFeedFilter: (f: FeedFilter) => void;
  feedSort: FeedSort;
  setFeedSort: (s: FeedSort) => void;
  feedQuery: string;
  setFeedQuery: (q: string) => void;
}

export const useTerminal = create<TerminalState>((set) => ({
  selectedPool: null,
  selectPool: (pubkey) => set({ selectedPool: pubkey, mobileTab: "chart" }),

  drawerOpen: false,
  setDrawer: (drawerOpen) => set({ drawerOpen }),

  mobileTab: "feed",
  setMobileTab: (mobileTab) => set({ mobileTab }),

  feedFilter: "live",
  setFeedFilter: (feedFilter) => set({ feedFilter }),
  feedSort: "raised",
  setFeedSort: (feedSort) => set({ feedSort }),
  feedQuery: "",
  setFeedQuery: (feedQuery) => set({ feedQuery }),
}));
