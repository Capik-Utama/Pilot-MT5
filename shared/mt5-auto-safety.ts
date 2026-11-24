export const DEFAULT_MINIMUM_AUTO_BALANCE_USD = 10;
export const MINIMUM_AUTO_BALANCE_USD = { min: 0.01, max: 1_000_000_000 } as const;

export type AutoBalanceUnit = "USD" | "USC";
export type AutoBalanceRejectionReason =
  | "below_minimum"
  | "unsupported_currency"
  | "invalid_balance"
  | "invalid_minimum";

export type AutoBalanceCheck = {
  allowed: boolean;
  reason: AutoBalanceRejectionReason | null;
  requiredBalance: number | null;
  unit: AutoBalanceUnit | null;
  minimumUsd: number;
};

/**
 * Compare the raw MT5 deposit balance with a USD-equivalent AUTO minimum.
 * USD accounts use the configured amount directly; USC/cent accounts use 100x.
 * Unknown currencies and contradictory cent metadata fail closed because this
 * project does not have a reliable FX conversion for them.
 */
export function checkMinimumAutoBalance(
  balance: number,
  currency: string,
  isCentAccount: boolean,
  minimumUsd = DEFAULT_MINIMUM_AUTO_BALANCE_USD
): AutoBalanceCheck {
  if (
    !Number.isFinite(minimumUsd) ||
    minimumUsd < MINIMUM_AUTO_BALANCE_USD.min ||
    minimumUsd > MINIMUM_AUTO_BALANCE_USD.max
  ) {
    return {
      allowed: false,
      reason: "invalid_minimum",
      requiredBalance: null,
      unit: null,
      minimumUsd,
    };
  }
  if (!Number.isFinite(balance)) {
    return {
      allowed: false,
      reason: "invalid_balance",
      requiredBalance: null,
      unit: null,
      minimumUsd,
    };
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  const currencyIsCent =
    normalizedCurrency.includes("USC") || normalizedCurrency.includes("CENT");
  const isUsdCentAccount =
    normalizedCurrency === "USD" && isCentAccount === true;

  if (currencyIsCent || isUsdCentAccount) {
    const requiredBalance = minimumUsd * 100;
    return {
      allowed: balance >= requiredBalance,
      reason: balance >= requiredBalance ? null : "below_minimum",
      requiredBalance,
      unit: "USC",
      minimumUsd,
    };
  }
  if (normalizedCurrency === "USD" && isCentAccount === false) {
    return {
      allowed: balance >= minimumUsd,
      reason: balance >= minimumUsd ? null : "below_minimum",
      requiredBalance: minimumUsd,
      unit: "USD",
      minimumUsd,
    };
  }

  return {
    allowed: false,
    reason: "unsupported_currency",
    requiredBalance: null,
    unit: null,
    minimumUsd,
  };
}

export function autoBalanceRejectionMessage(
  check: AutoBalanceCheck,
  balance: number,
  currency: string,
  isCentAccount: boolean
): string {
  if (check.reason === "unsupported_currency") {
    return `AUTO requires an account denominated in USD or USC; currency "${currency}"${isCentAccount ? " conflicts with cent-account detection" : " is unsupported"}.`;
  }
  if (check.reason === "invalid_minimum") {
    return "AUTO minimum balance must be a valid positive USD amount.";
  }
  if (check.reason === "invalid_balance") {
    return "AUTO requires valid balance telemetry before activation.";
  }
  return `AUTO requires at least ${check.requiredBalance?.toFixed(2)} ${check.unit} (USD ${check.minimumUsd.toFixed(2)} equivalent); current balance is ${balance.toFixed(2)} ${check.unit}.`;
}
