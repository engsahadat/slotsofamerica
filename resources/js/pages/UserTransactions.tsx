import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownToLine, ArrowUpFromLine, Gift, ArrowLeftRight,
  Loader2, Clock, CheckCircle, AlertCircle, XCircle,
  History, ChevronLeft, ChevronRight, Plus,
  DollarSign, Send, X, Calendar, Hash, FileText, ImageIcon, Ban,
} from "lucide-react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TABS = [
  { key: "all", label: "All", icon: History },
  { key: "deposit", label: "Deposit", icon: ArrowDownToLine },
  { key: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { key: "redeem", label: "Redeem", icon: Gift },
  { key: "withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { key: "rejected", label: "Rejected", icon: XCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  game_id: string | null;
  notes: string | null;
  failure_reason: string | null;
  deposit_proof_url: string | null;
  games: { name: string } | null;
  gateway: { name: string } | null;
}

const statusConfig: Record<string, { bg: string; icon: typeof Clock; label?: string }> = {
  pending: { bg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: Clock },
  approved: { bg: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle },
  completed: { bg: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle },
  rejected: { bg: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

// A user-cancelled withdrawal is stored as status "rejected" (the transactions.status enum has
// no separate "cancelled" value) — but showing that as red "Rejected" reads like an admin denial
// and confuses users who cancelled it themselves. Distinguish it by the fixed failure_reason
// UserWithdrawApiController::cancel() writes, with its own neutral (not alarming-red) styling.
const isSelfCancelled = (txn: Transaction) => txn.status === "rejected" && txn.failure_reason === "Cancelled by user.";
const getStatusDisplay = (txn: Transaction) => {
  if (isSelfCancelled(txn)) {
    return { bg: "bg-muted text-muted-foreground border-border", icon: Ban, label: "Cancelled" };
  }
  const cfg = statusConfig[txn.status] || statusConfig.pending;
  return { ...cfg, label: cfg.label || txn.status };
};

const typeConfig: Record<string, { bg: string; icon: typeof DollarSign }> = {
  deposit: { bg: "bg-green-500/10 text-green-400", icon: ArrowDownToLine },
  withdraw: { bg: "bg-orange-500/10 text-orange-400", icon: ArrowUpFromLine },
  redeem: { bg: "bg-purple-500/10 text-purple-400", icon: Gift },
  transfer: { bg: "bg-blue-500/10 text-blue-400", icon: ArrowLeftRight },
};

const PAGE_SIZE = 10;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3 } }),
};

// --- Helper: extract payment gateway from deposit notes ---
const getDepositGateway = (notes: string | null) => {
  if (!notes) return null;
  const match = notes.match(/Payment via (.+?) —/);
  return match ? match[1] : null;
};

// --- Helper: extract withdraw method name from withdraw notes ("Withdrawal request via X") ---
// Withdraw transactions have no direct gateway/method relation on this table (only deposits do),
// so this free-text parse is the only source for it.
const getWithdrawMethod = (notes: string | null) => {
  if (!notes) return null;
  const match = notes.match(/Withdrawal request via (.+)$/);
  return match ? match[1].trim() : null;
};

// --- Details column: real gateway name for deposits, parsed method name for withdrawals
// (no direct relation exists for those), and the destination game for transfer/redeem.
const getTxnDetail = (txn: Transaction): string => {
  if (txn.type === "deposit") return txn.gateway?.name || getDepositGateway(txn.notes) || "—";
  if (txn.type === "withdraw") return getWithdrawMethod(txn.notes) || "—";
  return txn.games?.name || "—";
};

