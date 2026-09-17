import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, ArrowLeft } from "lucide-react";
import api from "@/services/api";

import { useAuth } from "@/contexts/AuthContext";
import { UserLayout } from "@/components/UserLayout";
import { toast } from "@/hooks/use-toast";
import { useVerificationCheck } from "@/hooks/useVerificationCheck";
import { VerificationRequiredModal } from "@/components/VerificationRequiredModal";
import { TransactionSuccessModal } from "@/components/TransactionSuccessModal";
import { validateRedeemSubmission } from "@/lib/redeemRules";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const RedeemPage = () => {
  const { user, refreshUser } = useAuth();
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [gameId, setGameId] = useState("");
  const [gameUsername, setGameUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [redeemMin, setRedeemMin] = useState(40);
  const [redeemMax, setRedeemMax] = useState(300);
  const [todayRedeemed, setTodayRedeemed] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<{ transactionId: string; type: string; amount: number; paymentMethod: string } | null>(null);
  const { isVerified } = useVerificationCheck();

  const [approvedRequests, setApprovedRequests] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    // Only show games where user has approved access. There is no dedicated "list my unlock
    // requests" endpoint, but /api/user/dashboard already returns them (unlock_requests, each
    // with its `game` relation eager-loaded).
    api.get("/user/dashboard").then((res) => {
      const requests = (res.data?.unlock_requests || []) as any[];
      const approved = requests.filter((r) => r.status === "approved" && r.game);
      setGames(approved.map((r) => ({ id: r.game.id, name: r.game.name })));
      const usernameMap: Record<string, string> = {};
      approved.forEach((r) => { usernameMap[r.game_id] = r.username || ""; });
      setApprovedRequests(usernameMap);
    }).catch(() => {});
    // balance already lives on the authenticated user object (useAuth().user.balance)
    setBalance(Number(user.balance) || 0);

    fetchLimitsAndToday();
  }, [user]);

  const fetchLimitsAndToday = async () => {
    if (!user) return;
    try {
      const res = await api.get("/user/redeem/rewards");
      if (res.data?.limits) {
        setRedeemMin(Number(res.data.limits.min_amount) || 40);
        setRedeemMax(Number(res.data.limits.max_amount) || 300);
      }
      setTodayRedeemed(Number(res.data?.today_total) || 0);
    } catch {
      // keep component defaults
    }
  };

  useEffect(() => {
    if (!gameId || !user) { setGameUsername(""); return; }
    setGameUsername(approvedRequests[gameId] || "");
  }, [gameId, user, approvedRequests]);

  const [redeemErrors, setRedeemErrors] = useState<Record<string, string>>({});

  const handleContinue = () => {
    if (!isVerified) {
      setShowVerifyModal(true);
      return;
    }
    const amt = parseFloat(amount);
    const errs: Record<string, string> = {};
    if (!gameId) errs.game = "Please select a game";
    if (!amount || isNaN(amt)) errs.amount = "Please enter a valid amount";

    if (!errs.amount && amount) {
      const result = validateRedeemSubmission({
        amount: amt,
        redeemMin,
        redeemMax,
        todaysTxns: [{ amount: todayRedeemed, status: "pending", created_at: new Date() }],
      });
      if (!result.ok) {
        errs.amount = result.reason!;
      }
    }

    if (Object.keys(errs).length > 0) {
      setRedeemErrors(errs);
      return;
    }
    setRedeemErrors({});
    setShowConfirm(true);
  };

  const selectedGameName = games.find((g) => g.id === gameId)?.name || "";

  const handleSubmit = async () => {
    setSubmitting(true);
    // Fresh key per submit attempt — lets the backend recognize (and safely no-op) a literal
    // duplicate/retried request instead of contacting the game provider a second time.
    const idempotencyKey = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    try {
      const res = await api.post("/user/redeem/request", {
        game_id: gameId,
        amount: parseFloat(amount),
        notes: `Redeem for username: ${gameUsername}`,
        idempotency_key: idempotencyKey,
      });
      const txn = res.data?.transaction;
      const isInstant = !!res.data?.instant;
      // "Submission received" email is sent server-side (transaction_pending_redeem trigger)
      // for the fallback pending path; the instant path fires its own approved/rejected trigger.
      setLastTransaction({
        transactionId: txn?.id != null ? String(txn.id) : "",
        type: "redeem",
        amount: parseFloat(amount),
        paymentMethod: selectedGameName || "Game Redeem",
      });
      setAmount("");
      setShowConfirm(false);
      fetchLimitsAndToday();
      setShowSuccessModal(true);
      if (isInstant) {
        toast({ title: "Redeem Completed", description: res.data?.message || "Your redeem was completed instantly." });
      }
      // Redeem only moves the balance once confirmed (instantly here, or on admin approval for
      // non-automated games) — refresh either way so the header balance stays accurate.
      refreshUser();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
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
              <h2 className="font-display text-2xl font-bold tracking-wider gradient-text">REDEEM</h2>
              <p className="mt-2 text-sm text-muted-foreground">Convert your in-game earnings to wallet balance.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 glow-card space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Select Game</label>
                <select
                  value={gameId}
                  onChange={(e) => { setGameId(e.target.value); if (redeemErrors.game) setRedeemErrors(p => ({ ...p, game: "" })); }}
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors appearance-none ${
                    redeemErrors.game ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                >
                  <option value="" className="bg-card text-muted-foreground">Select a game</option>
                  {games.map((g) => <option key={g.id} value={g.id} className="bg-card">{g.name}</option>)}
                </select>
                {redeemErrors.game && <p className="text-xs text-destructive font-medium mt-1">{redeemErrors.game}</p>}
              </div>
              {gameUsername && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Game Username</label>
                  <div className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground">
                    {gameUsername}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Amount Earned ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); if (redeemErrors.amount) setRedeemErrors(p => ({ ...p, amount: "" })); }}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                    redeemErrors.amount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {redeemErrors.amount && <p className="text-xs text-destructive font-medium mt-1">{redeemErrors.amount}</p>}
              </div>
              <p className="text-[11px] text-muted-foreground">Available balance: <span className="font-semibold text-foreground">${balance.toFixed(2)} USD</span></p>
              <p className="text-[11px] text-muted-foreground">Min <span className="font-semibold text-foreground">${redeemMin}</span> per request · Daily limit <span className="font-semibold text-foreground">${redeemMax}</span> per user.</p>
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Redeemed today</span>
                  <span className="text-xs font-semibold text-primary">${todayRedeemed.toFixed(2)} <span className="text-[10px] text-muted-foreground font-normal">/ ${redeemMax.toFixed(2)}</span></span>
                </div>
                {(() => {
                  const pct = redeemMax > 0 ? Math.min(100, (todayRedeemed / redeemMax) * 100) : 0;
                  const barColor = pct >= 100 ? "bg-destructive" : pct >= 75 ? "bg-yellow-500" : "bg-gradient-to-r from-primary to-primary/70";
                  return (
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${barColor}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{redeemMax > 0 ? Math.min(100, Math.round((todayRedeemed / redeemMax) * 100)) : 0}% used</span>
                  <span>Remaining: <span className="font-semibold text-foreground">${Math.max(0, redeemMax - todayRedeemed).toFixed(2)}</span></span>
                </div>
              </div>
              <button onClick={handleContinue}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50">
                <Gift className="h-4 w-4" /> Continue
              </button>
            </div>

            {/* Confirmation Step */}
            {showConfirm && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-xl border border-primary/30 bg-card p-6 glow-card space-y-4"
              >
                <h3 className="text-sm font-bold text-foreground text-center">Confirm Redeem Request</h3>
                <div className="space-y-2 rounded-lg bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Game</span>
                    <span className="font-medium text-foreground">{selectedGameName}</span>
                  </div>
                  {gameUsername && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Username</span>
                      <span className="font-medium text-foreground">{gameUsername}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold text-primary">${parseFloat(amount).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  This amount will be added to your wallet after admin approval.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowConfirm(false)}
                    className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex-1 rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50">
                    <Gift className="h-4 w-4" /> {submitting ? "Submitting..." : "Redeem Now"}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
      <VerificationRequiredModal open={showVerifyModal} onClose={() => setShowVerifyModal(false)} />
      <TransactionSuccessModal open={showSuccessModal} onClose={() => setShowSuccessModal(false)} transaction={lastTransaction} />
    </UserLayout>
  );
};

export default RedeemPage;
