import { useState, useEffect } from "react";
import { KeyRound, ChevronDown, Loader2, ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, Shield, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRealtime } from "@/hooks/useUserRealtime";
import { toast } from "@/hooks/use-toast";
import { passwordRequestSchema, parseApiError } from "@/lib/validation";
import { TransactionSuccessModal } from "@/components/TransactionSuccessModal";

interface GameAccount {
  id: string;
  game_id: string;
  username: string;
  game_name: string;
}

interface PasswordRequest {
  id: string;
  status: string;
  created_at: string;
  game_account_id: string;
  rejection_reason?: string;
  game_name?: string;
  account_username?: string;
}

const statusConfig: Record<string, { bg: string; icon: typeof Clock; label: string }> = {
  pending: { bg: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20", icon: Clock, label: "Pending" },
  approved: { bg: "bg-green-500/10 text-green-400 border border-green-500/20", icon: CheckCircle, label: "Completed" },
  rejected: { bg: "bg-destructive/10 text-destructive border border-destructive/20", icon: XCircle, label: "Rejected" },
};

const USER_PAGE_SIZE = 10;

// Maps a raw /user/games/password-requests row (PasswordRequest model with gameAccount.game
// eager-loaded) into the shape this page renders. Reads straight from the real relation instead
// of joining against the locally-loaded "currently approved accounts" list, so history for an
// account that's since been reassigned/removed still shows a real game/username, not "—".
function mapPasswordRequest(r: any): PasswordRequest {
  return {
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    game_account_id: r.game_account_id,
    rejection_reason: r.rejection_reason,
    account_username: r.game_account?.username || "—",
    game_name: r.game_account?.game?.name || "—",
  };
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3 } }),
};

