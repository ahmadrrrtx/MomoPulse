/**
 * Graduation radar (H33–35): phase-transition events detected client-side from the 5s feed.
 * Violet pulse on the affected card + bell badge + violet toast. Ring of last 20 events.
 */
import { create } from "zustand";

export interface RadarEvent {
  pool: string;
  symbol: string;
  from: string;
  to: string;
  ts: number;
}

interface RadarState {
  events: RadarEvent[];
  unread: number;
  lastByPool: Record<string, RadarEvent>;
  push: (e: RadarEvent) => void;
  markRead: () => void;
}

export const useRadar = create<RadarState>((set) => ({
  events: [],
  unread: 0,
  lastByPool: {},
  push: (e) =>
    set((s) => ({
      events: [e, ...s.events].slice(0, 20),
      unread: s.unread + 1,
      lastByPool: { ...s.lastByPool, [e.pool]: e },
    })),
  markRead: () => set({ unread: 0 }),
}));
