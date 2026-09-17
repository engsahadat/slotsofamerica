const STORAGE_KEY = "soa_chat_identity";

type ChatIdentity = { name: string; email: string; phone: string };

/** Minimal shape callers pass in — sourced from useAuth().user, which already has
 * username/email/phone on the authenticated user object (no API call needed). */
export type ChatProfileInput = { username?: string | null; email?: string | null; phone?: string | null } | null | undefined;

function readStoredIdentity(): ChatIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatIdentity>;
    const name = (parsed?.name || "").trim();
    const email = (parsed?.email || "").trim();
    const phone = (parsed?.phone || "").trim();
    if (!name && !email && !phone) return null;
    return { name, email, phone };
  } catch {
    return null;
  }
}

function writeStoredIdentity(data: ChatIdentity) {
  try {
    // Merge with existing so a new empty value never blanks out a good one.
    const existing = readStoredIdentity();
    const merged: ChatIdentity = {
      name: data.name || existing?.name || "",
      email: data.email || existing?.email || "",
      phone: data.phone || existing?.phone || "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // private mode / quota / disabled storage — silent
  }
}

/**
 * Resolves the identity to prefill the chat widget with.
 *
 * This used to call supabase.auth.getUser() + a "profiles" table lookup. Neither is needed
 * anymore: the caller is always an already-authenticated React component with `useAuth().user`
 * in scope, and that user object already carries username/email/phone directly (see
 * resources/js/contexts/AuthContext.tsx's UserProfile type) — no extra request required.
 *
 * `profile` is optional so guests (no profile passed) still fall back to whatever identity was
 * persisted from a prior logged-in session.
 */
function resolveIdentity(profile: ChatProfileInput): ChatIdentity | null {
  if (!profile) {
    return readStoredIdentity();
  }

  // Strict sources: username only for name, profile.phone only for phone.
  const name = (profile.username || "").trim();
  const email = (profile.email || "").trim();
  const phone = (profile.phone || "").trim();

  const identity: ChatIdentity = { name, email, phone };

  // Persist for logged-out chat opens. Merging preserves existing good
  // values if the current profile happens to have a blank field.
  writeStoredIdentity(identity);

  return identity;
}

/** Kept for backwards compatibility with existing callers (e.g. Settings.tsx after a profile
 * update). There is no in-memory profile cache anymore — identity is always resolved fresh from
 * the caller-supplied `profile` argument — so this is now a no-op. */
export function invalidateChatProfileCache() {
  // no-op — see comment above.
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getPhoneVariants(phone: string) {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");

  // No digits → not a usable phone value. Return empty so callers skip
  // sending phone payloads entirely instead of forwarding garbage.
  if (!digits) return [];

  const plusDigits = `+${digits}`;
  const withoutPlus = raw.replace(/^\+/, "");

  // numeric first: many pre-chat widgets expect only digits for phone
  return uniqueStrings([digits, plusDigits, raw, withoutPlus]);
}

function buildIdentityFormData(data: { name: string; email: string }) {
  const payload: Record<string, string> = {};
  if (data.email) {
    payload.email = data.email;
    payload.customer_email = data.email;
  }
  if (data.name) {
    payload.name = data.name;
    payload.full_name = data.name;
    payload.fullName = data.name;
    payload.customer_name = data.name;
  }
  return payload;
}

function buildPhoneFormData(phone: string) {
  return {
    phone,
    phone_number: phone,
    phoneNumber: phone,
    phonenumber: phone,
    tel: phone,
    mobile: phone,
    telephone: phone,
    number: phone,
    contact: phone,
    contact_phone: phone,
    contactPhone: phone,
    contact_number: phone,
    contactNumber: phone,
    customer_phone: phone,
    customerPhone: phone,
    sdt: phone,
    so_dien_thoai: phone,
    "phone number": phone,
    "Phone Number": phone,
    "Số điện thoại": phone,
    "so dien thoai": phone,
  };
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  if (!value) return;
  if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return;

  const current = (el.value || "").trim();
  if (current.length > 4 && current !== "+") return;

  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function isPhoneField(el: HTMLInputElement | HTMLTextAreaElement) {
  const meta = normalizeText(
    [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      (el as HTMLInputElement).autocomplete || "",
      (el as HTMLInputElement).inputMode || "",
      (el as HTMLInputElement).type || "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  if ((el as HTMLInputElement).type === "tel") return true;
  if ((el as HTMLInputElement).autocomplete?.toLowerCase().includes("tel")) return true;
  if ((el as HTMLInputElement).inputMode === "tel") return true;

  const keywords = [
    "phone",
    "tel",
    "mobile",
    "telephone",
    "contact",
    "sdt",
    "so dien thoai",
    "dien thoai",
    "whatsapp",
    "zalo",
    "sms",
  ];

  return keywords.some((keyword) => meta.includes(keyword));
}

function fillPhoneInRoot(root: ParentNode, phone: string) {
  if (!phone) return;

  const phoneVariants = getPhoneVariants(phone);
  const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");

  inputs.forEach((el) => {
    const type = (el as HTMLInputElement).type?.toLowerCase();
    if (type === "hidden" || type === "password") return;
    if (!isPhoneField(el)) return;

    const maxLength = (el as HTMLInputElement).maxLength;
    const best =
      maxLength && maxLength > 0
        ? phoneVariants.find((v) => v.length <= maxLength) || phoneVariants[0]
        : phoneVariants[0];

    if (best) setInputValue(el, best);
  });
}

function tryFillPhoneInputs(phone: string) {
  try {
    fillPhoneInRoot(document, phone);

    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        const src = normalizeText(iframe.src || "");
        const id = normalizeText(iframe.id || "");
        const cls = normalizeText(iframe.className?.toString() || "");
        const looksLikePancake = src.includes("pancake") || id.includes("pancake") || cls.includes("pancake");
        if (!looksLikePancake) return;

        const doc = iframe.contentDocument;
        if (!doc) return;
        fillPhoneInRoot(doc, phone);
      } catch {
        // ignore cross-origin iframe access errors
      }
    });
  } catch {
    // noop
  }
}

function prefillProfileForChat(data: { name: string; email: string; phone: string }) {
  try {
    // keep currently working fields
    window.PancakeChatPlugin?.setInitialFormData(buildIdentityFormData(data));

    // send phone from profile as dedicated payload
    const phoneVariants = getPhoneVariants(data.phone);
    const primaryPhone = phoneVariants[0] || "";
    if (primaryPhone) {
      window.PancakeChatPlugin?.setInitialFormData(buildPhoneFormData(primaryPhone));

      // also send single-key payloads to cover strict widgets
      window.PancakeChatPlugin?.setInitialFormData({ phone: primaryPhone });
      window.PancakeChatPlugin?.setInitialFormData({ phone_number: primaryPhone });
      window.PancakeChatPlugin?.setInitialFormData({ phoneNumber: primaryPhone });
      window.PancakeChatPlugin?.setInitialFormData({ tel: primaryPhone });
      window.PancakeChatPlugin?.setInitialFormData({ sdt: primaryPhone });
    }
  } catch {
    // noop
  }
}

function schedulePrefillRetries(data: { name: string; email: string; phone: string }) {
  const delays = [0, 150, 400, 900, 1600, 2600, 3800];

  delays.forEach((delay) => {
    window.setTimeout(() => {
      prefillProfileForChat(data);
      tryFillPhoneInputs(data.phone);
    }, delay);
  });
}

/**
 * Opens Pancake Chat and auto-fills user profile data (name, email, phone).
 *
 * `profile` should be the caller's `useAuth().user` (or a subset of it) — pass it explicitly since
 * this is a plain module, not a component, and can no longer fetch it itself. Omit it for guest
 * contexts; the previously-persisted identity (if any) is used instead.
 */
export async function openChatWithProfile(profile?: ChatProfileInput) {
  try {
    const data = resolveIdentity(profile);

    if (data) {
      // prefill before open
      schedulePrefillRetries(data);
    }

    window.PancakeChatPlugin?.openChatBox();

    if (data) {
      // prefill after open when form mounts
      window.setTimeout(() => schedulePrefillRetries(data), 250);
    }
  } catch {
    try {
      window.PancakeChatPlugin?.openChatBox();
    } catch {
      // noop
    }
  }
}

function hasPancakeMarker(value: string) {
  const v = normalizeText(value);
  return v.includes("pancake") || v.includes("chat-widget") || v.includes("livechat");
}

function pathLooksLikeWidget(path: EventTarget[]) {
  return path.some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    return hasPancakeMarker([node.id, node.className?.toString() || "", node.getAttribute("aria-label") || ""].join(" "));
  });
}

