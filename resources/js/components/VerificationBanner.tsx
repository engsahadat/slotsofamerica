import { useState } from "react";
import { X, Mail, Phone, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { VerificationOtpModal } from "./VerificationOtpModal";

export function VerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [otpModal, setOtpModal] = useState<"email" | "phone" | null>(null);

  if (dismissed || !user) return null;

  const needsEmail = !user.email_verified_at;
  const needsPhone = !user.phone_verified;

  if (!needsEmail && !needsPhone) return null;

  let message = "";
  if (needsEmail && needsPhone) {
    message = "Please verify your email and phone number to unlock full support and faster account assistance.";
  } else if (needsEmail) {
    message = "Please verify your email address to unlock full support and faster account assistance.";
  } else if (needsPhone) {
    message = "Please verify your phone number to unlock full support and faster account assistance.";
  }

  return (
    <>
      <div className="relative z-40 border-b border-amber-500/20 bg-amber-500/10 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-xs sm:text-sm text-amber-200 truncate">
              {message}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {needsEmail && (
              <button
                onClick={() => setOtpModal("email")}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" /> Verify Email
              </button>
            )}
            {needsPhone && (
              <button
                onClick={() => setOtpModal("phone")}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" /> Verify Phone
              </button>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {otpModal && (
        <VerificationOtpModal
          type={otpModal}
          onClose={() => setOtpModal(null)}
          onVerified={async () => {
            await refreshUser();
            setOtpModal(null);
          }}
        />
      )}
    </>
  );
}
