/**
 * Phone normalization + payload-skipping unit tests.
 *
 * Covers:
 *   - getPhoneVariants normalizes raw input into prioritized variants
 *     (digits-only first, then +digits, then raw, then no-plus).
 *   - The end-to-end open-chat flow sends a digits-only variant as the
 *     primary value for every phone-shaped key.
 *   - Empty / invalid (non-digit) phone values produce ZERO phone keys
 *     in the payload sent to PancakeChatPlugin.setInitialFormData.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  __test__,
  openChatWithProfile,
  invalidateChatProfileCache,
} from "@/lib/openChatWithProfile";

const { getPhoneVariants } = __test__;

// All phone keys buildPhoneFormData emits — used to assert "no phone keys"
const PHONE_KEYS = [
  "phone",
  "phone_number",
  "phoneNumber",
  "phonenumber",
  "tel",
  "mobile",
  "telephone",
  "number",
  "contact",
  "contact_phone",
  "contactPhone",
  "contact_number",
  "contactNumber",
  "customer_phone",
  "customerPhone",
  "sdt",
  "so_dien_thoai",
  "phone number",
  "Phone Number",
  "Số điện thoại",
  "so dien thoai",
];

describe("getPhoneVariants — normalization", () => {
  it("returns digits-only variant FIRST for an international format", () => {
    const variants = getPhoneVariants("+1 (555) 123-4567");
    expect(variants[0]).toBe("15551234567");
  });

  it("includes +digits, raw, and no-plus variants in order", () => {
    const variants = getPhoneVariants("+15551234567");
    expect(variants).toEqual(["15551234567", "+15551234567"]);
  });

  it("strips spaces, parens, and dashes from the digits variant", () => {
    const variants = getPhoneVariants("(555) 123-4567");
    expect(variants[0]).toBe("5551234567");
  });

  it("dedupes raw and withoutPlus when they're identical to digits", () => {
    const variants = getPhoneVariants("5551234567");
    // digits-only first, then +digits (raw and withoutPlus are duplicates and dropped)
    expect(variants).toEqual(["5551234567", "+5551234567"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(getPhoneVariants("")).toEqual([]);
  });

  it("returns an empty array for a whitespace-only string", () => {
    expect(getPhoneVariants("   ")).toEqual([]);
  });

  it("returns an empty array for a non-digit-only value", () => {
    // No digits → no usable phone variants
    expect(getPhoneVariants("not-a-phone")).toEqual([]);
  });

  it("preserves the leading + when the raw value already has one", () => {
    const variants = getPhoneVariants("+44 7700 900123");
    expect(variants).toContain("447700900123");
    expect(variants).toContain("+447700900123");
  });
});

// --- E2E payload assertions for normalization + empty/invalid handling ---

let setInitialFormData: ReturnType<typeof vi.fn>;
let openChatBox: ReturnType<typeof vi.fn>;

function installPancakeStub() {
  setInitialFormData = vi.fn();
  openChatBox = vi.fn();
  (window as any).PancakeChatPlugin = { setInitialFormData, openChatBox };
}

function mergedPayload(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const call of setInitialFormData.mock.calls) {
    Object.assign(merged, call[0]);
  }
  return merged;
}

describe("openChatWithProfile — phone payload normalization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installPancakeStub();
    invalidateChatProfileCache();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).PancakeChatPlugin;
  });

  it("sends the digits-only variant as the value for every phone key", async () => {
    await openChatWithProfile({
      username: "alice",
      email: "x@x.com",
      phone: "+1 (555) 123-4567",
    });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    // Every phone key that's present should hold the digits-only variant.
    // (Some keys appear in both the buildPhoneFormData payload and the
    // single-key follow-up payloads; both should agree on the digits form.)
    expect(payload.phone).toBe("15551234567");
    expect(payload.phone_number).toBe("15551234567");
    expect(payload.phoneNumber).toBe("15551234567");
    expect(payload.tel).toBe("15551234567");
    expect(payload.sdt).toBe("15551234567");
  });

  it("sends NO phone keys when phone is empty", async () => {
    await openChatWithProfile({ username: "bob", email: "x@x.com", phone: "" });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    for (const key of PHONE_KEYS) {
      expect(payload[key]).toBeUndefined();
    }
    // Identity keys still present
    expect(payload.name).toBe("bob");
  });

  it("sends NO phone keys when phone is null on the profile", async () => {
    await openChatWithProfile({ username: "carol", email: "x@x.com", phone: null });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    for (const key of PHONE_KEYS) {
      expect(payload[key]).toBeUndefined();
    }
  });

  it("sends NO phone keys when phone has no digits (invalid value)", async () => {
    await openChatWithProfile({ username: "dan", email: "x@x.com", phone: "not-a-phone" });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    for (const key of PHONE_KEYS) {
      expect(payload[key]).toBeUndefined();
    }
  });

  it("sends NO phone keys when phone is whitespace-only", async () => {
    await openChatWithProfile({ username: "eve", email: "x@x.com", phone: "   " });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    for (const key of PHONE_KEYS) {
      expect(payload[key]).toBeUndefined();
    }
  });
});
