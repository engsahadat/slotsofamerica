import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import api from "@/services/api";

import { useAuth } from "@/contexts/AuthContext";
import { UserLayout } from "@/components/UserLayout";
import { toast } from "@/hooks/use-toast";
import { useVerificationCheck } from "@/hooks/useVerificationCheck";
import { VerificationRequiredModal } from "@/components/VerificationRequiredModal";
import { TransactionSuccessModal } from "@/components/TransactionSuccessModal";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const TransferPage = () => {
  const { user, refreshUser } = useAuth();
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [gameId, setGameId] = useState("");
  const [gameUsername, setGameUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{ transactionId: string; type: string; amount: number; paymentMethod: string } | null>(null);
  const { isVerified } = useVerificationCheck();

  const [approvedRequests, setApprovedRequests] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    // Only show games where user has approved access. There is no dedicated
    // "list my unlock requests" endpoint, but /api/user/dashboard already
    // returns them (UserDashboardApiController@index -> unlock_requests, each
    // with its `game` relation eager-loaded).
    api.get("/user/dashboard").then((res) => {
      const requests = (res.data?.unlock_requests || []) as any[];
      const approved = requests.filter((r) => r.status === "approved" && r.game);
      const uniqueGames = approved.map((r) => ({ id: r.game.id, name: r.game.name }));
      setGames(uniqueGames);
      const usernameMap: Record<string, string> = {};
      approved.forEach((r) => { usernameMap[r.game_id] = r.username || ""; });
      setApprovedRequests(usernameMap);
    }).catch(() => {});
    // balance already lives on the authenticated user object (useAuth().user.balance)
    setBalance(Number(user.balance) || 0);
  }, [user]);

  // When game is selected, resolve the user's username for that game from the
  // approved-requests map fetched above (no extra request needed).
  useEffect(() => {
    if (!gameId || !user) { setGameUsername(""); return; }
    setGameUsername(approvedRequests[gameId] || "");
  }, [gameId, user, approvedRequests]);

  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    if (!isVerified) {
      setShowVerifyModal(true);
      return;
    }
    const amt = parseFloat(amount);
    const errs: Record<string, string> = {};
    if (!gameId) errs.game = "Please select a game";
    if (!amount || isNaN(amt) || amt <= 0) errs.amount = "Please enter a valid amount";
    else if (amt > balance) errs.amount = "Insufficient balance for transfer";
    if (Object.keys(errs).length > 0) {
      setTransferErrors(errs);
      return;
    }
    setTransferErrors({});
    setSubmitting(true);
    // Fresh key per submit attempt — lets the backend recognize (and safely no-op) a literal
    // duplicate/retried request instead of reserving the wallet balance a second time.
    const idempotencyKey = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    try {
      const res = await api.post("/user/transfer", {
        game_id: gameId,
        amount: amt,
        notes: `Transfer for game account: ${gameUsername}`,
        idempotency_key: idempotencyKey,
      });
      const txn = res.data?.transaction;
      const selectedGame = games.find(g => g.id === gameId);
      const isInstant = !!res.data?.instant;
      // "Submission received" email is sent server-side (transaction_pending_transfer trigger)
      // for the fallback pending path; the instant path fires its own approved/rejected trigger.
      setLastTransaction({
        transactionId: txn?.id != null ? String(txn.id) : "",
        type: "transfer",
        amount: amt,
        paymentMethod: selectedGame?.name || "Game Transfer",
      });
      setAmount("");
      setShowSuccessModal(true);
      if (isInstant) {
        toast({ title: "Recharge Completed", description: res.data?.message || "Your recharge was completed instantly." });
      }
      // Transfer reserves/deducts the balance immediately (not on admin approval), so the header
      // balance (sourced from useAuth().user.balance) needs a real refresh here — it was never
      // being refetched after any transaction action, so it stayed stale until next full login.
      if (res.data?.new_balance != null) setBalance(Number(res.data.new_balance));
      refreshUser();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
      // An instant recharge that failed still refunds the wallet server-side — refresh so the
      // displayed balance doesn't look permanently reduced while the request was in flight.
      if (err.response?.data?.new_balance != null) setBalance(Number(err.response.data.new_balance));
      refreshUser();
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
              <h1 className="font-display text-2xl font-bold tracking-wider gradient-text">TRANSFER</h1>
              <p className="mt-2 text-sm text-muted-foreground">Transfer funds to your gaming account.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 glow-card space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Select Game</label>
                <select
                  value={gameId}
                  onChange={(e) => { setGameId(e.target.value); if (transferErrors.game) setTransferErrors(p => ({ ...p, game: "" })); }}
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors appearance-none ${
                    transferErrors.game ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                >
                  <option value="" className="bg-card text-muted-foreground">Select a game</option>
                  {games.map((g) => <option key={g.id} value={g.id} className="bg-card">{g.name}</option>)}
                </select>
                {transferErrors.game && <p className="text-xs text-destructive font-medium mt-1">{transferErrors.game}</p>}
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
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Amount ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); if (transferErrors.amount) setTransferErrors(p => ({ ...p, amount: "" })); }}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                    transferErrors.amount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {transferErrors.amount && <p className="text-xs text-destructive font-medium mt-1">{transferErrors.amount}</p>}
              </div>
              <p className="text-[11px] text-muted-foreground">Available balance: <span className="font-semibold text-foreground">${balance.toFixed(2)} USD</span></p>
              <button onClick={handleSubmit} disabled={submitting || !gameId}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50">
                <Send className="h-4 w-4" /> {submitting ? "Submitting..." : "Transfer Now"}
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

export default TransferPage;