const UserTransactions = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("type") as TabKey) || "all";
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? initialTab : "all"
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [proofModal, setProofModal] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Lets a user back out of a withdrawal that's still awaiting admin review — refunds the
  // amount reserved at submit time. Only offered while status is still "pending" (matches the
  // backend's own guard); once an admin has acted on it, this option disappears.
  const handleCancelWithdraw = async (txn: Transaction) => {
    if (!confirm(`Cancel this $${Number(txn.amount).toFixed(2)} withdrawal request? The amount will be refunded to your balance.`)) return;
    setCancellingId(txn.id);
    try {
      await api.post(`/user/withdraw/${txn.id}/cancel`);
      const cancelledFields = { status: "rejected", failure_reason: "Cancelled by user." };
      setTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, ...cancelledFields } : t)));
      setSelectedTxn((prev) => (prev && prev.id === txn.id ? { ...prev, ...cancelledFields } : prev));
      refreshUser(); // updates the header balance widget — it reads from AuthContext, not this page's own state
      toast({ title: "Withdrawal cancelled", description: "Your balance has been refunded." });
    } catch (err: any) {
      toast({
        title: "Could not cancel",
        description: err.response?.data?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchTransactions = async () => {
      try {
        const res = await api.get("/user/transactions", { params: { per_page: 500 } });
        const rows = (res.data?.data || []) as any[];
        setTransactions(rows.map((r) => ({ ...r, games: r.game ? { name: r.game.name } : null, gateway: r.gateway ? { name: r.gateway.name } : null })));
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
    // TODO: realtime updates not yet backed by a Laravel broadcast/websocket setup (deferred).
    // Falls back to the one-time fetch above; no live updates until this is built.
  }, [user]);

  // Reset page on tab change
  useEffect(() => { setPage(1); }, [activeTab]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return transactions;
    if (activeTab === "rejected") return transactions.filter((t) => t.status === "rejected");
    return transactions.filter((t) => t.type === activeTab);
  }, [activeTab, transactions]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const totalDeposits = transactions.filter((t) => t.type === "deposit" && (t.status === "approved" || t.status === "completed")).reduce((s, t) => s + Number(t.amount), 0);
  const totalWithdrawn = transactions.filter((t) => t.type === "withdraw" && (t.status === "approved" || t.status === "completed")).reduce((s, t) => s + Number(t.amount), 0);
  const totalRedeemed = transactions.filter((t) => t.type === "redeem" && (t.status === "approved" || t.status === "completed")).reduce((s, t) => s + Number(t.amount), 0);
  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  const stats = [
    { label: "Total Deposited", value: `$${totalDeposits.toFixed(2)}`, icon: ArrowDownToLine, color: "bg-green-500/10 text-green-400" },
    { label: "Total Withdrawn", value: `$${totalWithdrawn.toFixed(2)}`, icon: ArrowUpFromLine, color: "bg-orange-500/10 text-orange-400" },
    { label: "Total Redeemed", value: `$${totalRedeemed.toFixed(2)}`, icon: Gift, color: "bg-purple-500/10 text-purple-400" },
    { label: "Pending", value: String(pendingCount), icon: Clock, color: "bg-yellow-500/10 text-yellow-400" },
  ];

  const quickActions = [
    { label: "Deposit", icon: ArrowDownToLine, path: "/deposit", color: "from-green-600 to-green-500" },
    { label: "Withdraw", icon: ArrowUpFromLine, path: "/withdraw", color: "from-orange-600 to-orange-500" },
    { label: "Redeem", icon: Gift, path: "/redeem", color: "from-purple-600 to-purple-500" },
    { label: "Transfer", icon: Send, path: "/transfer", color: "from-blue-600 to-blue-500" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6 animate-slide-in">
      {/* Header + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Transactions</h1>
          <p className="text-muted-foreground mt-1 text-sm">Track all your deposits, withdrawals, redeems & transfers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r ${a.color} px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity`}
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial="hidden" animate="visible" variants={fadeUp} custom={i}
              className="rounded-xl border border-border bg-card p-4 glow-card">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{s.label}</p>
                  <p className="text-lg font-display font-bold">{s.value}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const count =
            tab.key === "all" ? transactions.length
            : tab.key === "rejected" ? transactions.filter((t) => t.status === "rejected").length
            : transactions.filter((t) => t.type === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "gradient-bg text-primary-foreground shadow-lg"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${isActive ? "bg-primary-foreground/20" : "bg-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Transaction List */}
      <div className="rounded-xl border border-border bg-card glow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <History className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No transactions found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {paginated.map((txn, i) => {
                      const type = typeConfig[txn.type] || typeConfig.deposit;
                      const status = getStatusDisplay(txn);
                      const TypeIcon = type.icon;
                      const StatusIcon = status.icon;
                      const detailLabel = getTxnDetail(txn);
                      return (
                        <motion.tr key={txn.id} initial="hidden" animate="visible" exit="hidden" variants={fadeUp} custom={i}
                          onClick={() => setSelectedTxn(txn)}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${type.bg}`}>
                                <TypeIcon className="h-4 w-4" />
                              </div>
                              <span className="font-medium capitalize">{txn.type}</span>
                              {txn.type === "deposit" && txn.deposit_proof_url && (
                                <span title="Proof attached"><ImageIcon className="h-3.5 w-3.5 text-primary/60" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground">
                            <span className="truncate block max-w-[180px]" title={detailLabel}>{detailLabel}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-display font-bold">${Number(txn.amount).toFixed(2)}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${status.bg}`}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground text-xs">
                            {new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {paginated.map((txn, i) => {
                  const type = typeConfig[txn.type] || typeConfig.deposit;
                  const status = getStatusDisplay(txn);
                  const TypeIcon = type.icon;
                  const StatusIcon = status.icon;
                  const detailLabel = getTxnDetail(txn);
                  return (
                    <motion.div key={txn.id} initial="hidden" animate="visible" exit="hidden" variants={fadeUp} custom={i}
                      onClick={() => setSelectedTxn(txn)}
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type.bg}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold capitalize flex items-center gap-1.5">
                            {txn.type}
                            {txn.type === "deposit" && txn.deposit_proof_url && (
                              <span title="Proof attached"><ImageIcon className="h-3 w-3 text-primary/60" /></span>
                            )}
                          </p>
                          <p className="text-sm font-display font-bold">${Number(txn.amount).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                            {detailLabel} · {new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${status.bg}`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`e${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                            page === p
                              ? "gradient-bg text-primary-foreground shadow"
                              : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTxn} onOpenChange={(open) => !open && setSelectedTxn(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          {selectedTxn && (() => {
            const type = typeConfig[selectedTxn.type] || typeConfig.deposit;
            const status = getStatusDisplay(selectedTxn);
            const TypeIcon = type.icon;
            const StatusIcon = status.icon;
            const detailLabel = getTxnDetail(selectedTxn);

            // Parse notes into key-value pairs for withdraw
            const noteEntries = selectedTxn.notes
              ? selectedTxn.notes.split(" | ").map((s) => {
                  const idx = s.indexOf(": ");
                  return idx > -1 ? { key: s.slice(0, idx), value: s.slice(idx + 2) } : { key: "Note", value: s };
                })
              : [];

            return (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${type.bg}`}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="capitalize">{selectedTxn.type}</span>
                      <p className="text-xs text-muted-foreground font-normal mt-0.5">Transaction Details</p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-5 space-y-4">
                  {/* Amount */}
                  <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
                    <p className="text-3xl font-display font-bold">${Number(selectedTxn.amount).toFixed(2)}</p>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="h-3 w-3" />Status</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${status.bg}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {selectedTxn.type === "deposit" || selectedTxn.type === "withdraw" ? <DollarSign className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
                        {selectedTxn.type === "deposit" ? "Payment Method" : selectedTxn.type === "withdraw" ? "Withdraw Method" : "Game"}
                      </span>
                      <span className="text-sm font-medium">{detailLabel}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3 w-3" />Date</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedTxn.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" />Time</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedTxn.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="h-3 w-3" />ID</span>
                      <span className="text-xs font-mono text-muted-foreground">{String(selectedTxn.id).slice(0, 8)}…</span>
                    </div>
                    </div>

                    {/* Cancel — only while a withdrawal is still awaiting admin review */}
                    {selectedTxn.type === "withdraw" && selectedTxn.status === "pending" && (
                      <button
                        onClick={() => handleCancelWithdraw(selectedTxn)}
                        disabled={cancellingId === selectedTxn.id}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive py-2.5 text-sm font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-50"
                      >
                        {cancellingId === selectedTxn.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                        Cancel Withdrawal
                      </button>
                    )}

                    {/* Deposit Proof */}
                    {selectedTxn.type === "deposit" && selectedTxn.deposit_proof_url && (
                      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deposit Proof</p>
                        <button onClick={() => setProofModal(selectedTxn.deposit_proof_url)} className="group">
                          <img
                            src={selectedTxn.deposit_proof_url}
                            alt="Deposit proof"
                            className="h-24 w-auto rounded-lg object-cover border border-border group-hover:border-primary transition-colors"
                          />
                        </button>
                      </div>
                    )}

                  {/* Notes */}
                  {noteEntries.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> Notes
                      </p>
                      {noteEntries.map((entry, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-4">
                          <span className="text-xs text-muted-foreground shrink-0">{entry.key}</span>
                          <span className="text-xs text-foreground text-right break-all">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Proof Image Modal */}
      <Dialog open={!!proofModal} onOpenChange={() => setProofModal(null)}>
        <DialogContent className="sm:max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Deposit Proof</DialogTitle>
          </DialogHeader>
          {proofModal && (
            <img
              src={proofModal}
              alt="Deposit proof"
              className="max-h-[60vh] w-full rounded-lg object-contain border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserTransactions;
