/**
 * Central polling scheduler (Artifact 2 §2.7).
 * One registry of interval tasks with: visibility gating (pause when the tab is hidden),
 * ±20% jitter (avoid fleet-wide sync), single in-flight dedupe per task, exponential backoff
 * to a 30s cap after 3 consecutive failures. Framework-agnostic — usable from React hooks
 * (usePoll) or plain scripts.
 */

export interface PollTask {
  key: string;
  intervalMs: number;
  fn: () => Promise<void> | void;
  /** run immediately on register (default true) */
  immediate?: boolean;
}

interface TaskState extends PollTask {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  failures: number;
  paused: boolean;
}

export class PollScheduler {
  private tasks = new Map<string, TaskState>();
  private visible = true;
  private visibilityListener: (() => void) | null = null;

  constructor() {
    if (typeof document !== "undefined") {
      this.visibilityListener = () => {
        const nowVisible = document.visibilityState === "visible";
        if (nowVisible === this.visible) return;
        this.visible = nowVisible;
        for (const t of this.tasks.values()) {
          if (nowVisible) this.resume(t.key);
          else this.pause(t.key);
        }
      };
      document.addEventListener("visibilitychange", this.visibilityListener);
      this.visible = document.visibilityState === "visible";
    }
  }

  register(task: PollTask): () => void {
    this.unregister(task.key);
    const state: TaskState = { ...task, timer: null, inFlight: false, failures: 0, paused: false };
    this.tasks.set(task.key, state);
    if (task.immediate !== false) void this.run(state);
    this.schedule(state);
    return () => this.unregister(task.key);
  }

  unregister(key: string): void {
    const t = this.tasks.get(key);
    if (!t) return;
    if (t.timer) clearTimeout(t.timer);
    this.tasks.delete(key);
  }

  pause(key: string): void {
    const t = this.tasks.get(key);
    if (!t) return;
    t.paused = true;
    if (t.timer) clearTimeout(t.timer);
  }

  resume(key: string): void {
    const t = this.tasks.get(key);
    if (!t || !t.paused) return;
    t.paused = false;
    this.schedule(t);
  }

  /** Force a refresh now (post-tx reconciliation), bypassing the interval. */
  async refresh(key: string): Promise<void> {
    const t = this.tasks.get(key);
    if (t) await this.run(t);
  }

  dispose(): void {
    for (const key of [...this.tasks.keys()]) this.unregister(key);
    if (this.visibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityListener);
    }
  }

  private effectiveInterval(t: TaskState): number {
    const backoff = t.failures >= 3 ? Math.min(t.intervalMs * 2 ** (t.failures - 2), 30_000) : t.intervalMs;
    return backoff * (0.8 + Math.random() * 0.4); // ±20% jitter
  }

  private schedule(t: TaskState): void {
    if (t.paused || !this.visible) return;
    if (t.timer) clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      void this.run(t).finally(() => this.schedule(t));
    }, this.effectiveInterval(t));
  }

  private async run(t: TaskState): Promise<void> {
    if (t.inFlight) return; // single in-flight dedupe
    t.inFlight = true;
    try {
      await t.fn();
      t.failures = 0;
    } catch {
      t.failures += 1; // backoff handled in effectiveInterval
    } finally {
      t.inFlight = false;
    }
  }
}

/** App-wide singleton (browser). */
let singleton: PollScheduler | null = null;
export function scheduler(): PollScheduler {
  if (!singleton) singleton = new PollScheduler();
  return singleton;
}
