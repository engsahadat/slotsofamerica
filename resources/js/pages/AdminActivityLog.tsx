import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  History, Loader2, Search, User, Calendar, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Pencil, Undo2, ShieldCheck, Bell, FileDown, KeyRound, Gamepad2, DollarSign,
  Download, Trash2, DatabaseBackup, Plug,
} from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: any;
  created_at: string;
  ip_address: string | null;
  actor_name?: string;
  actor_role?: string;
}

const ACTION_CATEGORIES: Record<string, { label: string; icon: any; color: string; matches: (a: string) => boolean }> = {
  all: { label: "All", icon: History, color: "text-foreground", matches: () => true },
  transactions: {
    label: "Transactions", icon: DollarSign, color: "text-emerald-400",
    matches: (a) => a.includes("transaction") || a.includes("balance"),
  },
  game_access: {
    label: "Game Access", icon: Gamepad2, color: "text-sky-400",
    matches: (a) => a.includes("game_access") || a === "edit_game_username",
  },
  passwords: {
    label: "Passwords", icon: KeyRound, color: "text-amber-400",
    matches: (a) => a.includes("password"),
  },
  verifications: {
    label: "Verification", icon: ShieldCheck, color: "text-blue-400",
    matches: (a) => a.includes("verify"),
  },
  notifications: {
    label: "Notifications", icon: Bell, color: "text-fuchsia-400",
    matches: (a) => a.includes("notification"),
  },
  exports: {
    label: "Exports", icon: FileDown, color: "text-purple-400",
    matches: (a) => a.includes("export"),
  },
  backups: {
    label: "Backups", icon: DatabaseBackup, color: "text-orange-400",
    matches: (a) => a.includes("backup") || a.includes("recovery_config") || a.includes("storage_export") || a.includes("storage_import"),
  },
  game_api: {
    label: "Game API", icon: Plug, color: "text-cyan-400",
    matches: (a) => a.includes("game_api_provider") || a.includes("game_provider_assignment"),
  },
};

const actionIcon = (action: string) => {
  if (action.startsWith("approved") || action.startsWith("completed")) return CheckCircle;
  if (action.startsWith("rejected")) return XCircle;
  if (action.startsWith("undo")) return Undo2;
  if (action.startsWith("edit")) return Pencil;
  if (action.includes("verify")) return ShieldCheck;
  if (action.includes("notification")) return Bell;
  if (action.includes("export")) return FileDown;
  if (action.includes("password")) return KeyRound;
  if (action.includes("game")) return Gamepad2;
  return History;
};

const actionColor = (action: string) => {
  if (action.startsWith("approved") || action.startsWith("completed")) return "from-emerald-500 to-emerald-600";
  if (action.startsWith("rejected")) return "from-red-500 to-red-600";
  if (action.startsWith("undo")) return "from-orange-500 to-orange-600";
  if (action.startsWith("edit")) return "from-blue-500 to-blue-600";
  return "from-slate-500 to-slate-600";
};

const PAGE_SIZE = 25;

const ROLE_FILTERS = ["all", "admin", "manager", "user"] as const;
const STATUS_FILTERS = [
  { key: "all", label: "All", match: (_a: string) => true },
  { key: "approved", label: "Approved", match: (a: string) => a.startsWith("approved") || a.startsWith("completed") },
  { key: "rejected", label: "Rejected", match: (a: string) => a.startsWith("rejected") },
  { key: "edited", label: "Edited", match: (a: string) => a.startsWith("edit") },
  { key: "undone", label: "Undone", match: (a: string) => a.startsWith("undo") },
] as const;

