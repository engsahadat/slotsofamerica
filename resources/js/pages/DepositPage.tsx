import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { DollarSign, Zap, FileText, CheckCircle2, Clock } from "lucide-react";
import api from "@/services/api";

import { useAuth } from "@/contexts/AuthContext";
import { UserLayout } from "@/components/UserLayout";
import { toast } from "@/hooks/use-toast";
import { useVerificationCheck } from "@/hooks/useVerificationCheck";
import { VerificationRequiredModal } from "@/components/VerificationRequiredModal";
import { TransactionSuccessModal } from "@/components/TransactionSuccessModal";
import { PaymentMethodCard } from "@/components/deposit/PaymentMethodCard";
import { PaymentDetails } from "@/components/deposit/PaymentDetails";
import { DepositScreenshotUpload } from "@/components/deposit/DepositScreenshotUpload";
import { DepositHelpModal } from "@/components/deposit/DepositHelpModal";
import { FastPaymentSection, FAST_PENDING_ORDER_KEY } from "@/components/deposit/FastPaymentSection";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

interface PaymentGateway {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  qr_code_url: string | null;
  minimum_amount: number;
  instructions: string | null;
  deep_link: string | null;
}

interface GatewayAccount {
  id: string;
  gateway_id: string;
  account_name: string;
  account_number: string;
  deep_link: string | null;
  qr_code_url: string | null;
  is_active: boolean;
  priority_order: number;
}