/**
 * Sets up a global click interceptor on the Pancake Chat floating bubble
 * so profile data is auto-filled even when users click it directly.
 *
 * NOTE: this listener is registered once at the document level, outside of any component tree,
 * so it has no live `useAuth().user` to read (and — separately — has no existing call site in the
 * app today). It can only fall back to whatever identity was last persisted to localStorage by a
 * prior `openChatWithProfile(profile)` call.
 */
let interceptorActive = false;
export function setupChatBubbleInterceptor() {
  if (interceptorActive) return;
  interceptorActive = true;

  document.addEventListener(
    "click",
    async (e) => {
      const target = e.target as HTMLElement | null;
      const widgetRoot = target?.closest("[id*='pancake'], [class*='pancake'], [id*='chat-widget'], [class*='chat-widget']");
      const fromWidgetPath = pathLooksLikeWidget((e.composedPath?.() || []) as EventTarget[]);

      if (!widgetRoot && !fromWidgetPath) return;

      const data = resolveIdentity(undefined);
      if (!data) return;

      schedulePrefillRetries(data);
    },
    true,
  );

  let mutationDebounceTimer: number | null = null;

  const observer = new MutationObserver(async (mutations) => {
    const hasRelevantNode = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof HTMLElement)) return false;

        // Explicitly cover pancake iframes added to the DOM
        if (node.tagName === "IFRAME") {
          const iframe = node as HTMLIFrameElement;
          if (hasPancakeMarker(`${iframe.src || ""} ${iframe.id || ""} ${iframe.className?.toString() || ""}`)) {
            return true;
          }
        }

        return (
          hasPancakeMarker(`${node.id} ${node.className?.toString() || ""}`) ||
          !!node.querySelector(
            "iframe[src*='pancake'], iframe[id*='pancake'], iframe[class*='pancake'], input, textarea, [id*='pancake'], [class*='pancake'], [id*='chat-widget'], [class*='chat-widget']",
          )
        );
      }),
    );

    if (!hasRelevantNode) return;

    if (mutationDebounceTimer) {
      window.clearTimeout(mutationDebounceTimer);
    }

    mutationDebounceTimer = window.setTimeout(async () => {
      const data = resolveIdentity(undefined);
      if (!data) return;
      schedulePrefillRetries(data);
    }, 120);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Iframe-focus heuristic: when window loses focus AND the new active
  // element is a Pancake iframe, treat it as a chat-open signal. This is
  // the standard workaround for cross-origin chat iframes whose internal
  // bubble click never bubbles up to the host document.
  const handleIframeFocus = () => {
    window.setTimeout(async () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLIFrameElement)) return;
      const meta = `${active.src || ""} ${active.id || ""} ${active.className?.toString() || ""}`;
      if (!hasPancakeMarker(meta)) return;

      const data = resolveIdentity(undefined);
      if (!data) return;
      schedulePrefillRetries(data);
    }, 0);
  };

  window.addEventListener("blur", handleIframeFocus);
  document.addEventListener("visibilitychange", handleIframeFocus);
}

/** Test-only exports. Do not use in app code. */
export const __test__ = {
  buildIdentityFormData,
  buildPhoneFormData,
  isPhoneField,
  fillPhoneInRoot,
  tryFillPhoneInputs,
  getPhoneVariants,
};

