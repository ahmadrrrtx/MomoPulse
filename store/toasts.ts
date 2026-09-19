/**
 * Toast system (design-skill compliant): CSS transitions only (interruptible), enter 380ms
 * ease-out from translateY(100%), exit 200ms (faster than enter), timers pause when the tab
 * is hidden, stack bottom-right, actions supported (Rebuild / View / Dismiss).
 */
import { create } from "zustand";

export type ToastTone = "info" | "ok" | "warn" | "bad" | "violet";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  stage?: string; // live-updated label (tx stage machine)
  progress?: number; // 0..1 for multi-step flows (sweeper)
  action?: ToastAction;
  ttl: number; // ms; 0 = sticky
  born: number;
  closing?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "born" | "closing">) => number;
  update: (id: number, patch: Partial<Toast>) => void;
  /** (re)schedule auto-dismiss for a sticky toast once its work is done */
  expire: (id: number, ttl: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, born: Date.now(), closing: false }] }));
    if (t.ttl > 0) scheduleExpiry(id, t.ttl);
    return id;
  },
  update: (id, patch) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  expire: (id, ttl) => scheduleExpiry(id, ttl),
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, closing: true } : t)) }));
    // remove after the exit transition (200ms)
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 220);
  },
}));

/** Pause-aware expiry: checks visibility so hidden tabs don't burn toast lifetimes. */
function scheduleExpiry(id: number, ttl: number) {
  const started = Date.now();
  let elapsed = 0;
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    timer = setTimeout(() => {
      const t = useToasts.getState().toasts.find((x) => x.id === id);
      if (!t) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        tick(); // paused
        return;
      }
      elapsed += Date.now() - started;
      if (elapsed >= ttl) useToasts.getState().dismiss(id);
      else tick();
    }, Math.min(ttl - elapsed, 4_000));
  };
  tick();
}

export const toast = {
  info: (title: string, body?: string, opts?: Partial<Toast>) =>
    useToasts.getState().push({ title, body, tone: "info", ttl: 4_500, ...opts }),
  ok: (title: string, body?: string, opts?: Partial<Toast>) =>
    useToasts.getState().push({ title, body, tone: "ok", ttl: 6_000, ...opts }),
  warn: (title: string, body?: string, opts?: Partial<Toast>) =>
    useToasts.getState().push({ title, body, tone: "warn", ttl: 7_000, ...opts }),
  bad: (title: string, body?: string, opts?: Partial<Toast>) =>
    useToasts.getState().push({ title, body, tone: "bad", ttl: 9_000, ...opts }),
  sticky: (title: string, body?: string, opts?: Partial<Toast>) =>
    useToasts.getState().push({ title, body, tone: "info", ttl: 0, ...opts }),
};
