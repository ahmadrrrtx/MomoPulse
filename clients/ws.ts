/**
 * Realtime clients — WS-first with HTTP polling shadow (Artifact 2 §2.7).
 *
 * 1. CookieScan DAS `/stream`: 5-second tick, USD prices + volumes for ALL active tokens.
 * 2. RPC `logsSubscribe`: own-wallet tx activity, backed by polling (CookieBot's field report:
 *    the WS can silently drop — heartbeat supervision + resubscribe is mandatory, and the WS is
 *    NEVER the source of truth for balances).
 *
 * Browser-only (guarded); the CLI/pipeline never imports this at module top level.
 */

export type WsState = "connecting" | "open" | "closed";

export interface DasTickToken {
  mint: string;
  priceUsd: number;
  volume24h?: number;
}
export interface DasTick {
  type: "tick";
  timestamp: number;
  cookUsd: number;
  tokens: DasTickToken[];
}

export interface StreamHandle {
  close(): void;
}

/**
 * Subscribe to the DAS price stream. Reconnects with exponential backoff + jitter; calls
 * onState so the header chip can render connecting/open/closed. Heartbeat: no message within
 * 3× the 5s tick interval ⇒ considered dropped ⇒ reconnect.
 */
export function subscribeDasStream(
  onTick: (tick: DasTick) => void,
  onState?: (s: WsState) => void,
  url = "wss://api.cookiescan.io/stream",
): StreamHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1_000;
  let heartbeat: ReturnType<typeof setTimeout> | null = null;

  const armHeartbeat = () => {
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = setTimeout(() => {
      // 15s of silence on a 5s-cadence stream = dropped socket
      ws?.close();
    }, 15_000);
  };

  const connect = () => {
    if (closed) return;
    onState?.("connecting");
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoff = 1_000;
      onState?.("open");
      armHeartbeat();
    };
    ws.onmessage = (ev) => {
      armHeartbeat();
      try {
        const data = JSON.parse(String(ev.data));
        if (data?.type === "tick") onTick(data as DasTick);
      } catch {
        /* malformed tick — ignore, keep the socket */
      }
    };
    ws.onclose = () => {
      onState?.("closed");
      scheduleReconnect();
    };
    ws.onerror = () => ws?.close();
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const jitter = backoff * (0.8 + Math.random() * 0.4);
    setTimeout(connect, jitter);
    backoff = Math.min(backoff * 2, 30_000);
  };

  connect();
  return {
    close() {
      closed = true;
      if (heartbeat) clearTimeout(heartbeat);
      ws?.close();
      onState?.("closed");
    },
  };
}

export interface LogsHandle {
  close(): void;
}

/**
 * Subscribe to wallet mentions via logsSubscribe over the Cookie Chain WSS.
 * The socket speaks JSON-RPC 2.0 directly (no dependency needed):
 *   → {"method":"logsSubscribe","params":[{"mentions":["<pubkey>"]},"confirmed"]}
 *   ← {"method":"logsNotification","params":{"result":{"signature":…}}}
 * Caller reacts by invalidating position/pool queries (polling shadow covers any drop).
 */
export function subscribeWalletLogs(
  wallet: string,
  onSignature: (sig: string) => void,
  onState?: (s: WsState) => void,
  url = "wss://wss.cookiescan.io",
): LogsHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1_000;
  let subId: number | null = null;

  const connect = () => {
    if (closed) return;
    onState?.("connecting");
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoff = 1_000;
      onState?.("open");
      ws?.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "logsSubscribe",
          params: [{ mentions: [wallet] }, "confirmed"],
        }),
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.id === 1 && typeof msg.result === "number") subId = msg.result;
        if (msg.method === "logsNotification") {
          const sig = msg.params?.result?.value?.signature;
          if (typeof sig === "string") onSignature(sig);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      onState?.("closed");
      subId = null;
      scheduleReconnect();
    };
    ws.onerror = () => ws?.close();
  };

  const scheduleReconnect = () => {
    if (closed) return;
    setTimeout(connect, backoff * (0.8 + Math.random() * 0.4));
    backoff = Math.min(backoff * 2, 30_000);
  };

  connect();
  return {
    close() {
      closed = true;
      if (ws && subId != null) {
        try {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "logsUnsubscribe", params: [subId] }));
        } catch {
          /* best effort */
        }
      }
      ws?.close();
      onState?.("closed");
    },
  };
}