const csvEscape = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const AdminActivityLog = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<typeof ROLE_FILTERS[number]>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Regression: category/role/status/search were only ever applied to whichever single 25-row
  // server page happened to be loaded — a match sitting on page 3 was invisible while browsing
  // page 1, "Export CSV (N)" silently exported only the current page's matches despite its own
  // label implying otherwise, and pagination was driven by the server's *unfiltered* total, so
  // "Page 1 of 40" stayed put even once a filter cut the real result set down to a handful of
  // rows. date_from/date_to stay server-side (real narrowing, keeps the fetch bounded); the
  // fuzzy category/role/status/search rules are inherently client-side pattern matches (they key
  // off action-string substrings and joined actor fields, not literal DB columns), so instead
  // the full date-scoped result set is fetched (looping server pages, same pattern as
  // AdminUsers.tsx) and filtering/pagination both operate on that complete set.
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let serverPage = 1;
      let lastPage = 1;
      let all: any[] = [];
      do {
        const res = await api.get("/admin/activity-log", {
          params: {
            per_page: 200,
            page: serverPage,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        });
        all = all.concat((res.data?.data || []) as any[]);
        lastPage = res.data?.last_page || 1;
        serverPage++;
      } while (serverPage <= lastPage);

      setLogs(all.map((l) => ({
        ...l,
        actor_name: l.admin?.name || l.admin?.username || "System",
        actor_role: l.admin?.role || "user",
      })));
    } catch (err: any) {
      toast({ title: "Failed to load", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const cat = ACTION_CATEGORIES[category];
    const status = STATUS_FILTERS.find((s) => s.key === statusFilter) ?? STATUS_FILTERS[0];
    return logs.filter((l) => {
      if (!cat.matches(l.action)) return false;
      if (roleFilter !== "all" && l.actor_role !== roleFilter) return false;
      if (!status.match(l.action)) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        l.action.toLowerCase().includes(s) ||
        (l.actor_name || "").toLowerCase().includes(s) ||
        l.target_type.toLowerCase().includes(s) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(s)
      );
    });
  }, [logs, category, roleFilter, statusFilter, actionFilter, search]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast({ title: "Nothing to export", description: "No rows match the current filters." });
      return;
    }
    const headers = ["timestamp", "actor", "actor_role", "action", "target_type", "target_id", "ip_address", "details"];
    const rows = filtered.map((l) => [
      new Date(l.created_at).toISOString(),
      l.actor_name ?? "",
      l.actor_role ?? "",
      l.action,
      l.target_type,
      l.target_id ?? "",
      l.ip_address ?? "",
      l.details ?? {},
    ].map(csvEscape).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Export ready", description: `${filtered.length} row(s) downloaded.` });
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm("Delete this activity log entry?")) return;
    try {
      await api.delete(`/admin/activity-log/${id}`);
      toast({ title: "Log Entry Deleted" });
      fetchLogs();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to CLEAR ALL activity logs? This action cannot be undone.")) return;
    try {
      await api.delete("/admin/activity-log");
      toast({ title: "Activity Logs Cleared" });
      fetchLogs();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const roleColor = (r: string) =>
    r === "admin" ? "bg-primary/10 text-primary border-primary/20"
    : r === "manager" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-wide flex items-center gap-2">
            <History className="h-6 w-6" /> Activity Log
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            All sensitive actions performed by admins and managers, in chronological order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCsv} variant="outline" size="sm" className="shrink-0">
            <Download className="h-4 w-4 mr-2" /> Export CSV
            <span className="ml-2 text-xs text-muted-foreground">({filtered.length})</span>
          </Button>
          <Button onClick={handleClearLogs} variant="destructive" size="sm" className="shrink-0">
            <Trash2 className="h-4 w-4 mr-2" /> Clear All Logs
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACTION_CATEGORIES).map(([k, c]) => {
            const Icon = c.icon;
            return (
              <button
                key={k}
                onClick={() => { setCategory(k); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  category === k
                    ? "gradient-bg text-primary-foreground border-transparent shadow-md"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>
        {/* Quick filters: role + status */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Role</span>
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                onClick={() => { setRoleFilter(r); setPage(1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border capitalize transition-all ${
                  roleFilter === r
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Status</span>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => { setStatusFilter(s.key); setPage(1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  statusFilter === s.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search action, admin, or details…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm min-w-[12rem]"
          >
            <option value="all">All action types</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
          <input
            type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <input
            type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          {(dateFrom || dateTo || search || category !== "all" || roleFilter !== "all" || statusFilter !== "all" || actionFilter !== "all") && (
            <Button variant="outline" size="sm" onClick={() => {
              setDateFrom(""); setDateTo(""); setSearch(""); setCategory("all");
              setRoleFilter("all"); setStatusFilter("all"); setActionFilter("all"); setPage(1);
            }}>Reset</Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          No activity matches these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((log) => {
            const Icon = actionIcon(log.action);
            const isOpen = expanded.has(log.id);
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <button
                  onClick={() => toggle(log.id)}
                  className="w-full flex items-start gap-3 p-3 text-left"
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${actionColor(log.action)} shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold capitalize">
                        {log.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">on</span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted/50">
                        {log.target_type}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {log.actor_name}
                        <span className={`ml-1 px-1.5 py-0.5 rounded border text-[10px] capitalize ${roleColor(log.actor_role!)}`}>
                          {log.actor_role}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                      className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete log entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-0 space-y-2 text-xs">
                    {log.target_id && (
                      <div><span className="text-muted-foreground">Target ID:</span> <code className="font-mono">{log.target_id}</code></div>
                    )}
                    {log.ip_address && (
                      <div><span className="text-muted-foreground">IP:</span> <code className="font-mono">{log.ip_address}</code></div>
                    )}
                    <div className="rounded bg-muted/30 p-2">
                      <div className="text-muted-foreground mb-1">Details</div>
                      <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">{JSON.stringify(log.details || {}, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {filtered.length.toLocaleString()} matching entries
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminActivityLog;
