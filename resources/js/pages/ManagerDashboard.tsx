import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  KeyRound,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
} from "lucide-react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingTxnCounts, setPendingTxnCounts] = useState<Record<string, number>>({
    deposit: 0,
    transfer: 0,
    redeem: 0,
    withdraw: 0,
  });
  const [pendingPwCount, setPendingPwCount] = useState(0);
  const [pendingGameAccessCount, setPendingGameAccessCount] = useState(0);

  // Same real endpoints AdminOverview.tsx (the admin equivalent of this page) uses.
  const fetchAll = async () => {
    try {
      const [countsRes, gameAccessRes] = await Promise.all([
        api.get("/admin/transactions/pending-counts"),
        api.get("/admin/game-access"),
      ]);

      const counts = (countsRes.data?.counts || {}) as Record<string, number>;
      setPendingTxnCounts({
        deposit: counts.deposit || 0,
        transfer: counts.transfer || 0,
        redeem: counts.redeem || 0,
        withdraw: counts.withdraw || 0,
      });

      const passwordRequests = (gameAccessRes.data?.password_requests || []) as any[];
      setPendingPwCount(passwordRequests.filter((r) => r.status === "pending").length);

      const unlockRequests = (gameAccessRes.data?.unlock_requests || []) as any[];
      setPendingGameAccessCount(unlockRequests.filter((r) => r.status === "pending").length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // No realtime push infrastructure in this app — stats refresh on mount/navigation only.
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const txnTotal = pendingTxnCounts.deposit + pendingTxnCounts.transfer + pendingTxnCounts.redeem + pendingTxnCounts.withdraw;
  const total = txnTotal + pendingPwCount + pendingGameAccessCount;

  const items = [
    { key: "deposit", label: "Deposit", count: pendingTxnCounts.deposit, icon: ArrowDownToLine, iconBg: "bg-green-500/15", iconColor: "text-green-400", borderColor: "border-green-500/15 hover:border-green-500/40", href: "/admin/transactions?type=deposit" },
    { key: "transfer", label: "Transfer", count: pendingTxnCounts.transfer, icon: ArrowLeftRight, iconBg: "bg-blue-500/15", iconColor: "text-blue-400", borderColor: "border-blue-500/15 hover:border-blue-500/40", href: "/admin/transactions?type=transfer" },
    { key: "redeem", label: "Redeem", count: pendingTxnCounts.redeem, icon: Gift, iconBg: "bg-purple-500/15", iconColor: "text-purple-400", borderColor: "border-purple-500/15 hover:border-purple-500/40", href: "/admin/transactions?type=redeem" },
    { key: "withdraw", label: "Withdraw", count: pendingTxnCounts.withdraw, icon: ArrowUpFromLine, iconBg: "bg-orange-500/15", iconColor: "text-orange-400", borderColor: "border-orange-500/15 hover:border-orange-500/40", href: "/admin/transactions?type=withdraw" },
    { key: "game_access", label: "Game Access", count: pendingGameAccessCount, icon: ShieldCheck, iconBg: "bg-primary/15", iconColor: "text-primary", borderColor: "border-primary/15 hover:border-primary/40", href: "/admin/game-access" },
    { key: "password", label: "Password", count: pendingPwCount, icon: KeyRound, iconBg: "bg-secondary/15", iconColor: "text-secondary", borderColor: "border-secondary/15 hover:border-secondary/40", href: "/admin/password-requests" },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-wide">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, <span className="text-foreground font-medium capitalize">{user?.email?.split("@")[0] || "Manager"}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <AlertTriangle className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Action Required</p>
            <p className="text-[11px] text-muted-foreground">
              {total} pending item{total !== 1 ? "s" : ""} need review
            </p>
          </div>
        </div>
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {items.map((item) => {
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
    </div>
  );
};

export default ManagerDashboard;
