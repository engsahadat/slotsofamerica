import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, KeyRound, Eye, EyeOff, ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { adminPasswordUpdateSchema, parseApiError } from "@/lib/validation";

interface PasswordRequest {
  id: string;
  status: string;
  created_at: string;
  user_id: string;
  game_account_id: string;
  username?: string;
  display_name?: string;
  account_username?: string;
  game_name?: string;
  requested_password?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  approved: "bg-green-500/10 text-green-400",
  rejected: "bg-destructive/10 text-destructive",
};

const FILTER_TABS = ["pending", "completed", "rejected"] as const;

const TAB_TO_STATUS: Record<string, string> = {
  pending: "pending",
  completed: "approved",
  rejected: "rejected",
};

const STATUS_DISPLAY: Record<string, string> = {
  approved: "completed",
  pending: "pending",
  rejected: "rejected",
};

const PAGE_SIZE = 10;

const AdminPasswordRequests = () => {
  const [allRequests, setAllRequests] = useState<PasswordRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRequests = async () => {
    try {
      // AdminGameAccessApiController@index already eager-loads 'user' and 'gameAccount.game'
      // on each password request, so no separate profile/game lookups are needed here.
      const res = await api.get("/admin/game-access");
      const allReqs = (res.data?.password_requests || []) as any[];
      const statusValue = TAB_TO_STATUS[filter] || filter;
      const reqs = allReqs.filter((r) => r.status === statusValue);

      const mapped: PasswordRequest[] = reqs.map((r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        user_id: r.user_id,
        game_account_id: r.game_account_id,
        username: r.user?.username || undefined,
        display_name: r.user?.name || undefined,
        account_username: r.game_account?.username || undefined,
        game_name: r.game_account?.game?.name || undefined,
        requested_password: r.requested_password || undefined,
      }));
      setAllRequests(mapped);
      const prefilled: Record<string, string> = {};
      mapped.forEach((r) => {
        if (r.requested_password) prefilled[r.id] = r.requested_password;
      });
      setPasswords((prev) => ({ ...prefilled, ...prev }));
    } catch (err) {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
      setAllRequests([]);
    }
    setLoading(false);
  };

  // Filtered + paginated requests
  const filteredRequests = allRequests.filter((req) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (req.username || "").toLowerCase().includes(q) ||
      (req.display_name || "").toLowerCase().includes(q) ||
      (req.account_username || "").toLowerCase().includes(q) ||
      (req.game_name || "").toLowerCase().includes(q)
    );
  });
  const totalCount = filteredRequests.length;
  const requests = filteredRequests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    fetchRequests();
    // TODO: realtime updates not yet backed by a Laravel broadcast/websocket setup (deferred).
    // Falls back to the manual fetch above; no live updates until this is built.
  }, [filter]);

  const handleApprove = async (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    const newPassword = (req?.requested_password || passwords[reqId] || "").trim();

    const result = adminPasswordUpdateSchema.safeParse({ requestId: reqId, newPassword: newPassword || "" });
    if (!result.success) {
      toast({ title: result.error.errors[0]?.message || "Invalid input", variant: "destructive" });
      return;
    }

    setProcessingId(reqId);
    try {
      await api.post(`/admin/game-access/password/${reqId}/review`, {
        status: "approved",
        new_password: newPassword,
      });
      toast({ title: "Password request approved" });
      setPasswords((p) => { const next = { ...p }; delete next[reqId]; return next; });
      fetchRequests();
    } catch (err) {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    }
    setProcessingId(null);
  };

  const handleReject = async (reqId: string) => {
    const reason = (rejectReasons[reqId] || "").trim();
    setProcessingId(reqId);
    try {
      // reviewed_by/reviewed_at are set server-side from the authenticated admin, so no need to
      // fetch the admin's id client-side (previously done via the dead supabase.auth.getUser()).
      await api.post(`/admin/game-access/password/${reqId}/review`, {
        status: "rejected",
        rejection_reason: reason || null,
      });

      toast({ title: "Request rejected" });
      setRejectReasons((r) => { const next = { ...r }; delete next[reqId]; return next; });
      fetchRequests();
    } catch (err) {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    }
    setProcessingId(null);
  };

  const handleDeletePassword = async (id: string) => {
    if (!confirm("Delete this password request?")) return;
    try {
      await api.delete(`/admin/game-access/password/${id}`);
      toast({ title: "Password Request Deleted" });
      fetchRequests();
    } catch (err: any) {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-wide">Password Requests</h1>
        <p className="text-muted-foreground mt-1">Review and process user password change requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-lg bg-muted p-1 max-w-xs">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium capitalize transition-all ${
              filter === tab
                ? "gradient-bg text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          placeholder="Search by username, game, or account..."
          className="w-full rounded-lg border border-input bg-muted/50 pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 glow-card">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8">
            <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No {filter} requests found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {req.display_name || req.username || "Unknown User"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.game_name || "Game"} — <span className="font-mono">{req.account_username || "—"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    {req.requested_password && (
                      <p className="text-xs text-muted-foreground">
                        Requested Password: <span className="font-mono font-semibold text-primary">{req.requested_password}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[req.status] || ""}`}>
                      {STATUS_DISPLAY[req.status] || req.status}
                    </span>
                    <button
                      onClick={() => handleDeletePassword(req.id)}
                      className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete Password Request"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {filter === "pending" && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-2 items-center">
                    {req.requested_password ? (
                      <div className="flex-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-foreground font-mono">
                        {req.requested_password}
                      </div>
                    ) : (
                      <div className="relative flex-1">
                        <input
                          type={showPassword[req.id] ? "text" : "password"}
                          value={passwords[req.id] || ""}
                          onChange={(e) => setPasswords((p) => ({ ...p, [req.id]: e.target.value }))}
                          placeholder="Enter new password"
                          className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => ({ ...s, [req.id]: !s[req.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword[req.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            if (req.requested_password) {
                              setPasswords((p) => ({ ...p, [req.id]: req.requested_password! }));
                            }
                            handleApprove(req.id);
                          }}
                          disabled={processingId === req.id}
                          className="flex items-center gap-1 rounded-lg bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          {processingId === req.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={processingId === req.id}
                          className="flex items-center gap-1 rounded-lg bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                        >
                          {processingId === req.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Reject
                        </button>
                      </div>
                      <input
                        type="text"
                        value={rejectReasons[req.id] || ""}
                        onChange={(e) => setRejectReasons((r) => ({ ...r, [req.id]: e.target.value }))}
                        placeholder="Rejection reason (optional)"
                        className="rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" /> Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPasswordRequests;