const HELP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const DepositPage = () => {
  const { user, refreshUser } = useAuth();
  const [depositMode, setDepositMode] = useState<"fast" | "manual">("fast");
  const [pendingOrder, setPendingOrder] = useState<{ orderSn: string; status: string; confirmedAmount?: number | null } | null>(null);
  const [checkingPending, setCheckingPending] = useState(false);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [gatewayAccounts, setGatewayAccounts] = useState<GatewayAccount[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{
    transactionId: string;
    type: string;
    amount: number;
    paymentMethod: string;
  } | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const { isVerified } = useVerificationCheck();

  // Screenshot upload
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Rotating accounts
  const [skippedAccountIds, setSkippedAccountIds] = useState<Set<string>>(new Set());

  // Help timer
  const [showHelpModal, setShowHelpModal] = useState(false);
  const helpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSubmittedRef = useRef(false);

  // Fetch gateways & accounts (GET /api/user/deposit/gateways returns each gateway
  // with its active accounts nested under `accounts`, so this is a single call).
  useEffect(() => {
    if (!user) return;
    api.get("/user/deposit/gateways").then((res) => {
      const gws = (res.data?.gateways || []) as (PaymentGateway & { accounts?: GatewayAccount[] })[];
      gws.forEach((g) => { g.minimum_amount = Number(g.minimum_amount) || 0; });
      setGateways(gws);
      setGatewayAccounts(gws.flatMap((g) => g.accounts || []));
      if (gws.length > 0) {
        setSelectedGateway(gws[0]);
        setAmount(gws[0].minimum_amount > 0 ? String(gws[0].minimum_amount) : "10");
      }
    }).catch(() => {}).finally(() => {
      // balance already lives on the authenticated user object (useAuth().user.balance)
      setBalance(Number(user.balance) || 0);
      setLoading(false);
    });
  }, [user]);

  // If the user just returned from a checkout, check on it — the webhook may already have
  // confirmed it, or it may still be pending (never assume success from the redirect alone).
  // silent=true on the initial auto-check (on mount); the manual "Check again" click always
  // gives explicit feedback — without it, a still-pending result looks identical before and
  // after the click (same banner text), which reads as "the button did nothing".
  const checkPendingOrder = useCallback((orderSn: string, silent = false) => {
    setCheckingPending(true);
    api.get(`/user/deposit/fast-payment/${orderSn}/status`)
      .then((res) => {
        const status = res.data?.status || "pending";
        setPendingOrder({ orderSn, status, confirmedAmount: res.data?.confirmed_amount });
        if (status === "completed") {
          try { sessionStorage.removeItem(FAST_PENDING_ORDER_KEY); } catch { /* ignore */ }
          refreshUser();
        } else if (status === "failed" || status === "cancelled") {
          try { sessionStorage.removeItem(FAST_PENDING_ORDER_KEY); } catch { /* ignore */ }
        } else if (!silent) {
          toast({ title: "Still processing", description: "No update yet — we'll keep checking automatically." });
        }
      })
      .catch(() => {
        // Never silently clear the banner on a transient network error — that makes the whole
        // thing vanish with no explanation, which looks even more broken than no feedback at all.
        if (!silent) {
          toast({ title: "Could not check status", description: "Please try again in a moment.", variant: "destructive" });
        }
      })
      .finally(() => setCheckingPending(false));
  }, [refreshUser]);

  useEffect(() => {
    let orderSn: string | null = null;
    try { orderSn = sessionStorage.getItem(FAST_PENDING_ORDER_KEY); } catch { /* ignore */ }
    if (orderSn) checkPendingOrder(orderSn, true);
  }, [checkPendingOrder]);

  // 5-minute help timer
  useEffect(() => {
    helpTimerRef.current = setTimeout(() => {
      if (!hasSubmittedRef.current) {
        setShowHelpModal(true);
      }
    }, HELP_TIMEOUT_MS);

    return () => {
      if (helpTimerRef.current) clearTimeout(helpTimerRef.current);
    };
  }, []);

  // Get active accounts for selected gateway (excluding skipped)
  const getActiveAccounts = useCallback(() => {
    if (!selectedGateway) return [];
    return gatewayAccounts
      .filter(
        (a) =>
          a.gateway_id === selectedGateway.id &&
          a.is_active &&
          !skippedAccountIds.has(a.id)
      )
      .sort((a, b) => a.priority_order - b.priority_order);
  }, [selectedGateway, gatewayAccounts, skippedAccountIds]);

  const allAccountsForGateway = selectedGateway
    ? gatewayAccounts.filter((a) => a.gateway_id === selectedGateway.id && a.is_active)
    : [];
  const hasMultipleAccounts = allAccountsForGateway.length > 1;
  const activeAccounts = getActiveAccounts();
  const currentAccount = activeAccounts.length > 0 ? activeAccounts[0] : null;
  const noMoreAccounts = allAccountsForGateway.length > 0 && activeAccounts.length === 0;

  const handleSelectGateway = (gw: PaymentGateway) => {
    setSelectedGateway(gw);
    setAmount(gw.minimum_amount > 0 ? String(gw.minimum_amount) : "10");
    setProofUrl(null);
    setSkippedAccountIds(new Set());
  };

  const handleRequestNewAccount = () => {
    if (currentAccount) {
      setSkippedAccountIds((prev) => new Set([...prev, currentAccount.id]));
    }
  };

  const canConfirm = !!selectedGateway && !!proofUrl && !!amount && parseFloat(amount) >= (selectedGateway?.minimum_amount || 0);

  const [depositErrors, setDepositErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    if (!isVerified) {
      setShowVerifyModal(true);
      return;
    }
    const errs: Record<string, string> = {};
    if (!selectedGateway) {
      errs.gateway = "Please select a payment method";
    }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || (selectedGateway && amt < selectedGateway.minimum_amount)) {
      errs.amount = selectedGateway
        ? `Minimum deposit: $${selectedGateway.minimum_amount.toFixed(2)}`
        : "Please enter a valid deposit amount";
    }
    if (!proofUrl) {
      errs.proof = "Please upload your deposit screenshot";
    }
    if (Object.keys(errs).length > 0) {
      setDepositErrors(errs);
      return;
    }
    setDepositErrors({});

    setSubmitting(true);
    hasSubmittedRef.current = true;

    const accountInfo = currentAccount
      ? ` — Account: ${currentAccount.account_name} (${currentAccount.account_number})`
      : ` — Address: ${selectedGateway.address}`;

    try {
      const formData = new FormData();
      formData.append("amount", String(amt));
      formData.append("gateway_id", String(selectedGateway.id));
      if (currentAccount) formData.append("gateway_account_id", String(currentAccount.id));
      formData.append("notes", `Payment via ${selectedGateway.name}${accountInfo}`);

      if (proofUrl) {
        formData.append("proof_url", proofUrl);
      }

      const res = await api.post("/user/deposit", formData);
      const transaction = res.data?.transaction;

      // "Submission received" email is now sent server-side from UserDepositApiController::store()
      // via EmailTemplateMailer (trigger: transaction_pending_deposit).
      setLastTransaction({
        transactionId: transaction?.id ? String(transaction.id) : "",
        type: "deposit",
        amount: amt,
        paymentMethod: selectedGateway.name,
      });
      setAmount("");
      setSelectedGateway(null);
      setProofUrl(null);
      setShowSuccessModal(true);
      // Deposit doesn't move the balance until admin approval, but refresh anyway so the header
      // (useAuth().user.balance) picks up anything that changed elsewhere while this form was open.
      refreshUser();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to submit deposit.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserLayout showBackButton>
      <div className="py-8 sm:py-16">
        <div className="mx-auto max-w-2xl px-4">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="text-center mb-6 sm:mb-8">
                <h1 className="font-display text-2xl font-bold tracking-wider gradient-text">
                  DEPOSIT
                </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Select a payment method and add funds to your wallet.
              </p>
            </div>

            {pendingOrder && (
              <div className={`mb-4 rounded-xl border p-4 flex items-start gap-3 ${
                pendingOrder.status === "completed"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : pendingOrder.status === "failed" || pendingOrder.status === "cancelled"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}>
                {pendingOrder.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 text-sm">
                  {pendingOrder.status === "completed" ? (
                    <p className="font-semibold text-emerald-500">
                      Payment confirmed! ${Number(pendingOrder.confirmedAmount || 0).toFixed(2)} has been added to your balance.
                    </p>
                  ) : pendingOrder.status === "failed" || pendingOrder.status === "cancelled" ? (
                    <p className="font-semibold text-destructive">Your deposit was not completed. Please try again.</p>
                  ) : (
                    <div>
                      <p className="font-semibold text-amber-500">Your deposit is still processing.</p>
                      <p className="text-xs text-muted-foreground mt-1">This usually only takes a minute. Your balance will update automatically once confirmed.</p>
                      <button
                        onClick={() => checkPendingOrder(pendingOrder.orderSn)}
                        disabled={checkingPending}
                        className="mt-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        {checkingPending ? "Checking..." : "Check again"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Deposit Mode Toggle */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setDepositMode("fast")}
                className={`rounded-xl border-2 p-3.5 flex items-center gap-2.5 transition-all ${
                  depositMode === "fast" ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <Zap className={`h-5 w-5 ${depositMode === "fast" ? "text-primary" : "text-muted-foreground"}`} />
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Instant Deposit</p>
                  <p className="text-[10px] text-muted-foreground">Cash App / Apple Pay / Google Pay</p>
                </div>
              </button>
              <button
                onClick={() => setDepositMode("manual")}
                className={`rounded-xl border-2 p-3.5 flex items-center gap-2.5 transition-all ${
                  depositMode === "manual" ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <FileText className={`h-5 w-5 ${depositMode === "manual" ? "text-primary" : "text-muted-foreground"}`} />
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Manual Deposit</p>
                  <p className="text-[10px] text-muted-foreground">Bank / Crypto / QR + screenshot</p>
                </div>
              </button>
            </div>

            {depositMode === "fast" ? (
              <div className="rounded-xl border border-border bg-card p-4 sm:p-6 glow-card">
                {!isVerified ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">Please verify your account to use Instant Deposit.</p>
                    <button
                      onClick={() => setShowVerifyModal(true)}
                      className="rounded-lg gradient-bg px-4 py-2 text-sm font-bold text-primary-foreground"
                    >
                      Verify Now
                    </button>
                  </div>
                ) : (
                  <FastPaymentSection />
                )}
              </div>
            ) : (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-6 glow-card space-y-5">
              {/* Payment Method Selection */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-3">
                  Select Payment Method
                </label>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading payment methods...</p>
                ) : gateways.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payment methods available. Please contact support.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {gateways.map((gw) => (
                      <PaymentMethodCard
                        key={gw.id}
                        gateway={gw}
                        selected={selectedGateway?.id === gw.id}
                        onSelect={() => handleSelectGateway(gw)}
                      />
                    ))}
                  </div>
                )}
                {depositErrors.gateway && <p className="text-xs text-destructive font-medium mt-1">{depositErrors.gateway}</p>}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Amount ($){" "}
                  {selectedGateway && (
                    <span className="text-muted-foreground font-normal">
                      — Min: ${selectedGateway.minimum_amount.toFixed(2)}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); if (depositErrors.amount) setDepositErrors(p => ({ ...p, amount: "" })); }}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                    depositErrors.amount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {depositErrors.amount && <p className="text-xs text-destructive font-medium mt-1">{depositErrors.amount}</p>}
              </div>

              {/* Payment Details */}
              {selectedGateway && (
                <PaymentDetails
                  gateway={selectedGateway}
                  account={currentAccount}
                  amount={amount}
                  onRequestNewAccount={handleRequestNewAccount}
                  noMoreAccounts={noMoreAccounts}
                  hasMultipleAccounts={hasMultipleAccounts}
                />
              )}

              {/* Screenshot Upload */}
              {selectedGateway && (
                <div>
                  <DepositScreenshotUpload
                    onUploadComplete={(url) => { setProofUrl(url); if (depositErrors.proof) setDepositErrors(p => ({ ...p, proof: "" })); }}
                    onRemove={() => setProofUrl(null)}
                    uploadedUrl={proofUrl}
                  />
                  {depositErrors.proof && <p className="text-xs text-destructive font-medium mt-1">{depositErrors.proof}</p>}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Available balance:{" "}
                <span className="font-semibold text-foreground">
                  ${balance.toFixed(2)} USD
                </span>
              </p>

              {/* Confirm Button — always visible, disabled until ready */}
              <div className="sticky bottom-4 z-10 space-y-1">
                <button
                  onClick={handleSubmit}
                  disabled={!canConfirm || submitting}
                  className="w-full rounded-xl gradient-bg py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                  <DollarSign className="h-4 w-4" />{" "}
                  {submitting ? "Submitting..." : "Confirm Deposit"}
                </button>
                {!canConfirm && selectedGateway && (
                  <p className="text-center text-[11px] font-medium text-amber-400">
                    {!amount || parseFloat(amount) <= 0
                      ? `⚠️ Please enter an amount ($${selectedGateway.minimum_amount.toFixed(2)} minimum) to confirm.`
                      : parseFloat(amount) < selectedGateway.minimum_amount
                      ? `⚠️ Minimum deposit for ${selectedGateway.name} is $${selectedGateway.minimum_amount.toFixed(2)}.`
                      : !proofUrl
                      ? "⚠️ Please upload a deposit screenshot to confirm."
                      : ""}
                  </p>
                )}
              </div>
            </div>
            )}
          </motion.div>
        </div>
      </div>
      <VerificationRequiredModal open={showVerifyModal} onClose={() => setShowVerifyModal(false)} />
      <TransactionSuccessModal
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        transaction={lastTransaction}
      />
      <DepositHelpModal open={showHelpModal} onClose={() => setShowHelpModal(false)} />
    </UserLayout>
  );
};

export default DepositPage;
