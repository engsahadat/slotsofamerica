import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Gamepad2, Bell, ArrowRight, DollarSign, Banknote,
  Clock, CheckCircle, AlertCircle, Send, Gift, TrendingUp,
  Sparkles, ChevronRight, MessageSquare, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRealtime } from "@/hooks/useUserRealtime";
import { UserLayout } from "@/components/UserLayout";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import heroBg from "@/assets/hero-dashboard-bg.jpg";
import GameCard, { GameAccessRequest } from "@/components/GameCard";
import { buildAccessRequestMap } from "@/lib/accessRequests";
import brandDados from "@/assets/brand-dados.png";
import brandBear from "@/assets/brand-bear.png";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: "easeOut" as const },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const QUICK_ACTIONS = [
  { label: "Deposit", desc: "Add funds to your account instantly", href: "/deposit", icon: DollarSign, color: "from-green-500/20 to-green-600/10 border-green-500/20", iconColor: "text-green-400" },
  { label: "Transfer", desc: "Move balance into your games", href: "/transfer", icon: Send, color: "from-blue-500/20 to-blue-600/10 border-blue-500/20", iconColor: "text-blue-400" },
  { label: "Redeem", desc: "Convert your in-game points into rewards", href: "/redeem", icon: Gift, color: "from-purple-500/20 to-purple-600/10 border-purple-500/20", iconColor: "text-purple-400" },
  { label: "Withdraw", desc: "Cash out your winnings to your preferred method", href: "/withdraw", icon: Banknote, color: "from-orange-500/20 to-orange-600/10 border-orange-500/20", iconColor: "text-orange-400" },
];

