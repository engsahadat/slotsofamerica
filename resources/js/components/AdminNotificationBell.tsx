import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Check, CheckCheck, Gamepad2, KeyRound, ArrowDownLeft, ArrowUpRight, RefreshCw, DollarSign, Megaphone, Info } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Same real shape/table Notifications.tsx (the full user-facing page) reads from — this bell is
// just a compact live view of the logged-in admin's own rows via GET /user/notifications, which
// already receives real entries (e.g. "New Export Request" was already wired; deposit/withdraw/
// redeem/transfer submissions now notify admins the same way).
interface AdminNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  category: string;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 30000;

// Mirrors Notifications.tsx's CATEGORIES icon set so the bell and the full page always agree.
const categoryConfig: Record<string, { icon: typeof Bell; color: string }> = {
  game_access: { icon: Gamepad2, color: "from-sky-500 to-sky-600" },
  password_request: { icon: KeyRound, color: "from-amber-500 to-amber-600" },
  deposit: { icon: ArrowDownLeft, color: "from-emerald-500 to-emerald-600" },
  transfer: { icon: ArrowUpRight, color: "from-blue-500 to-blue-600" },
  redeem: { icon: RefreshCw, color: "from-purple-500 to-purple-600" },
  withdraw: { icon: DollarSign, color: "from-orange-500 to-orange-600" },
  system: { icon: Megaphone, color: "from-fuchsia-500 to-purple-600" },
};

const NOTIFICATION_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export const AdminNotificationBell = React.forwardRef<HTMLDivElement>(function AdminNotificationBell(_props, ref) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenIdsRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.5;
    audio.load();
    audioRef.current = audio;
  }, []);

  const playSound = useCallback(() => {
    try {
      audioRef.current?.play().catch(() => {});
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showDesktopNotification = useCallback((title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      const n = new Notification(title, { body, icon: "/favicon.ico", tag: "admin-alert-" + Date.now() });
      n.onclick = () => { window.focus(); n.close(); };
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get("/user/notifications");
      const list = (res.data?.notifications || []) as AdminNotification[];

      // First load just establishes the baseline silently; every load after that alerts on
      // anything genuinely new (no realtime push here — this is a poll, so "new" means an id
      // that wasn't in the previous snapshot).
      if (seenIdsRef.current) {
        const fresh = list.filter((n) => !seenIdsRef.current!.has(n.id));
        if (fresh.length > 0) {
          playSound();
          const first = fresh[0];
          showDesktopNotification(first.title, first.message);
          toast({ title: first.title, description: first.message });
        }
      }
      seenIdsRef.current = new Set(list.map((n) => n.id));

      setNotifications(list);
      setUnreadCount(res.data?.unread_count ?? list.filter((n) => !n.is_read).length);
    } catch { /* transient — next poll retries */ }
  }, [playSound, showDesktopNotification]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.post(`/user/notifications/${id}/read`);
    } catch {
      fetchNotifications(); // resync on failure
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.post("/user/notifications/read-all");
    } catch {
      fetchNotifications();
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={(node) => {
      (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full gradient-bg px-1 text-[10px] font-bold text-primary-foreground shadow-lg shadow-primary/30 animate-pulse-glow">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-[380px] max-h-[500px] rounded-2xl border border-border bg-card shadow-2xl shadow-black/20 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full gradient-bg px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const config = categoryConfig[n.category] || { icon: Info, color: "from-muted to-muted" };
                  const Icon = config.icon;
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer",
                        !n.is_read && "bg-primary/5"
                      )}
                      onClick={() => !n.is_read && markAsRead(n.id)}
                    >
                      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm", config.color)}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-semibold truncate", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
                            {n.title}
                          </p>
                          {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