const UserPasswordRequests = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<PasswordRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Get approved game access requests as user's game accounts. UserDashboardApiController@index
      // already eager-loads each unlock request's 'game' relation, so it's used here directly.
      const dashRes = await api.get("/user/dashboard");
      const unlockRequests = (dashRes.data?.unlock_requests || []) as any[];
      const mapped = unlockRequests
        .filter((r) => r.status === "approved")
        .map((r) => ({
          id: r.id,
          game_id: r.game_id,
          username: r.username,
          game_name: r.game?.name || "Game",
        })) as GameAccount[];
      setAccounts(mapped);
      if (mapped.length > 0) setSelectedAccount(mapped[0].id);

      const reqRes = await api.get("/user/games/password-requests", { params: { per_page: USER_PAGE_SIZE, page: 1 } });
      setRequests(((reqRes.data?.data || []) as any[]).map(mapPasswordRequest));
      setTotalCount(reqRes.data?.total || 0);
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Realtime: instant status updates for this user's password & game-access rows
  useUserRealtime(user?.id, {
    channelKey: "password-requests-page",
    onPasswordRequest: (payload) => {
      const acctMap = new Map(accounts.map((a) => [a.id, a]));
      const enrich = (r: any): PasswordRequest => {
        const acct = acctMap.get(r.game_account_id);
        return { ...r, account_username: acct?.username || "—", game_name: acct?.game_name || "—" };
      };
      if (payload.eventType === "INSERT") {
        const r: any = payload.new;
        setRequests((prev) => prev.some((x) => x.id === r.id) ? prev : [enrich(r), ...prev]);
        setTotalCount((c) => c + 1);
      } else if (payload.eventType === "UPDATE") {
        const r: any = payload.new;
        setRequests((prev) => prev.map((x) => (x.id === r.id ? enrich(r) : x)));
      } else if (payload.eventType === "DELETE") {
        const r: any = payload.old;
        setRequests((prev) => prev.filter((x) => x.id !== r.id));
        setTotalCount((c) => Math.max(0, c - 1));
      }
    },
    onGameAccess: (payload) => {
      // If a new game gets approved, reflect it in the account dropdown
      const row: any = payload.new || payload.old;
      if (!row) return;
      if (payload.eventType === "UPDATE" && row.status === "approved") {
        setAccounts((prev) => prev.some((a) => a.id === row.id) ? prev : [...prev, { id: row.id, game_id: row.game_id, username: row.username, game_name: "Game" }]);
      } else if (payload.eventType === "DELETE" || (payload.eventType === "UPDATE" && row.status !== "approved")) {
        setAccounts((prev) => prev.filter((a) => a.id !== row.id));
      }
    },
  });

  const currentAccount = accounts.find((a) => a.id === selectedAccount);

  const stats = {
    total: totalCount,
    pending: requests.filter((r) => r.status === "pending").length,
    completed: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  const [passErrors, setPassErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccount) return;

    const errs: Record<string, string> = {};
    if (!newPassword.trim()) {
      errs.password = "New Password is required";
    } else if (newPassword.length < 6) {
      errs.password = "Password must be at least 6 characters";
    }
    if (newPassword !== confirmPassword) {
      errs.confirm = "Passwords do not match";
    }

    if (Object.keys(errs).length > 0) {
      setPassErrors(errs);
      return;
    }
    setPassErrors({});

    setSubmitting(true);
    try {
      await api.post("/user/games/password-reset", {
        game_account_id: selectedAccount,
        requested_password: newPassword,
      });

      setShowSuccessModal(true);
      setNewPassword("");
      setConfirmPassword("");
      const reqRes = await api.get("/user/games/password-requests", { params: { per_page: USER_PAGE_SIZE, page: 1 } });
      setRequests(((reqRes.data?.data || []) as any[]).map(mapPasswordRequest));
      setTotalCount(reqRes.data?.total || 0);
      setPage(0);
    } catch (err) {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    }
    setSubmitting(false);
  };

  const fetchPage = async (p: number) => {
    if (!user) return;
    setPage(p);
    const reqRes = await api.get("/user/games/password-requests", { params: { per_page: USER_PAGE_SIZE, page: p + 1 } });
    setRequests(((reqRes.data?.data || []) as any[]).map(mapPasswordRequest));
  };

  const statCards = [
    { label: "Total Requests", value: stats.total, icon: KeyRound, color: "text-primary" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-400" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-400" },
    { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-wide flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Password Requests
        </h1>
        <p className="text-muted-foreground mt-1">Request a password change for your game accounts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-border bg-card p-4 glow-card"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-2xl font-bold font-display">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Submit form */}
      <div className="rounded-xl border border-border bg-card p-6 glow-card max-w-lg">
        <h2 className="font-display text-base font-semibold tracking-wide mb-5 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          New Request
        </h2>

        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No game accounts assigned to you yet.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Game Account</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <span>
                    {currentAccount
                      ? `${currentAccount.game_name} — ${currentAccount.username}`
                      : "Select account"}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-card shadow-xl">
                    <ul className="py-1">
                      {accounts.map((acct) => (
                        <li key={acct.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedAccount(acct.id); setDropdownOpen(false); }}
                            className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                              selectedAccount === acct.id ? "text-primary font-medium" : "text-foreground"
                            }`}
                          >
                            {acct.game_name} — {acct.username}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (passErrors.password) setPassErrors(p => ({ ...p, password: "" })); }}
                  placeholder="Enter new password (min 6 characters)"
                  className={`w-full rounded-lg border bg-muted/50 px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
                    passErrors.password ? "border-destructive focus:border-destructive" : "border-input focus:border-primary"
                  }`}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passErrors.password && <p className="text-xs text-destructive font-medium mt-1">{passErrors.password}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (passErrors.confirm) setPassErrors(p => ({ ...p, confirm: "" })); }}
                  placeholder="Confirm new password"
                  className={`w-full rounded-lg border bg-muted/50 px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
                    passErrors.confirm ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passErrors.confirm && <p className="text-xs text-destructive font-medium mt-1">{passErrors.confirm}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting || !newPassword || !confirmPassword}
              className="w-full rounded-lg gradient-bg py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Password Change Request
            </button>
          </form>
        )}
      </div>

      {/* Request history */}
      <div className="rounded-xl border border-border bg-card p-6 glow-card">
        <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-4">
          Request History
        </h3>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <KeyRound className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No requests yet. Submit your first password change request above.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Game</th>
                    <th className="pb-3 pr-4 font-medium">Account</th>
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((req, i) => {
                    const cfg = statusConfig[req.status] || statusConfig.pending;
                    const Icon = cfg.icon;
                    return (
                      <motion.tr
                        key={req.id}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                        className="group"
                      >
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <KeyRound className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="font-medium text-foreground">
                              {req.game_name || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-xs text-muted-foreground">
                          {req.account_username || "—"}
                        </td>
                        <td className="py-3.5 pr-4 text-muted-foreground text-xs">
                          {new Date(req.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                          {req.status === "rejected" && req.rejection_reason && (
                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">{req.rejection_reason}</p>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {requests.map((req, i) => {
                const cfg = statusConfig[req.status] || statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={req.id}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <KeyRound className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{req.game_name || "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{req.account_username || "—"}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    {req.status === "rejected" && req.rejection_reason && (
                      <p className="text-xs text-muted-foreground bg-destructive/5 rounded-md p-2">{req.rejection_reason}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {totalCount > USER_PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <p className="text-xs text-muted-foreground">
              Showing {page * USER_PAGE_SIZE + 1}–{Math.min((page + 1) * USER_PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" /> Previous
              </button>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={(page + 1) * USER_PAGE_SIZE >= totalCount}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
      <TransactionSuccessModal open={showSuccessModal} onClose={() => setShowSuccessModal(false)} />
    </div>
  );
};

export default UserPasswordRequests;
