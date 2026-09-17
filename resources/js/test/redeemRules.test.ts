import { describe, it, expect } from "vitest";
import {
  sumTodayRedeemTotal,
  validateRedeemSubmission,
  applyRedeemDecision,
  type RedeemTxn,
} from "@/lib/redeemRules";

const NOW = new Date("2026-04-28T12:00:00Z");
const todayAt = (h: number) => new Date(`2026-04-28T${String(h).padStart(2, "0")}:00:00Z`);
const yesterday = new Date("2026-04-27T23:00:00Z");

describe("sumTodayRedeemTotal", () => {
  it("includes pending and completed today, excludes rejected and other days", () => {
    const txns: RedeemTxn[] = [
      { amount: 50, status: "pending", created_at: todayAt(9) },
      { amount: 75, status: "completed", created_at: todayAt(10) },
      { amount: 200, status: "rejected", created_at: todayAt(11) },
      { amount: 999, status: "completed", created_at: yesterday },
    ];
    expect(sumTodayRedeemTotal(txns, NOW)).toBe(125);
  });

  it("returns 0 when no qualifying transactions", () => {
    expect(sumTodayRedeemTotal([], NOW)).toBe(0);
    expect(
      sumTodayRedeemTotal(
        [{ amount: 100, status: "rejected", created_at: todayAt(8) }],
        NOW
      )
    ).toBe(0);
  });
});

describe("validateRedeemSubmission - minimum per request", () => {
  it("blocks submissions below the minimum", () => {
    const r = validateRedeemSubmission({
      amount: 20,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [],
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Minimum redeem amount is \$40/);
  });

  it("allows submissions exactly at the minimum", () => {
    const r = validateRedeemSubmission({
      amount: 40,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [],
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateRedeemSubmission - daily total cap", () => {
  it("allows when today total + new amount stays within max", () => {
    const r = validateRedeemSubmission({
      amount: 100,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 100, status: "completed", created_at: todayAt(9) },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("allows reaching the cap exactly", () => {
    const r = validateRedeemSubmission({
      amount: 100,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 100, status: "pending", created_at: todayAt(8) },
        { amount: 100, status: "completed", created_at: todayAt(9) },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("blocks when new amount would exceed the daily cap", () => {
    const r = validateRedeemSubmission({
      amount: 150,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 100, status: "pending", created_at: todayAt(8) },
        { amount: 100, status: "completed", created_at: todayAt(9) },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(
      "Daily redeem limit exceeded. Your maximum redeem limit is $300.00 per day."
    );
  });

  it("counts pending requests toward the daily cap", () => {
    const r = validateRedeemSubmission({
      amount: 50,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 280, status: "pending", created_at: todayAt(7) },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it("does not count rejected requests toward the daily cap", () => {
    const r = validateRedeemSubmission({
      amount: 100,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 280, status: "rejected", created_at: todayAt(7) },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("does not count yesterday's completed redeems", () => {
    const r = validateRedeemSubmission({
      amount: 200,
      redeemMin: 40,
      redeemMax: 300,
      todaysTxns: [
        { amount: 250, status: "completed", created_at: yesterday },
      ],
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });
});

describe("applyRedeemDecision - balance behavior", () => {
  it("approval credits redeem amount to balance", () => {
    const newBalance = applyRedeemDecision({
      currentBalance: 100,
      amount: 75,
      decision: "approved",
    });
    expect(newBalance).toBe(175);
  });

  it("rejection leaves balance unchanged (new behavior, no reservation)", () => {
    const newBalance = applyRedeemDecision({
      currentBalance: 100,
      amount: 75,
      decision: "rejected",
    });
    expect(newBalance).toBe(100);
  });

  it("legacy reserved redeem: approval refunds reservation then credits", () => {
    // Old flow had deducted on submit; on approval we both undo the deduct AND credit.
    const newBalance = applyRedeemDecision({
      currentBalance: 25, // 100 - 75 reserved
      amount: 75,
      decision: "approved",
      legacyReserved: true,
    });
    expect(newBalance).toBe(175); // 25 + 75 (refund) + 75 (credit)
  });

  it("legacy reserved redeem: rejection refunds the reservation", () => {
    const newBalance = applyRedeemDecision({
      currentBalance: 25, // 100 - 75 reserved
      amount: 75,
      decision: "rejected",
      legacyReserved: true,
    });
    expect(newBalance).toBe(100);
  });
});
