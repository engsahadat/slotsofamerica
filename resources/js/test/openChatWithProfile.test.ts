import { describe, it, expect, beforeEach } from "vitest";
import { __test__ } from "@/lib/openChatWithProfile";

const { buildIdentityFormData, isPhoneField, fillPhoneInRoot, tryFillPhoneInputs } = __test__;

describe("buildIdentityFormData — strict empty-skipping", () => {
  it("includes name + email keys when both present", () => {
    const payload = buildIdentityFormData({ name: "alice", email: "a@x.com" });
    expect(payload).toMatchObject({
      name: "alice",
      full_name: "alice",
      fullName: "alice",
      customer_name: "alice",
      email: "a@x.com",
      customer_email: "a@x.com",
    });
  });

  it("omits ALL name keys when username is empty (no email-as-name fallback)", () => {
    const payload = buildIdentityFormData({ name: "", email: "a@x.com" });
    expect(payload.name).toBeUndefined();
    expect(payload.full_name).toBeUndefined();
    expect(payload.fullName).toBeUndefined();
    expect(payload.customer_name).toBeUndefined();
    expect(payload.email).toBe("a@x.com");
  });

  it("omits ALL email keys when email is empty", () => {
    const payload = buildIdentityFormData({ name: "alice", email: "" });
    expect(payload.email).toBeUndefined();
    expect(payload.customer_email).toBeUndefined();
    expect(payload.name).toBe("alice");
  });

  it("returns an empty object when both fields are empty", () => {
    expect(buildIdentityFormData({ name: "", email: "" })).toEqual({});
  });
});

describe("isPhoneField — Pancake-style input detection", () => {
  function makeInput(attrs: Record<string, string>) {
    const el = document.createElement("input");
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  it("detects type=tel", () => {
    expect(isPhoneField(makeInput({ type: "tel" }))).toBe(true);
  });

  it("detects name='phone'", () => {
    expect(isPhoneField(makeInput({ name: "phone" }))).toBe(true);
  });

  it("detects placeholder containing 'mobile'", () => {
    expect(isPhoneField(makeInput({ placeholder: "Your mobile number" }))).toBe(true);
  });

  it("detects Vietnamese 'so dien thoai' via aria-label", () => {
    expect(isPhoneField(makeInput({ "aria-label": "so dien thoai" }))).toBe(true);
  });

  it("detects autocomplete='tel-national'", () => {
    expect(isPhoneField(makeInput({ autocomplete: "tel-national" }))).toBe(true);
  });

  it("ignores plain text/email inputs", () => {
    expect(isPhoneField(makeInput({ type: "email", name: "email" }))).toBe(false);
    expect(isPhoneField(makeInput({ type: "text", name: "address" }))).toBe(false);
  });
});

describe("fillPhoneInRoot — fills phone fields, skips others", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fills a phone input but leaves email/name inputs untouched", () => {
    document.body.innerHTML = `
      <form>
        <input id="name" name="name" type="text" />
        <input id="email" name="email" type="email" />
        <input id="phone" name="phone" type="tel" />
      </form>
    `;

    fillPhoneInRoot(document, "+15551234567");

    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("15551234567");
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("");
  });

  it("does nothing when phone is empty", () => {
    document.body.innerHTML = `<input id="phone" type="tel" />`;
    fillPhoneInRoot(document, "");
    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("");
  });

  it("does not overwrite a phone field that already has a long value", () => {
    document.body.innerHTML = `<input id="phone" type="tel" value="9999999999" />`;
    fillPhoneInRoot(document, "+15551234567");
    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("9999999999");
  });

  it("respects maxLength when picking a phone variant", () => {
    document.body.innerHTML = `<input id="phone" type="tel" maxlength="11" />`;
    fillPhoneInRoot(document, "+15551234567"); // digits = 11 chars, +digits = 12
    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("15551234567");
  });
});

describe("tryFillPhoneInputs — Pancake iframe detection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fills phone inputs inside a same-origin Pancake iframe", () => {
    const iframe = document.createElement("iframe");
    iframe.id = "pancake-chat-frame";
    document.body.appendChild(iframe);

    const innerDoc = iframe.contentDocument!;
    innerDoc.body.innerHTML = `
      <input id="inner-phone" name="phone_number" type="tel" />
      <input id="inner-name" name="name" type="text" />
    `;

    tryFillPhoneInputs("+15551234567");

    expect((innerDoc.getElementById("inner-phone") as HTMLInputElement).value).toBe(
      "15551234567",
    );
    expect((innerDoc.getElementById("inner-name") as HTMLInputElement).value).toBe("");
  });

  it("ignores iframes not marked as Pancake", () => {
    const iframe = document.createElement("iframe");
    iframe.id = "some-other-widget";
    document.body.appendChild(iframe);

    const innerDoc = iframe.contentDocument!;
    innerDoc.body.innerHTML = `<input id="inner-phone" type="tel" />`;

    tryFillPhoneInputs("+15551234567");

    expect((innerDoc.getElementById("inner-phone") as HTMLInputElement).value).toBe("");
  });

  it("does not throw when phone is empty", () => {
    expect(() => tryFillPhoneInputs("")).not.toThrow();
  });
});
