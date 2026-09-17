// Pure helpers that mirror server-side redeem business rules.
// Kept dependency-free so they can be unit-tested in isolation.

export type RedeemTxnStatus = "pending" | "completed" | "rejected";

export interface RedeemTxn {
  amount: number;
  status: RedeemTxnStatus;
  created_at: string | Date;
}

export interface RedeemValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Sums today's redeem amounts that count toward the daily cap.
 * Only `pending` and `completed` redeems count. `rejected` ones do not.
 */
export function sumTodayRedeemTotal(
  txns: RedeemTxn[],
  now: Date = new Date()
): number {
  // UTC, not local time — the server enforces this same daily cap with Laravel's now()-
  // >startOfDay() under APP_TIMEZONE=UTC (see UserRedeemApiController). setHours() operates in
  // the browser's LOCAL timezone, so for any user ahead of UTC (e.g. UTC+6) a redeem from late
  // yesterday-UTC-but-still-today-locally, or from early today-UTC-but-still-yesterday-locally,
  // would land on the wrong side of this boundary and disagree with what the server actually
  // enforces — exactly the mismatch a live user in that kind of timezone would hit.
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  return txns.reduce((sum, t) => {
    if (t.status !== "pending" && t.status !== "completed") return sum;
    const created = new Date(t.created_at);
    if (created >= startOfDay && created < endOfDay) {
      return sum + Number(t.amount || 0);
    }
    return sum;
  }, 0);
}

/**
 * Validates a redeem submission against:
 *  - minimum per request
 *  - daily total cap (pending + completed today + new amount <= max)
 */
export function validateRedeemSubmission(params: {
  amount: number;
  redeemMin: number;
  redeemMax: number;
  todaysTxns: RedeemTxn[];
  now?: Date;
}): RedeemValidationResult {
  const { amount, redeemMin, redeemMax, todaysTxns, now } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Amount must be greater than 0" };
  }
  if (amount < redeemMin) {
    return {
      ok: false,
      reason: `Minimum redeem amount is $${redeemMin.toFixed(2)}`,
    };
  }
  const todayTotal = sumTodayRedeemTotal(todaysTxns, now);
  if (todayTotal + amount > redeemMax) {
    return {
      ok: false,
      reason: `Daily redeem limit exceeded. Your maximum redeem limit is $${redeemMax.toFixed(2)} per day.`,
    };
  }
  return { ok: true };
}

/**
 * Mirrors the server `process_transaction` balance logic for redeem only.
 *  - approval: ADD amount to balance (winnings credited)
 *  - rejection: balance unchanged (since redeem no longer reserves on submit)
 *  - legacy reserved redeems: handled the same as the SQL fallback
 */
export function applyRedeemDecision(params: {
  currentBalance: number;
  amount: number;
  decision: "approved" | "rejected";
  legacyReserved?: boolean;
}): number {
  const { currentBalance, amount, decision, legacyReserved = false } = params;

  if (decision === "approved") {
    // New behavior: credit the redeem amount.
    // Legacy safety: if balance was previously deducted on submit, refund first then credit.
    return legacyReserved
      ? currentBalance + amount + amount
      : currentBalance + amount;
  }
  // rejected
  return legacyReserved ? currentBalance + amount : currentBalance;
}
