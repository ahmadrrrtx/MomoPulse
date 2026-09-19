import { describe, it, expect, vi } from "vitest";
import { nextPoolOffset, fetchPools } from "./momoswap";
import type { PoolPage } from "@/core/types";

describe("nextPoolOffset", () => {
  it("returns null when hasMore is not exactly true", () => {
    expect(nextPoolOffset({}, 0)).toBeNull();
    expect(nextPoolOffset({ hasMore: false, nextOffset: 50 }, 0)).toBeNull();
  });

  it("follows a strictly advancing cursor", () => {
    expect(nextPoolOffset({ hasMore: true, nextOffset: 100 }, 0)).toBe(100);
  });

  it("refuses a stuck or backwards cursor (infinite-loop guard)", () => {
    expect(nextPoolOffset({ hasMore: true, nextOffset: 0 }, 0)).toBeNull();
    expect(nextPoolOffset({ hasMore: true, nextOffset: 50 }, 100)).toBeNull();
    expect(nextPoolOffset({ hasMore: true, nextOffset: 1.5 }, 0)).toBeNull();
    expect(nextPoolOffset({ hasMore: true }, 0)).toBeNull();
  });
});

describe("fetchPools pagination walk", () => {
  it("collects every page and stops when the cursor stops advancing", async () => {
    const pages: PoolPage[] = [
      { pools: [{ pubkey: "a" }, { pubkey: "b" }] as never[], hasMore: true, nextOffset: 2 },
      { pools: [{ pubkey: "c" }] as never[], hasMore: true, nextOffset: 2 }, // stuck cursor!
    ];
    let call = 0;
    const fakeFetch = vi.fn(async () => pages[Math.min(call++, pages.length - 1)]);
    const out = await fetchPools("live", fakeFetch as never);
    expect(out.map((p) => p.pubkey)).toEqual(["a", "b", "c"]);
    expect(call).toBe(2); // stopped on the stuck cursor, did not loop
  });

  it("single page with no pagination fields returns everything once", async () => {
    const fakeFetch = vi.fn(async () => ({ pools: [{ pubkey: "x" }] as never[], count: 1 }));
    const out = await fetchPools("all", fakeFetch as never);
    expect(out).toHaveLength(1);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("unwraps a logical failure envelope", async () => {
    const fakeFetch = vi.fn(async () => ({ success: false, error: "boom" }));
    await expect(fetchPools("live", fakeFetch as never)).rejects.toThrow(/boom/);
  });
});
