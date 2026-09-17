import { useState, useRef, useEffect } from "react";
import { X, Loader2, Mail, Phone, ShieldCheck, Clock } from "lucide-react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  type: "email" | "phone";
  onClose: () => void;
  onVerified: () => void;
}

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 60;

// Allow local numbers (e.g. 017XXXXXXXX) as well as E.164 (+8801XXXXXXXX)
const isValidPhone = (value: string) => {
  const cleaned = value.replace(/[\s()-]/g, "");
  return /^((\+?[1-9]\d{7,14})|(01[3-9]\d{8}))$/.test(cleaned);
};

export function VerificationOtpModal({ type, onClose, onVerified }: Props) {
  const { user } = useAuth();

  const [step, setStep] = useState<"send" | "verify">("send");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [requestingManual, setRequestingManual] = useState(false);
  const [manualRequested, setManualRequested] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [attempts, setAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phone, setPhone] = useState(user?.phone || "");

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => { if (cooldownRef.current) clearTimeout(cooldownRef.current); };
  }, [resendCooldown]);

  useEffect(() => {
    if (step === "verify") setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [step]);

  const extractError = (err: any): string =>
    err.response?.data?.message || err.message || "Something went wrong. Please try again.";

  const handleSend = async () => {
    if (resendCooldown > 0) return;
    if (type === "phone" && !isValidPhone(phone)) {
      toast({ title: "Enter a valid phone number", description: "e.g. 017XXXXXXXX or +88017XXXXXXXX", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      if (type === "email") {
        await api.post("/user/verification/email/send");
      } else {
        await api.post("/user/verification/phone/send", { phone });
      }
      setStep("verify");
      setResendCooldown(RESEND_COOLDOWN);
      setAttempts(0);
      setOtp(["", "", "", "", "", ""]);
      toast({
        title: type === "email" ? "Verification code sent to your email" : "Verification code sent to your phone",
      });
    } catch (err: any) {
      toast({ title: "Error", description: extractError(err), variant: "destructive" });
    }
    setSending(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...otp];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    if (text.length > 0) inputRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      toast({ title: "Please enter the 6-digit code", variant: "destructive" });
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      toast({ title: "Too many attempts", description: "Please request a new code.", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setAttempts((a) => a + 1);
    try {
      await api.post("/user/verification/verify", {
        channel: type === "email" ? "email" : "sms",
        code,
      });
      toast({ title: type === "email" ? "Email verified successfully! 🎉" : "Phone verified successfully! 🎉" });
      onVerified();
    } catch (err: any) {
      toast({ title: "Verification failed", description: extractError(err), variant: "destructive" });
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
    setVerifying(false);
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    handleSend();
  };

  const handleManualRequest = async () => {
    if (!isValidPhone(phone)) {
      toast({ title: "Enter a valid phone number", description: "e.g. 017XXXXXXXX or +88017XXXXXXXX", variant: "destructive" });
      return;
    }
    setRequestingManual(true);
    try {
      await api.post("/user/verification/phone/manual-request", { phone });
      setManualRequested(true);
      toast({ title: "Request submitted", description: "An admin will verify your number shortly." });
    } catch (err: any) {
      toast({ title: "Request failed", description: extractError(err), variant: "destructive" });
    }
    setRequestingManual(false);
  };

  const Icon = type === "email" ? Mail : Phone;
  const remainingAttempts = MAX_ATTEMPTS - attempts;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        >
          <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>

          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Icon className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">
              {type === "email" ? "Verify Your Email" : "Verify Your Phone Number"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "send"
                ? type === "email"
                  ? "We'll send a 6-digit code to your email address."
                  : "We'll send a 6-digit code to your phone via SMS."
                : type === "email"
                  ? "Check your email inbox and enter the 6-digit code."
                  : "Enter the 6-digit code we sent via SMS."}
            </p>
          </div>

          {/* SEND step */}
          {step === "send" && (
            <div className="space-y-4">
              {type === "phone" && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+8801XXXXXXXXX"
                    className="w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Include your country code, starting with +.</p>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending || (type === "phone" && !isValidPhone(phone))}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {sending ? "Sending..." : "Send Verification Code"}
              </button>

              {type === "phone" && (
                manualRequested ? (
                  <p className="text-center text-xs text-primary font-medium">
                    Manual verification requested — an admin will review it shortly.
                  </p>
                ) : (
                  <button
                    onClick={handleManualRequest}
                    disabled={requestingManual || !isValidPhone(phone)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 font-medium"
                  >
                    {requestingManual ? "Submitting..." : "Not receiving codes? Request manual verification"}
                  </button>
                )
              )}
            </div>
          )}

          {/* VERIFY step */}
          {step === "verify" && (
            <div className="space-y-5">
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="h-12 w-11 sm:w-12 rounded-xl border border-border bg-muted/50 text-center text-lg font-bold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Expires in 5 min
                </span>
                {attempts > 0 && (
                  <span className={remainingAttempts <= 2 ? "text-destructive" : ""}>
                    {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""} left
                  </span>
                )}
              </div>

              <button
                onClick={handleVerify}
                disabled={verifying || otp.join("").length !== 6 || attempts >= MAX_ATTEMPTS}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {verifying ? "Verifying..." : "Verify Code"}
              </button>

              <div className="space-y-1 text-center">
                <button
                  onClick={handleResend}
                  disabled={sending || resendCooldown > 0}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 font-medium"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't receive a code? Click to Resend"}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Check your spam/junk folder if the email does not appear in your primary inbox.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
