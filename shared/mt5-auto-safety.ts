export const DEFAULT_MINIMUM_AUTO_BALANCE = 10;
export const MINIMUM_AUTO_BALANCE = { min: 0.01, max: 1_000_000_000_000 } as const;

export type AutoBalanceUnit = "USD" | "USC" | "IDC";
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
  minimumBalance: number;
};

/**
 * Compare the raw MT5 balance with a minimum expressed in the same account
 * units as Basket SL and Daily Target. No cent conversion is applied here:
 * an account balance of 200,000,000 is compared with a minimum of 200,000,000
 * in the same way as other money settings. Currency conversion is display-only.
 */
export function checkMinimumAutoBalance(
  balance: number,
  currency: string,
  isCentAccount: boolean,
  minimumBalance = DEFAULT_MINIMUM_AUTO_BALANCE
): AutoBalanceCheck {
  if (
    !Number.isFinite(minimumBalance) ||
    minimumBalance < MINIMUM_AUTO_BALANCE.min ||
    minimumBalance > MINIMUM_AUTO_BALANCE.max
  ) {
    return {
      allowed: false,
      reason: "invalid_minimum",
      requiredBalance: null,
      unit: null,
      minimumBalance,
    };
  }
  if (!Number.isFinite(balance)) {
    return {
      allowed: false,
      reason: "invalid_balance",
      requiredBalance: null,
      unit: null,
      minimumBalance,
    };
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  const isIdrCentAccount = normalizedCurrency === "IDC";
  const currencyIsCent =
    isIdrCentAccount ||
    normalizedCurrency.includes("USC") ||
    normalizedCurrency.includes("CENT");

  if (normalizedCurrency === "USD" && isCentAccount === true) {
    return {
      allowed: false,
      reason: "unsupported_currency",
      requiredBalance: null,
      unit: null,
      minimumBalance,
    };
  }
  if (currencyIsCent) {
    return {
      allowed: balance >= minimumBalance,
      reason: balance >= minimumBalance ? null : "below_minimum",
      requiredBalance: minimumBalance,
      unit: isIdrCentAccount ? "IDC" : "USC",
      minimumBalance,
    };
  }
  if (normalizedCurrency === "USD" && isCentAccount === false) {
    return {
      allowed: balance >= minimumBalance,
      reason: balance >= minimumBalance ? null : "below_minimum",
      requiredBalance: minimumBalance,
      unit: "USD",
      minimumBalance,
    };
  }

  return {
    allowed: false,
    reason: "unsupported_currency",
    requiredBalance: null,
    unit: null,
    minimumBalance,
  };
}

export function autoBalanceRejectionMessage(
  check: AutoBalanceCheck,
  balance: number,
  currency: string,
  isCentAccount: boolean
): string {
  if (check.reason === "unsupported_currency") {
    return `AUTO requires an account denominated in USD or a supported cent currency (USC/IDC); currency "${currency}"${isCentAccount ? " conflicts with cent-account detection" : " is unsupported"}.`;
  }
  if (check.reason === "invalid_minimum") {
    return "AUTO minimum balance must be a valid positive account-unit amount.";
  }
  if (check.reason === "invalid_balance") {
    return "AUTO requires valid balance telemetry before activation.";
  }
  return `AUTO requires at least ${check.requiredBalance?.toFixed(2)} ${check.unit}; current balance is ${balance.toFixed(2)} ${check.unit}.`;
}
