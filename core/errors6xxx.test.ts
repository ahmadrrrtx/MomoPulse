import { describe, it, expect } from "vitest";
import {
  LAUNCHPAD_ERRORS,
  launchpadErrorMessage,
  programErrorCode,
  anchorLogError,
  anchorLogSummary,
  diagnosticLogTail,
  launchpadSimError,
} from "./errors6xxx";

describe("LAUNCHPAD_ERRORS table", () => {
  it("maps the codes the audit trail pins (source-verified, NOT the stale IDL)", () => {
    expect(LAUNCHPAD_ERRORS[6046]).toMatch(/slippage/i);
    expect(LAUNCHPAD_ERRORS[6019]).toMatch(/no sale tokens left/i); // IDL wrongly puts slippage here
    expect(LAUNCHPAD_ERRORS[6048]).toMatch(/has to graduate/);
    expect(LAUNCHPAD_ERRORS[6040]).toMatch(/anti-snipe/i);
    expect(LAUNCHPAD_ERRORS[6035]).toMatch(/self-referral/i);
    expect(launchpadErrorMessage(6021)).toMatch(/more shares than you hold/);
    expect(launchpadErrorMessage(9999)).toBeUndefined();
  });
});

describe("programErrorCode", () => {
  it("reads the hex form from program logs", () => {
    expect(programErrorCode("Program log: custom program error: 0x179e")).toBe(6046);
    expect(programErrorCode("failed: custom program error: 0x1770")).toBe(6000);
  });

  it('reads the JSON {"Custom": n} form (decimal)', () => {
    expect(programErrorCode('{"err":{"InstructionError":[0,{"Custom":6016}]}}')).toBe(6016);
  });

  it("is null when there is no custom code", () => {
    expect(programErrorCode("Program log: some other failure")).toBeNull();
  });
});

describe("anchorLogError", () => {
  const logs = [
    "Program momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw invoke [1]",
    "Program log: Instruction: Buy",
    "Program log: AnchorError caused by account: pool. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.",
    "Program log: Left:",
    "Program log: 3Dq4tB9Y6rQe8Yt7u2i1oPaSdFgHjKlZxCvBnMqWeRt",
    "Program log: Right:",
    "Program log: 7tLQV8D6uUyG9r1nEtQuBMqDb5Nfi9TXxsdVZUtsct2M",
    "Program momoL7wu… failed: custom program error: 0x7d6",
  ];

  it("parses code, number, account, message and compared values", () => {
    const e = anchorLogError(logs);
    expect(e).toMatchObject({
      code: "ConstraintSeeds",
      number: 2006,
      account: "pool",
      message: "A seeds constraint was violated",
      left: "3Dq4tB9Y6rQe8Yt7u2i1oPaSdFgHjKlZxCvBnMqWeRt",
      right: "7tLQV8D6uUyG9r1nEtQuBMqDb5Nfi9TXxsdVZUtsct2M",
    });
    expect(anchorLogSummary(e!)).toContain("ConstraintSeeds (2006)");
    expect(anchorLogSummary(e!)).toContain("passed 3Dq4");
  });

  it("handles the account-less form and returns null without an AnchorError line", () => {
    const e = anchorLogError([
      "Program log: AnchorError occurred. Error Code: RequireKeysEq. Error Number: 2008. Error Message: Keys not equal.",
    ]);
    expect(e).toMatchObject({ code: "RequireKeysEq", number: 2008, account: undefined });
    expect(anchorLogError(["Program log: hello"])).toBeNull();
    expect(anchorLogError(null)).toBeNull();
  });
});

describe("diagnosticLogTail", () => {
  it("starts the window at the explanatory line, not the raw tail", () => {
    const logs = [
      "Program log: Instruction: Sell",
      "Program log: AnchorError occurred. Error Code: SomeErr. Error Number: 6020. Error Message: Msg.",
      "Program log: Right:",
      "Program log: 9rj5GEEypdCbJ1W9is4LHeQxg86h9vxSny6pmsxmakni",
      "Program failed: custom program error: 0x1784",
    ];
    const tail = diagnosticLogTail(logs)!;
    expect(tail.startsWith("AnchorError occurred")).toBe(true); // not the pubkey noise
    expect(tail).toContain("0x1784");
  });

  it("falls back to the last 3 lines when nothing explains itself", () => {
    expect(diagnosticLogTail(["a", "b", "c", "d"])).toBe("b | c | d");
    expect(diagnosticLogTail(null)).toBeUndefined();
  });
});

describe("launchpadSimError", () => {
  it("translates a known custom code", () => {
    const e = launchpadSimError("buy", { Custom: 6046 }, null);
    expect(e.message).toContain("slippage");
    expect(e.hint).toBe("nothing was sent");
  });

  it("prefers a caller hint override", () => {
    const e = launchpadSimError("buy", { Custom: 6016 }, null, {
      6016: { message: "anti-snipe cap hit", hint: "wait for the window" },
    });
    expect(e.message).toBe("anti-snipe cap hit");
  });

  it("falls through to Anchor framework errors, blockhash and insufficient-funds patterns", () => {
    expect(
      launchpadSimError("buy", {}, [
        "Program log: AnchorError occurred. Error Code: ConstraintOwner. Error Number: 2004. Error Message: Owner mismatch.",
      ]).message,
    ).toContain("ConstraintOwner");
    expect(launchpadSimError("buy", "BlockhashNotFound", null).message).toContain("blockhash");
    expect(launchpadSimError("buy", "insufficient funds for rent", null).hint).toMatch(/COOK balance/);
  });

  it("ends at a generic re-read hint", () => {
    const e = launchpadSimError("sell", "weird", ["Program log: kaboom"]);
    expect(e.hint).toMatch(/re-read it and retry/);
  });
});
