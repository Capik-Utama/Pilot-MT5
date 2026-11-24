import { describe, expect, it } from "vitest";
import {
  checkMinimumAutoBalance,
  DEFAULT_MINIMUM_AUTO_BALANCE,
} from "../shared/mt5-auto-safety";

describe("minimum AUTO balance", () => {
  it("defaults to 10 account units", () => {
    expect(DEFAULT_MINIMUM_AUTO_BALANCE).toBe(10);
    expect(checkMinimumAutoBalance(9.99, "USD", false).allowed).toBe(false);
    expect(checkMinimumAutoBalance(10, "USD", false).allowed).toBe(true);
    expect(checkMinimumAutoBalance(10.01, "USD", false).allowed).toBe(true);
  });

  it("compares USC values directly without multiplying by 100", () => {
    expect(checkMinimumAutoBalance(9.99, "USC", true).allowed).toBe(false);
    expect(checkMinimumAutoBalance(10, "USC", true)).toMatchObject({
      allowed: true,
      unit: "USC",
      requiredBalance: 10,
    });
  });

  it("compares IDC values directly without multiplying by 100", () => {
    expect(checkMinimumAutoBalance(199_999_999, "IDC", true, 200_000_000).allowed).toBe(false);
    expect(checkMinimumAutoBalance(200_000_000, "IDC", true, 200_000_000)).toMatchObject({
      allowed: true,
      unit: "IDC",
      requiredBalance: 200_000_000,
    });
  });

  it("applies the configured raw account-unit minimum to every supported account", () => {
    expect(checkMinimumAutoBalance(24.99, "USD", false, 25).allowed).toBe(false);
    expect(checkMinimumAutoBalance(25, "USD", false, 25).allowed).toBe(true);
    expect(checkMinimumAutoBalance(24.99, "USC", true, 25).allowed).toBe(false);
    expect(checkMinimumAutoBalance(25, "USC", true, 25).allowed).toBe(true);
    expect(checkMinimumAutoBalance(199_999_999, "IDC", false, 200_000_000).allowed).toBe(false);
    expect(checkMinimumAutoBalance(200_000_000, "IDC", false, 200_000_000).allowed).toBe(true);
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
