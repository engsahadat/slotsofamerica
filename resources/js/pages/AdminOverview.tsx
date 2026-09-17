import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Gamepad2, ArrowLeftRight, KeyRound, Loader2, ArrowRight, Clock, ChevronRight, ShieldCheck, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Gift } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";




interface PendingTransaction {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  username?: string;
}

interface PendingPasswordReq {
  id: string;
  created_at: string;
  username?: string;
  game_name?: string;
}

const typeColors: Record<string, string> = {
  deposit: "bg-green-500/10 text-green-400 border-green-500/20",
  withdraw: "bg-destructive/10 text-destructive border-destructive/20",
  transfer: "bg-primary/10 text-primary border-primary/20",
  redeem: "bg-secondary/10 text-secondary border-secondary/20",
};

const AdminOverview = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalGames, setTotalGames] = useState(0);


  const [pendingTxns, setPendingTxns] = useState<PendingTransaction[]>([]);
  const [pendingTxnCount, setPendingTxnCount] = useState(0);
  const [pendingTxnCounts, setPendingTxnCounts] = useState<Record<string, number>>({ deposit: 0, transfer: 0, redeem: 0, withdraw: 0 });
  const [pendingPwReqs, setPendingPwReqs] = useState<PendingPasswordReq[]>([]);
  const [pendingPwCount, setPendingPwCount] = useState(0);
  const [pendingGameAccessCount, setPendingGameAccessCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<{ id: string; username: string | null; created_at: string }[]>([]);

  const fetchAll = async () => {
    const [overviewRes, gamesRes, pendingTxnsRes, gameAccessRes, usersRes] = await Promise.all([
      api.get("/admin/overview"),
      api.get("/admin/games"),
      api.get("/admin/transactions", { params: { status: "pending" } }),
      api.get("/admin/game-access"),
      api.get("/admin/users"),
    ]);

    const stats = overviewRes.data?.stats || {};
    setTotalUsers(stats.total_users || 0);

    const games = (gamesRes.data?.games || []) as any[];
    setTotalGames(games.filter((g) => g.is_active).length);

    const pendingTxnList = (pendingTxnsRes.data?.transactions || []) as any[];
    setPendingTxns(
      pendingTxnList.slice(0, 5).map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        created_at: t.created_at,
        username: t.user?.username || t.user?.name || "Unknown",
      }))
    );
    setPendingTxnCount(stats.pending_transactions || pendingTxnList.length || 0);

    // Per-type pending counts, via the same dedicated endpoint AdminTransactions.tsx uses.
    const pendingCountsRes = await api.get("/admin/transactions/pending-counts");
    const counts = (pendingCountsRes.data?.counts || {}) as Record<string, number>;
    setPendingTxnCounts({
      deposit: counts.deposit || 0,
      transfer: counts.transfer || 0,
      redeem: counts.redeem || 0,
      withdraw: counts.withdraw || 0,
    });

    const passwordRequests = (gameAccessRes.data?.password_requests || []) as any[];
    const pendingPw = passwordRequests.filter((r) => r.status === "pending");
    setPendingPwReqs(
      pendingPw.slice(0, 5).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        username: r.user?.username || r.user?.name || "Unknown",
        game_name: r.game_account?.game?.name || "—",
      }))
    );
    setPendingPwCount(pendingPw.length);

    setPendingGameAccessCount(stats.pending_unlocks || 0);

    const usersList = (usersRes.data?.data || []) as any[];
    setRecentUsers(usersList.slice(0, 5).map((u: any) => ({ id: u.id, username: u.username, created_at: u.created_at })));

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // No realtime push infrastructure in this app — stats refresh on mount/navigation only.
  }, []);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-wide">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, <span className="text-foreground font-medium capitalize">{user?.email?.split("@")[0] || "Admin"}</span>
        </p>
      </div>

      {/* Action Required - broken down by category */}
      {(pendingTxnCount > 0 || pendingPwCount > 0 || pendingGameAccessCount > 0) && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <AlertTriangle className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Action Required</p>
              <p className="text-[11px] text-muted-foreground">
                {pendingTxnCount + pendingPwCount + pendingGameAccessCount} pending item{(pendingTxnCount + pendingPwCount + pendingGameAccessCount) !== 1 ? "s" : ""} need review
              </p>
            </div>
          </div>
          {/* Cards grid */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { key: "deposit", label: "Deposit", count: pendingTxnCounts.deposit, icon: ArrowDownToLine, iconBg: "bg-green-500/15", iconColor: "text-green-400", borderColor: "border-green-500/15 hover:border-green-500/40", href: "/admin/transactions?type=deposit" },
                { key: "transfer", label: "Transfer", count: pendingTxnCounts.transfer, icon: ArrowLeftRight, iconBg: "bg-blue-500/15", iconColor: "text-blue-400", borderColor: "border-blue-500/15 hover:border-blue-500/40", href: "/admin/transactions?type=transfer" },
                { key: "redeem", label: "Redeem", count: pendingTxnCounts.redeem, icon: Gift, iconBg: "bg-purple-500/15", iconColor: "text-purple-400", borderColor: "border-purple-500/15 hover:border-purple-500/40", href: "/admin/transactions?type=redeem" },
                { key: "withdraw", label: "Withdraw", count: pendingTxnCounts.withdraw, icon: ArrowUpFromLine, iconBg: "bg-orange-500/15", iconColor: "text-orange-400", borderColor: "border-orange-500/15 hover:border-orange-500/40", href: "/admin/transactions?type=withdraw" },
                { key: "game_access", label: "Game Access", count: pendingGameAccessCount, icon: ShieldCheck, iconBg: "bg-primary/15", iconColor: "text-primary", borderColor: "border-primary/15 hover:border-primary/40", href: "/admin/game-access" },
                { key: "password", label: "Password", count: pendingPwCount, icon: KeyRound, iconBg: "bg-secondary/15", iconColor: "text-secondary", borderColor: "border-secondary/15 hover:border-secondary/40", href: "/admin/password-requests" },
              ].map((item) => {
                const Icon = item.icon;
                const hasItems = item.count > 0;
                return (
                  <button
                    key={item.key}
                    onClick={() => navigate(item.href)}
                    className={`group relative flex flex-col items-center gap-1 rounded-xl border bg-card/60 backdrop-blur-sm p-2.5 sm:p-3 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 ${item.borderColor} ${!hasItems ? "opacity-50" : ""}`}
                  >
                    <div className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg ${item.iconBg} transition-transform group-hover:scale-110`}>
                      <Icon className={`h-4 w-4 ${item.iconColor}`} />
                    </div>
                    <span className={`text-xl sm:text-2xl font-display font-bold ${hasItems ? "text-foreground" : "text-muted-foreground"}`}>
                      {item.count}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground leading-tight text-center">
                      {item.label}
                    </span>
                    {hasItems && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${item.iconBg}`} />
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${item.iconBg}`} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Users"
          value={totalUsers.toLocaleString()}
          icon={<Users className="h-4 w-4 text-primary" />}
          href="/admin/users"
        />
        <StatCard
          title="Active Games"
          value={totalGames}
          icon={<Gamepad2 className="h-4 w-4 text-secondary" />}
          href="/admin/games"
        />
        <StatCard
          title="Pending Transactions"
          value={pendingTxnCount}
          icon={<ArrowLeftRight className="h-4 w-4 text-primary" />}
          href="/admin/transactions"
        />
        <StatCard
          title="Password Requests"
          value={pendingPwCount}
          icon={<KeyRound className="h-4 w-4 text-secondary" />}
          href="/admin/password-requests"
        />
        <StatCard
          title="Game Access Requests"
          value={pendingGameAccessCount}
          icon={<ShieldCheck className="h-4 w-4 text-primary" />}
          href="/admin/game-access"
          className={pendingGameAccessCount > 0 ? "border-primary/30" : ""}
        />
      </div>




      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Transactions */}
        <div className="rounded-xl border border-border bg-card glow-card overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">
              Pending Transactions
            </h3>
            <button
              onClick={() => navigate("/admin/transactions")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-5">
            {pendingTxns.length === 0 ? (
              <div className="text-center py-6">
                <ArrowLeftRight className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No pending transactions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTxns.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => navigate("/admin/transactions")}
                    className="flex items-center justify-between rounded-lg bg-muted/30 hover:bg-muted/60 p-3 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-primary-foreground uppercase gradient-bg">
                        {(t.username || "?")[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.username}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold capitalize ${typeColors[t.type] || "bg-muted text-foreground"}`}>
                            {t.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{timeAgo(t.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-display text-foreground">${Number(t.amount).toFixed(2)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Password Requests */}
        <div className="rounded-xl border border-border bg-card glow-card overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">
              Password Requests
            </h3>
            <button
              onClick={() => navigate("/admin/password-requests")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-5">
            {pendingPwReqs.length === 0 ? (
              <div className="text-center py-6">
                <KeyRound className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingPwReqs.map((pr) => (
                  <div
                    key={pr.id}
                    onClick={() => navigate("/admin/password-requests")}
                    className="flex items-center justify-between rounded-lg bg-muted/30 hover:bg-muted/60 p-3 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-bg text-xs font-bold text-primary-foreground uppercase">
                        {(pr.username || "?")[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{pr.username}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{pr.game_name}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{timeAgo(pr.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                        Pending
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>



        {/* Recent Users */}
        <div className="rounded-xl border border-border bg-card glow-card overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">
              Recent Users
            </h3>
            <button
              onClick={() => navigate("/admin/users")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-5">
            {recentUsers.length === 0 ? (
              <div className="text-center py-6">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No users yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => navigate("/admin/users")}
                    className="flex items-center justify-between rounded-lg bg-muted/30 hover:bg-muted/60 p-3 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-bg text-xs font-bold text-primary-foreground uppercase">
                        {(u.username || "?")[0]}
                      </div>
                      <p className="text-sm font-medium text-foreground">{u.username || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />{timeAgo(u.created_at)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
