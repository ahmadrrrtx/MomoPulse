import { describe, it, expect } from "vitest";
import { rawToUi, uiToRaw, fmtCompact, fmtCountdown, bpsToPct, shortAddr } from "./format";

describe("rawToUi / uiToRaw", () => {
  it("round-trips exact amounts at 9 and 6 decimals", () => {
    expect(rawToUi("1000000000", 9)).toBe("1");
    expect(rawToUi("1500000000", 9)).toBe("1.5");
    expect(rawToUi("3017341406", 6)).toBe("3017.341406"); // golden position shares
    expect(uiToRaw("1", 9)).toBe(1_000_000_000n);
    expect(uiToRaw("0.49252951", 9)).toBe(492_529_510n); // golden totalPaymentOut
    expect(uiToRaw("3017.341406", 6)).toBe(3_017_341_406n);
  });

  it("handles zero, negatives-in-raw and sub-unit values", () => {
    expect(rawToUi("0", 9)).toBe("0");
    expect(rawToUi("1", 9)).toBe("0.000000001");
    expect(rawToUi(-1_500_000_000n, 9)).toBe("-1.5");
  });

  it("accepts numbers via toFixed normalization (no scientific notation leaks)", () => {
    expect(uiToRaw(0.000000001, 9)).toBe(1n);
    expect(uiToRaw(1.5, 9)).toBe(1_500_000_000n);
  });

  it("rejects garbage and over-precise input", () => {
    expect(() => uiToRaw("abc", 9)).toThrow(/invalid amount/);
    expect(() => uiToRaw("1.0000000001", 9)).toThrow(/more than 9 decimal places/);
    expect(() => uiToRaw("", 9)).toThrow(/invalid amount/);
  });
});

describe("display helpers", () => {
  it("fmtCompact", () => {
    expect(fmtCompact(1_234_567)).toBe("1.23M");
    expect(fmtCompact(845_000)).toBe("845.0K");
    expect(fmtCompact(0.355)).toBe("0.355");
    expect(fmtCompact(0)).toBe("0");
  });

  it("fmtCountdown", () => {
    expect(fmtCountdown(7 * 86400)).toBe("7d 0h");
    expect(fmtCountdown(3600 + 720)).toBe("1h 12m");
    expect(fmtCountdown(65)).toBe("1m 05s");
    expect(fmtCountdown(-5)).toBe("0s");
  });

  it("bpsToPct + shortAddr", () => {
    expect(bpsToPct(100)).toBe("1%");
    expect(bpsToPct(75)).toBe("0.75%");
    expect(shortAddr("momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw")).toBe("momoL…Doqcw");
  });
});
