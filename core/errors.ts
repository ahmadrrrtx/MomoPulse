/**
 * Every failure in MomoPulse is a MomoPulseError: a user-facing message plus an actionable hint.
 * Never a stack trace, never a raw upstream blob. (Pattern ported from cookie-mcp, MIT.)
 */
export class MomoPulseError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "MomoPulseError";
    this.hint = hint;
  }

  toJSON() {
    return { error: this.message, hint: this.hint ?? null };
  }
}

export function isMomoPulseError(e: unknown): e is MomoPulseError {
  return e instanceof MomoPulseError;
}

/** Coerce anything thrown into a MomoPulseError with a sane fallback. */
export function asMomoPulseError(e: unknown, fallbackWhat: string): MomoPulseError {
  if (isMomoPulseError(e)) return e;
  if (e instanceof Error) return new MomoPulseError(`${fallbackWhat}: ${e.message}`);
  return new MomoPulseError(`${fallbackWhat}: ${String(e)}`);
}
