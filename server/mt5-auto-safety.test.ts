import { describe, expect, it } from "vitest";
import {
  checkMinimumAutoBalance,
  DEFAULT_MINIMUM_AUTO_BALANCE_USD,
} from "../shared/mt5-auto-safety";

describe("minimum AUTO balance", () => {
  it("defaults to USD 10", () => {
    expect(DEFAULT_MINIMUM_AUTO_BALANCE_USD).toBe(10);
    expect(checkMinimumAutoBalance(9.99, "USD", false).allowed).toBe(false);
    expect(checkMinimumAutoBalance(10, "USD", false).allowed).toBe(true);
    expect(checkMinimumAutoBalance(10.01, "USD", false).allowed).toBe(true);
  });

  it("uses 100 USC per USD for cent accounts", () => {
    expect(checkMinimumAutoBalance(999, "USC", true).allowed).toBe(false);
    expect(checkMinimumAutoBalance(1000, "USC", true).allowed).toBe(true);
    expect(checkMinimumAutoBalance(1001, "USC", true).allowed).toBe(true);
  });

  it("applies a configured USD-equivalent minimum to both account types", () => {
    expect(checkMinimumAutoBalance(24.99, "USD", false, 25).allowed).toBe(false);
    expect(checkMinimumAutoBalance(25, "USD", false, 25).allowed).toBe(true);
    expect(checkMinimumAutoBalance(2499, "USC", true, 25).allowed).toBe(false);
    expect(checkMinimumAutoBalance(2500, "USC", true, 25).allowed).toBe(true);
  });

  it("fails closed for unsupported or contradictory account currency metadata", () => {
    expect(checkMinimumAutoBalance(1000, "EUR", false).reason).toBe(
      "unsupported_currency"
    );
    expect(checkMinimumAutoBalance(10, "USD", true).allowed).toBe(false);
    expect(checkMinimumAutoBalance(Number.NaN, "USD", false).reason).toBe(
      "invalid_balance"
    );
  });
});
