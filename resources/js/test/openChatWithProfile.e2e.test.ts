/**
 * End-to-end-ish integration test for the Pancake chat auto-fill flow.
 *
 * We can't drive the real Pancake bubble (it lives in a cross-origin iframe),
 * so we simulate the full public contract:
 *   1. The caller (an already-authenticated React component) passes its
 *      `useAuth().user` profile straight into `openChatWithProfile(profile)` —
 *      there is no more internal Supabase auth/profile fetch to mock.
 *   2. We assert that `PancakeChatPlugin.setInitialFormData` receives the
 *      correct payloads sourced strictly from profile.username / email / phone,
 *      and that empty source fields are NOT sent (no guesses).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  openChatWithProfile,
  invalidateChatProfileCache,
} from "@/lib/openChatWithProfile";

// ---- PancakeChatPlugin stub: collects every payload sent ----
let setInitialFormData: ReturnType<typeof vi.fn>;
let openChatBox: ReturnType<typeof vi.fn>;

function installPancakeStub() {
  setInitialFormData = vi.fn();
  openChatBox = vi.fn();
  (window as any).PancakeChatPlugin = { setInitialFormData, openChatBox };
}

function mergedPayload(): Record<string, string> {
  // schedulePrefillRetries calls setInitialFormData many times across delays
  // with overlapping keys — merge them into one object representing what
  // the widget would ultimately see.
  const merged: Record<string, string> = {};
  for (const call of setInitialFormData.mock.calls) {
    Object.assign(merged, call[0]);
  }
  return merged;
}

describe("openChatWithProfile — E2E auto-fill contract", () => {
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

  it("populates name, email, and phone when all three are set on the profile", async () => {
    await openChatWithProfile({
      username: "alice",
      email: "alice@profile.com",
      phone: "+15551234567",
    });
    // Run all scheduled prefill retries (max delay = 3800ms)
    await vi.advanceTimersByTimeAsync(5000);

    expect(openChatBox).toHaveBeenCalledTimes(1);

    const payload = mergedPayload();

    // Name → profile.username
    expect(payload.name).toBe("alice");
    expect(payload.full_name).toBe("alice");
    expect(payload.customer_name).toBe("alice");

    // Email → profile.email
    expect(payload.email).toBe("alice@profile.com");
    expect(payload.customer_email).toBe("alice@profile.com");

    // Phone → profile.phone (digits-only variant is sent first)
    expect(payload.phone).toBe("15551234567");
    expect(payload.phone_number).toBe("15551234567");
    expect(payload.tel).toBe("15551234567");
  });

  it("leaves name blank (no email-as-name guess) when username is empty", async () => {
    await openChatWithProfile({ username: null, email: "carol@profile.com", phone: "+15559999999" });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    expect(payload.name).toBeUndefined();
    expect(payload.full_name).toBeUndefined();
    expect(payload.customer_name).toBeUndefined();
    expect(payload.email).toBe("carol@profile.com"); // still sent
    expect(payload.phone).toBe("15559999999"); // still sent
  });

  it("leaves phone blank when profile.phone is empty (no metadata fallback)", async () => {
    await openChatWithProfile({ username: "dan", email: "dan@profile.com", phone: null });
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    expect(payload.name).toBe("dan");
    expect(payload.email).toBe("dan@profile.com");

    // No phone-shaped key should be present
    const phoneKeys = ["phone", "phone_number", "phoneNumber", "tel", "mobile", "sdt"];
    for (const key of phoneKeys) {
      expect(payload[key]).toBeUndefined();
    }
  });

  it("sends nothing identity-related for guests and still opens the chat", async () => {
    await openChatWithProfile();

    await vi.advanceTimersByTimeAsync(5000);

    expect(openChatBox).toHaveBeenCalledTimes(1);
    expect(setInitialFormData).not.toHaveBeenCalled();
  });

  it("persists identity to localStorage on logged-in calls", async () => {
    await openChatWithProfile({ username: "eve", email: "eve@profile.com", phone: "+15551112222" });
    await vi.advanceTimersByTimeAsync(5000);

    const stored = JSON.parse(localStorage.getItem("soa_chat_identity") || "{}");
    expect(stored).toEqual({
      name: "eve",
      email: "eve@profile.com",
      phone: "+15551112222",
    });
  });

  it("uses stored identity to pre-fill chat after logout (no profile passed)", async () => {
    // Simulate a prior logged-in session having persisted identity
    localStorage.setItem(
      "soa_chat_identity",
      JSON.stringify({ name: "frank", email: "frank@x.com", phone: "+15553334444" }),
    );

    // Now: logged out — caller has no profile to pass
    await openChatWithProfile();
    await vi.advanceTimersByTimeAsync(5000);

    const payload = mergedPayload();
    expect(payload.name).toBe("frank");
    expect(payload.email).toBe("frank@x.com");
    expect(payload.phone).toBe("15553334444");
  });

  it("does not blank out a stored phone when a later profile has empty phone", async () => {
    // Pre-existing stored identity with a phone
    localStorage.setItem(
      "soa_chat_identity",
      JSON.stringify({ name: "old", email: "old@x.com", phone: "+15559998888" }),
    );

    // New login: same user but profile has no phone
    await openChatWithProfile({ username: "grace", email: "grace@profile.com", phone: null });
    await vi.advanceTimersByTimeAsync(5000);

    const stored = JSON.parse(localStorage.getItem("soa_chat_identity") || "{}");
    expect(stored.name).toBe("grace");
    expect(stored.email).toBe("grace@profile.com");
    expect(stored.phone).toBe("+15559998888"); // preserved
  });
});
