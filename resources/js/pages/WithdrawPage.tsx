import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Banknote, Check } from "lucide-react";
import api from "@/services/api";

import { useAuth } from "@/contexts/AuthContext";
import { UserLayout } from "@/components/UserLayout";
import { toast } from "@/hooks/use-toast";
import { useVerificationCheck } from "@/hooks/useVerificationCheck";
import { VerificationRequiredModal } from "@/components/VerificationRequiredModal";
import { TransactionSuccessModal } from "@/components/TransactionSuccessModal";
import { WithdrawQrUpload } from "@/components/withdraw/WithdrawQrUpload";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

interface CustomField {
  key: string;
  label: string;
  type: "text" | "email" | "tel";
  required: boolean;
}

interface WithdrawMethod {
  id: string;
  name: string;
  logo_url: string | null;
  min_amount: number;
  max_amount: number;
  custom_fields: CustomField[];
  is_active: boolean;
}

const tipOptions = [1, 2, 5, 10, 50, 100];

const WithdrawPage = () => {
  const { user, refreshUser } = useAuth();
  const [methods, setMethods] = useState<WithdrawMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<WithdrawMethod | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [useCustomTip, setUseCustomTip] = useState(false);
  const [balance, setBalance] = useState(0);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{ transactionId: string; type: string; amount: number; baseAmount?: number; tip?: number; paymentMethod: string } | null>(null);
  const { isVerified } = useVerificationCheck();
  const [dailyLimit, setDailyLimit] = useState<number>(100);
  const [dailyUsed, setDailyUsed] = useState<number>(0);
  const [withdrawErrors, setWithdrawErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    // Fetch withdraw methods. Real shape differs from the old supabase table: min/max amount are
    // `minimum_amount`/`maximum_amount`, and custom fields come from a `fields` relation
    // (field_name/field_label/field_type/is_required) rather than an inline `custom_fields` json
    // column — map both onto the shape this page already renders. The same response also carries
    // the real, server-computed daily_limit/daily_used (Admin -> Withdraw Methods daily limit card).
    api.get("/user/withdraw/methods").then((res) => {
      const data = (res.data?.methods || []) as any[];
      setMethods(data.map((d) => ({
        id: d.id,
        name: d.name,
        logo_url: d.logo_url,
        min_amount: Number(d.minimum_amount),
        max_amount: Number(d.maximum_amount),
        is_active: d.is_active,
        custom_fields: (d.fields || []).map((f: any) => ({
          key: f.field_name,
          label: f.field_label,
          type: f.field_type,
          required: f.is_required,
        })) as CustomField[],
      })));
      if (res.data?.daily_limit != null) setDailyLimit(Number(res.data.daily_limit));
      if (res.data?.daily_used != null) setDailyUsed(Number(res.data.daily_used));
    }).catch(() => {}).finally(() => setLoading(false));

    // balance already lives on the authenticated user object (useAuth().user.balance)
    setBalance(Number(user.balance) || 0);
  }, [user]);

  const activeTip = useCustomTip ? (parseFloat(customTip) || 0) : (tip || 0);
  const totalDeducted = (parseFloat(amount) || 0) + activeTip;
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  const handleSelectMethod = (m: WithdrawMethod) => {
    setSelectedMethod(m);
    setFieldValues({});
    setTip(null);
    setCustomTip("");
    setUseCustomTip(false);
  };

  const handleSubmit = async () => {
    if (!isVerified) { setShowVerifyModal(true); return; }

    const errs: Record<string, string> = {};
    if (!selectedMethod) { errs.method = "Please select a payment method"; }

    if (selectedMethod) {
      for (const f of selectedMethod.custom_fields) {
        if (f.required && !fieldValues[f.key]?.trim()) {
          errs[f.key] = `${f.label} is required`;
        }
      }
    }

    const amt = parseFloat(amount);
    if (!amount || isNaN(amt)) {
      errs.amount = "Please enter a valid withdrawal amount";
    } else if (selectedMethod && amt < selectedMethod.min_amount) {
      errs.amount = `Minimum withdrawal: $${selectedMethod.min_amount.toFixed(2)}`;
    } else if (selectedMethod && amt > selectedMethod.max_amount) {
      errs.amount = `Maximum withdrawal: $${selectedMethod.max_amount.toFixed(2)}`;
    } else if (totalDeducted > balance) {
      errs.amount = "Insufficient balance for withdrawal + tip";
    } else if (amt > dailyRemaining) {
      errs.amount = `Exceeds remaining 24-hour limit ($${dailyRemaining.toFixed(2)})`;
    }

    if (Object.keys(errs).length > 0) {
      setWithdrawErrors(errs);
      return;
    }
    setWithdrawErrors({});

    setSubmitting(true);

    // TODO: backend gap (deferred) — no tip field exists server-side, so the tip amount collected
    // below has nowhere to go and is no longer added to the submitted `amount`.
    const accountDetails: Record<string, string> = {};
    selectedMethod.custom_fields.forEach((f) => { accountDetails[f.key] = fieldValues[f.key] || ""; });

    try {
      const res = await api.post("/user/withdraw", {
        method_id: selectedMethod.id,
        amount: amt,
        account_details: accountDetails,
        proof_url: qrCodeUrl || undefined,
      });
      const request = res.data?.request;

      // "Submission received" email is now sent server-side from UserWithdrawApiController::store()
      // via EmailTemplateMailer (trigger: transaction_pending_withdraw).
      setLastTransaction({
        transactionId: request?.id ? String(request.id) : "",
        type: "withdraw",
        amount: amt,
        baseAmount: amt,
        tip: activeTip > 0 ? activeTip : undefined,
        paymentMethod: selectedMethod.name,
      });
      setAmount("");
      setFieldValues({});
      setTip(null);
      setCustomTip("");
      setUseCustomTip(false);
      setSelectedMethod(null);
      setQrCodeUrl(null);
      setDailyUsed(prev => prev + amt);
      setShowSuccessModal(true);
      // Withdraw reserves/deducts the balance immediately, so the header balance (sourced from
      // useAuth().user.balance) needs a real refresh here — see TransferPage.tsx for the same fix.
      if (res.data?.new_balance != null) setBalance(Number(res.data.new_balance));
      refreshUser();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to submit withdrawal.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserLayout showBackButton>
      <div className="py-16">
        <div className="mx-auto max-w-2xl px-4">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold tracking-wider gradient-text">WITHDRAW</h2>
              <p className="mt-2 text-sm text-muted-foreground">Transfer money from your main balance to your wallet.</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 glow-card space-y-5">
              {/* Daily limit info */}
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Daily Limit (24hrs)</span>
                  <span className="text-foreground font-medium">${dailyLimit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Used Today</span>
                  <span className="text-foreground font-medium">${dailyUsed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Remaining</span>
                  <span className={`font-medium ${dailyRemaining <= 0 ? "text-destructive" : "text-green-500"}`}>${dailyRemaining.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Payment Method</label>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading payment methods...</p>
                ) : methods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment methods available.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMethod(m)}
                        className={`group relative rounded-xl border-2 p-3 text-left transition-all duration-200 w-full ${
                          selectedMethod?.id === m.id
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                        }`}
                      >
                        {selectedMethod?.id === m.id && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full gradient-bg flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                        <div className="flex flex-col items-center gap-2">
                          {m.logo_url ? (
                            <img src={m.logo_url} alt={m.name} className="h-10 w-10 rounded-lg object-contain bg-muted/50 p-1 border border-border" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center text-sm font-bold text-muted-foreground">
                              {m.name.charAt(0)}
                            </div>
                          )}
                          <p className="text-xs font-semibold text-foreground text-center truncate w-full">{m.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {withdrawErrors.method && <p className="text-xs text-destructive font-medium mt-1">{withdrawErrors.method}</p>}
              </div>

              {/* Dynamic Custom Fields */}
              {selectedMethod && selectedMethod.custom_fields.length > 0 && (
                <div className="space-y-3">
                  {selectedMethod.custom_fields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </label>
                      <input
                        type={f.type}
                        value={fieldValues[f.key] || ""}
                        onChange={(e) => {
                          setFieldValues({ ...fieldValues, [f.key]: e.target.value });
                          if (withdrawErrors[f.key]) setWithdrawErrors(p => ({ ...p, [f.key]: "" }));
                        }}
                        placeholder={`Enter your ${f.label.toLowerCase()}`}
                        className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                          withdrawErrors[f.key] ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                        }`}
                      />
                      {withdrawErrors[f.key] && <p className="text-xs text-destructive font-medium mt-1">{withdrawErrors[f.key]}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Amount ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); if (withdrawErrors.amount) setWithdrawErrors(p => ({ ...p, amount: "" })); }}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                    withdrawErrors.amount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {withdrawErrors.amount && <p className="text-xs text-destructive font-medium mt-1">{withdrawErrors.amount}</p>}
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Balance: <span className="font-semibold text-foreground">${balance.toFixed(2)}</span></span>
                  {selectedMethod && (
                    <span>Min: ${selectedMethod.min_amount.toFixed(2)} · Max: ${selectedMethod.max_amount.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Tip Section */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Send a Tip ($USD)</label>
                <p className="text-[11px] text-muted-foreground mb-2">All tips go directly to our cashiers</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {tipOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTip(tip === t && !useCustomTip ? null : t); setUseCustomTip(false); setCustomTip(""); }}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-all ${
                        !useCustomTip && tip === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-foreground hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      ${t}
                    </button>
                  ))}
                  <button
                    onClick={() => { setUseCustomTip(true); setTip(null); }}
                    className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-all ${
                      useCustomTip
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-foreground hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {useCustomTip && (
                  <input
                    type="number" min="0" step="0.01"
                    value={customTip}
                    onChange={(e) => { const val = parseFloat(e.target.value); if (e.target.value === "" || val >= 0) setCustomTip(e.target.value); }}
                    placeholder="Enter custom tip amount"
                    className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
                  />
                )}
              </div>

              {/* QR Code Upload */}
              <WithdrawQrUpload
                onUploadComplete={(url) => setQrCodeUrl(url)}
                onRemove={() => setQrCodeUrl(null)}
                uploadedUrl={qrCodeUrl}
              />

              {/* Summary */}
              {(parseFloat(amount) > 0 || activeTip > 0) && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs text-muted-foreground">
                  {parseFloat(amount) > 0 && (
                    <div className="flex justify-between">
                      <span>Withdraw</span>
                      <span className="text-foreground font-medium">${(parseFloat(amount) || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {activeTip > 0 && (
                    <div className="flex justify-between">
                      <span>Tip</span>
                      <span className="text-foreground font-medium">${activeTip.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-1 flex justify-between font-semibold text-foreground text-sm">
                    <span>Total</span>
                    <span>${totalDeducted.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedMethod || dailyRemaining <= 0}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Banknote className="h-4 w-4" /> {submitting ? "Submitting..." : "Withdraw Now"}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
      <VerificationRequiredModal open={showVerifyModal} onClose={() => setShowVerifyModal(false)} />
      <TransactionSuccessModal open={showSuccessModal} onClose={() => setShowSuccessModal(false)} transaction={lastTransaction} />
    </UserLayout>
  );
};

export default WithdrawPage;