const TX_TYPE_STYLES: Record<string, { icon: typeof DollarSign; color: string; bg: string }> = {
  deposit: { icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10" },
  withdraw: { icon: Banknote, color: "text-orange-400", bg: "bg-orange-500/10" },
  transfer: { icon: Send, color: "text-blue-400", bg: "bg-blue-500/10" },
  redeem: { icon: Gift, color: "text-purple-400", bg: "bg-purple-500/10" },
};

const UserDashboard = () => {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [profile, setProfile] = useState<{ username: string | null; display_name: string | null; balance: number; avatar_url: string | null } | null>(null);
  const [games, setGames] = useState<{ id: string; name: string; image_url: string | null; download_url: string | null }[]>([]);
  const [accessRequests, setAccessRequests] = useState<Record<string, GameAccessRequest>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [socialLinks, setSocialLinks] = useState({ whatsapp: "", telegram: "", messenger: "" });

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/user/dashboard");
      if (res.data) {
        if (res.data.user) {
          setProfile({
            username: res.data.user.username || res.data.user.name,
            display_name: res.data.user.name,
            balance: parseFloat(res.data.user.balance || "0"),
            avatar_url: res.data.user.avatar_url || null,
          });
        }
        if (res.data.featured_games) {
          setGames(res.data.featured_games);
        }
        if (res.data.unlock_requests) {
          setAccessRequests(buildAccessRequestMap(res.data.unlock_requests, undefined, res.data.active_accounts));
        }
        if (res.data.recent_transactions) {
          setTransactions(res.data.recent_transactions);
        }
      }
    } catch (e) {
      console.warn("Failed to load user dashboard data", e);
    }
    // The "Notifications" card was only ever populated by onNotification below, which is a
    // permanent no-op (useUserRealtime has no backend to actually push through) — there was no
    // real fetch anywhere, so this card showed "No new notifications" unconditionally, forever,
    // regardless of real data. /user/notifications is the same real endpoint the notification
    // bell in UserLayout.tsx already uses.
    try {
      const notifRes = await api.get("/user/notifications");
      setNotifications(((notifRes.data?.notifications || []) as NotificationItem[]).slice(0, 5));
    } catch (e) {
      console.warn("Failed to load notifications", e);
    }
  }, [user]);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    fetchData();

    // TODO: no Laravel broadcast/websocket backend exists yet (deferred), so game-access status
    // changes (e.g. an admin approving a request) can't push to the client. Poll instead so the
    // card updates without the user needing to manually reload the page.
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Realtime updates so the dashboard reflects changes without refresh
  useUserRealtime(user?.id, {
    channelKey: "dashboard",
    onProfile: (payload) => {
      const n: any = payload.new;
      if (n) {
        const nextBalance = n.balance !== undefined && n.balance !== null ? Number(n.balance) : undefined;
        setProfile((prev) => prev ? { ...prev, balance: (nextBalance !== undefined && !Number.isNaN(nextBalance)) ? nextBalance : prev.balance, avatar_url: n.avatar_url ?? prev.avatar_url, display_name: n.display_name ?? prev.display_name, username: n.username ?? prev.username } : prev);
      }
    },
    onTransaction: (payload) => {
      if (payload.eventType === "INSERT") {
        const t: any = payload.new;
        setTransactions((prev) => prev.some((x) => x.id === t.id) ? prev : [t as Transaction, ...prev].slice(0, 5));
      } else if (payload.eventType === "UPDATE") {
        const t: any = payload.new;
        setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...t } as Transaction : x)));
      } else if (payload.eventType === "DELETE") {
        const t: any = payload.old;
        setTransactions((prev) => prev.filter((x) => x.id !== t.id));
      }
    },
    onNotification: (payload) => {
      if (payload.eventType === "INSERT") {
        const n: any = payload.new;
        setNotifications((prev) => prev.some((x) => x.id === n.id) ? prev : [n as NotificationItem, ...prev].slice(0, 5));
      } else if (payload.eventType === "UPDATE") {
        const n: any = payload.new;
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...n } : x)));
      }
    },
    onGameAccess: (payload) => {
      const row: any = payload.new || payload.old;
      if (!row?.game_id) return;
      if (payload.eventType === "DELETE") {
        setAccessRequests((prev) => {
          const c = { ...prev };
          delete c[row.game_id];
          return c;
        });
        return;
      }
      const profileUsername = profile?.username || profile?.display_name || user?.email?.split("@")[0] || "unknown";
      setAccessRequests((prev) => ({
        ...prev,
        [row.game_id]: {
          id: row.id,
          status: row.status,
          admin_note: row.admin_note,
          username: row.username || profileUsername,
          game_password: row.game_password,
        },
      }));
    },
  });

  const userBalance = profile?.balance ?? 0;
  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Player";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  })();

  return (
    <UserLayout>
      {/* ─── HERO SECTION ─── */}
      <section className="relative overflow-hidden">
        {/* Background image with overlays */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-secondary/8 blur-[100px]" />
        {/* Brand decorations */}
        <img src={brandDados} alt="" className="absolute bottom-4 right-6 w-32 opacity-10 pointer-events-none select-none hidden lg:block" />
        <img src={brandBear} alt="" className="absolute top-20 right-1/3 w-16 opacity-[0.07] pointer-events-none select-none hidden lg:block" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-10 pb-20 lg:pt-14 lg:pb-24">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
            {/* Greeting + Last Login */}
            <motion.div variants={fadeUp} custom={0} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="text-sm text-muted-foreground tracking-wide">
                {greeting}, <span className="text-foreground font-semibold">{displayName}</span> 👋
              </p>
              {user?.last_login_at && (
                <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" />
                  Last login: {new Date(user.last_login_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </motion.div>

            {/* Balance card */}
            <motion.div variants={fadeUp} custom={1} className="flex flex-col sm:flex-row sm:items-end gap-6 sm:gap-10">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Total Balance</p>
                <p className="text-4xl sm:text-5xl font-display font-black tracking-wider">
                  ${userBalance.toFixed(2)}
                </p>
              </div>
              <Link
                to="/deposit"
                className="inline-flex items-center gap-2 rounded-xl gradient-bg px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] transition-all"
              >
                <Sparkles className="h-4 w-4" />
                Deposit Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Quick Actions */}
            <motion.div variants={fadeUp} custom={2} className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {QUICK_ACTIONS.map(({ label, desc, href, icon: Icon, color, iconColor }) => (
                <Link
                  key={label}
                  to={href}
                  className={`group flex items-center gap-3 rounded-xl border bg-gradient-to-br ${color} p-4 hover:scale-[1.02] transition-all duration-200`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/50 ${iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── OUR GAMES ─── */}
      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider gradient-text">OUR GAMES</h2>
              <p className="mt-1 text-sm text-muted-foreground">Unlock, play & win on the best platforms</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gamepad2 className="h-4 w-4" />
              <span>{games.length} available</span>
            </div>
          </motion.div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game, i) => (
              <GameCard key={game.id} game={game} accessRequest={accessRequests[game.id] || null} index={i} onRequestSent={fetchData} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRANSACTIONS + NOTIFICATIONS (Two Column) ─── */}
      <section className="py-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Transactions — 3 cols */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-bold tracking-wider">Recent Activity</h2>
                </div>
                <Link to="/transactions" className="text-xs text-primary hover:underline font-medium">View all →</Link>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                      <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No transactions yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Make your first deposit to get started</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {transactions.map((tx) => {
                      const style = TX_TYPE_STYLES[tx.type] || TX_TYPE_STYLES.deposit;
                      const TxIcon = style.icon;
                      return (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
                            <TxIcon className={`h-4 w-4 ${style.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium capitalize">{tx.type}</p>
                            <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">${Number(tx.amount).toFixed(2)}</p>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                              (tx.status === "approved" || tx.status === "completed") ? "text-green-400"
                              : tx.status === "pending" ? "text-yellow-400"
                              : "text-destructive"
                            }`}>
                              {(tx.status === "approved" || tx.status === "completed") ? <CheckCircle className="h-2.5 w-2.5" /> : tx.status === "pending" ? <Clock className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Notifications — 2 cols */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1} className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-bold tracking-wider">Notifications</h2>
                </div>
                <Link to="/notifications" className="text-xs text-primary hover:underline font-medium">View all →</Link>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
                    <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((n) => (
                      <div key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${n.is_read ? "" : "bg-primary/5"}`}>
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.is_read ? "bg-muted" : "bg-primary/10"}`}>
                          <Bell className={`h-3.5 w-3.5 ${n.is_read ? "text-muted-foreground" : "text-primary"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                        </div>
                        {!n.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full gradient-bg" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      {/* ─── CONTACT SUPPORT ─── */}
      {(socialLinks.whatsapp || socialLinks.telegram || socialLinks.messenger) && (
        <section className="py-10 border-t border-border">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
              className="rounded-2xl gradient-bg p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <MessageSquare className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary-foreground">Need Help?</p>
                <p className="text-xs text-primary-foreground/70 mt-0.5">Reach our support team instantly on your preferred platform</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const digits = socialLinks.whatsapp.replace(/[^0-9]/g, "");
                  return digits ? (
                    <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2 text-primary-foreground text-sm font-semibold"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                      WhatsApp
                    </a>
                  ) : null;
                })()}
                {(() => {
                  const slug = socialLinks.telegram.replace(/^@/, "").trim();
                  const href = socialLinks.telegram.startsWith("http") ? socialLinks.telegram : (slug ? `https://t.me/${slug}` : "");
                  return href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2 text-primary-foreground text-sm font-semibold"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                      Telegram
                    </a>
                  ) : null;
                })()}
                {(() => {
                  const slug = socialLinks.messenger.trim();
                  const href = slug.startsWith("http") ? slug : (slug ? `https://m.me/${slug}` : "");
                  return href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2 text-primary-foreground text-sm font-semibold"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current"><path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.975 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z"/></svg>
                      Messenger
                    </a>
                  ) : null;
                })()}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      <footer className="border-t border-border bg-card/50 py-10">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.site_name} className="h-10 max-w-[140px] object-contain" />
            ) : (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-bg">
                  <Gamepad2 className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-display text-sm font-bold tracking-wider gradient-text">{settings.site_name || "HORIZON"}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {games.map((g) => (
              <span key={g.id} className="hover:text-foreground transition-colors cursor-pointer">{g.name}</span>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">© {new Date().getFullYear()} {settings.site_name || "HorizonPlayers"}. All rights reserved.</p>
        </div>
      </footer>
    </UserLayout>
  );
};

export default UserDashboard;
