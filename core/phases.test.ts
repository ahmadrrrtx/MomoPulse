import { describe, it, expect } from "vitest";
import { poolPhase, assertTradeable, phaseCountdownSecs } from "./phases";
import { MomoPulseError } from "./errors";
import type { LaunchpadPool } from "./types";

const base = {
  status: "live",
  launchTs: 1_000,
  endTs: 2_000,
} as unknown as LaunchpadPool;

describe("poolPhase", () => {
  it("derives `ended` when the API still says live but end_ts passed", () => {
    expect(poolPhase(base, 1_500)).toBe("live");
    expect(poolPhase(base, 2_000)).toBe("live"); // boundary: now == endTs is still live
    expect(poolPhase(base, 2_001)).toBe("ended");
  });

  it("passes through every settled status untouched", () => {
    for (const status of ["upcoming", "graduated", "expired", "ended"] as const) {
      expect(poolPhase({ ...base, status }, 99_999)).toBe(status);
    }
  });
});

describe("assertTradeable", () => {
  it("allows a live pool and refuses everything else with a phase-specific hint", () => {
    expect(() => assertTradeable(base, "buy", 1_500)).not.toThrow();

    expect(() => assertTradeable({ ...base, status: "upcoming" }, "buy", 999)).toThrow(
      MomoPulseError,
    );
    try {
      assertTradeable({ ...base, status: "graduated" }, "buy", 3_000);
    } catch (e) {
      expect((e as MomoPulseError).hint).toMatch(/open market/);
    }
    try {
      assertTradeable(base, "buy", 2_500); // ended
    } catch (e) {
      expect((e as MomoPulseError).message).toMatch(/cannot buy: the pool is ended/);
    }
  });
});

describe("phaseCountdownSecs", () => {
  it("counts down to end for live, to launch for upcoming, null otherwise", () => {
    expect(phaseCountdownSecs(base, 1_500)).toBe(500);
    expect(phaseCountdownSecs({ ...base, status: "upcoming" }, 500)).toBe(500);
    expect(phaseCountdownSecs({ ...base, status: "graduated" }, 1_500)).toBeNull();
    expect(phaseCountdownSecs(base, 2_500)).toBeNull(); // ended
  });
});
