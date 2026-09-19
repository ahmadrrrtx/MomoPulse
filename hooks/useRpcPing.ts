"use client";

/**
 * Header RPC ping (H8–10): measures real getSlot round-trip latency against the Cookie Chain
 * RPC on a scheduler interval (30s, jittered, visibility-gated, backoff on failure).
 */
import { useEffect, useState } from "react";
import { scheduler } from "@/clients/scheduler";
import { rpcPing } from "@/clients/rpc";

export interface RpcPingState {
  ms: number | null;
  alive: boolean;
  lastOkAt: number | null;
}

export function useRpcPing(intervalMs = 30_000): RpcPingState {
  const [state, setState] = useState<RpcPingState>({ ms: null, alive: false, lastOkAt: null });

  useEffect(() => {
    return scheduler().register({
      key: "rpc-ping",
      intervalMs,
      fn: async () => {
        const ms = await rpcPing();
        setState({ ms, alive: ms !== null, lastOkAt: ms !== null ? Date.now() : null });
      },
    });
  }, [intervalMs]);

  return state;
}
