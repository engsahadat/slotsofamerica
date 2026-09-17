import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Copy, Pencil, Trash2, Zap } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GameAccessRequest {
  id: string;
  user_id: string;
  game_id: string;
  username: string;
  game_username: string;
  email: string;
  status: string;
  admin_note: string | null;
  game_password: string | null;
  created_at: string;
  approved_at: string | null;
  game_name?: string;
  game_image?: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const PAGE_SIZE = 15;

const USERNAME_MIN = 3;
const USERNAME_MAX = 100;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 255;
// Game usernames end up as real login credentials on the external game provider —
// spaces or stray symbols there would silently break login, so keep it to the
// characters every provider we integrate with actually accepts.
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

const validateGameUsername = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Please enter a game username, or leave it blank to auto-assign from the pool.";
  if (value.length < USERNAME_MIN) return `Game username must be at least ${USERNAME_MIN} characters.`;
  if (value.length > USERNAME_MAX) return `Game username must be at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_PATTERN.test(value)) return "Game username can only contain letters, numbers, underscores, hyphens and dots (no spaces).";
  return null;
};

const validateGamePassword = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null; // optional — blank means "auto-assign / keep existing"
  if (value.length < PASSWORD_MIN) return `Game password must be at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Game password must be at most ${PASSWORD_MAX} characters.`;
  return null;
};

const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied!", description: `${label} copied to clipboard.` });
};

const CopyCell = ({ value, label }: { value: string; label: string }) => (
  <div className="flex items-center gap-1.5 group">
    <span className="truncate max-w-[160px]">{value}</span>
    <button
      onClick={() => copyToClipboard(value, label)}
      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/50"
      title={`Copy ${label}`}
    >
      <Copy className="h-3 w-3 text-muted-foreground" />
    </button>
  </div>
);

const AdminGameAccessRequests = () => {
  const [requests, setRequests] = useState<GameAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [page, setPage] = useState(1);

  const [actionModal, setActionModal] = useState<{ request: GameAccessRequest; action: "approved" | "rejected" } | null>(null);
  const [editModal, setEditModal] = useState<GameAccessRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [gamePassword, setGamePassword] = useState("");
  const [editGameUsername, setEditGameUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editModalUsername, setEditModalUsername] = useState("");
  const [processing, setProcessing] = useState(false);

  // Opt-in "Auto-create" (Game API providers) — only offered for games that
  // have an active provider assignment. Purely additive: does not change the
  // manual Accept/Reject flow above. See /admin/game-api-providers.
  const [providerGameIds, setProviderGameIds] = useState<Set<number>>(new Set());
  const [autoCreatingId, setAutoCreatingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/game-api-providers");
        const providers = (res.data?.providers || []) as { id: number; is_active: boolean }[];
        const activeProviderIds = new Set(providers.filter(p => p.is_active).map(p => p.id));
        const assignments = (res.data?.assignments || []) as { game_id: number; provider_id: number }[];
        const ids = new Set<number>(
          assignments.filter(a => activeProviderIds.has(a.provider_id)).map(a => a.game_id)
        );
        setProviderGameIds(ids);
      } catch {
        // Game API module may have no providers configured yet — fine, just hide the button.
      }
    })();
  }, []);

  const handleAutoCreate = async (req: GameAccessRequest) => {
    setAutoCreatingId(req.id);
    try {
      const res = await api.post(`/admin/game-access/unlock/${req.id}/auto-create`);
      const data = res.data;
      if (data?.success) {
        toast({ title: "Account auto-created", description: `Username: ${data.username} • Password: ${data.password}` });
        fetchRequests();
      } else {
        toast({
          title: data?.fallback ? "Falling back to manual" : "Auto-create failed",
          description: data?.message || "Use the manual Accept flow.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setAutoCreatingId(null);
    }
  };

  const fetchRequests = useCallback(async () => {
    try {
      // AdminGameAccessApiController@index already eager-loads 'user' and 'game' on each
      // unlock request, so no separate profile/game lookups are needed here.
      const res = await api.get("/admin/game-access");
      const data = (res.data?.unlock_requests || []) as any[];
      const filteredByStatus = statusFilter ? data.filter((r) => r.status === statusFilter) : data;

      const enriched: GameAccessRequest[] = filteredByStatus.map((r) => {
        const profile = r.user;
        const game = r.game;
        return {
          ...r,
          game_username: r.username || "unknown",
          username: profile?.username || profile?.name || r.username || "unknown",
          email: profile?.email || r.email || "unknown",
          game_name: game?.name || "Unknown Game",
          game_image: game?.image_url || null,
          game_password: r.game_password || null,
        };
      });

      setRequests(enriched);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const filtered = requests.filter(r =>
    r.username.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.game_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAction = async () => {
    if (!actionModal) return;
    if (actionModal.action === "rejected" && !adminNote.trim()) {
      toast({ title: "Note required", description: "Please provide a reason for rejection.", variant: "destructive" });
      return;
    }
    if (actionModal.action === "approved" && editGameUsername.trim()) {
      // Only validate if the admin chose to override — blank means auto-assign from the pool.
      const err = validateGameUsername(editGameUsername);
      if (err) {
        toast({ title: "Invalid game username", description: err, variant: "destructive" });
        return;
      }
    }
    if (actionModal.action === "approved" && gamePassword.trim()) {
      const err = validateGamePassword(gamePassword);
      if (err) {
        toast({ title: "Invalid game password", description: err, variant: "destructive" });
        return;
      }
    }
    setProcessing(true);
    try {
      await api.post(`/admin/game-access/unlock/${actionModal.request.id}/review`, {
        status: actionModal.action,
        admin_note: adminNote.trim() || null,
        ...(actionModal.action === "approved" ? {
          game_username: editGameUsername.trim(),
          game_password: gamePassword.trim() || null,
        } : {}),
      });
      toast({ title: actionModal.action === "approved" ? "Request Approved" : "Request Rejected" });
      setActionModal(null);
      setAdminNote("");
      setGamePassword("");
      setEditGameUsername("");
      fetchRequests();
    } catch (err: any) {
      // Prefer the specific field message (e.g. "Game username can only contain...")
      // over Laravel's generic "The given data was invalid." wrapper.
      const fieldErrors = err.response?.data?.errors;
      const firstFieldError = fieldErrors ? (Object.values(fieldErrors)[0] as string[] | undefined)?.[0] : undefined;
      toast({
        title: "Error",
        description: firstFieldError || err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    const err = validateGameUsername(editModalUsername);
    if (err) {
      toast({ title: "Invalid game username", description: err, variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      await api.put(`/admin/game-access/unlock/${editModal.id}`, {
        username: editModalUsername.trim(),
        game_password: editPassword.trim() || null,
        admin_note: editNote.trim() || null,
      });
      toast({ title: "Updated", description: "Request details updated." });
      setEditModal(null);
      fetchRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteUnlock = async (id: string) => {
    if (!confirm("Delete this unlock request?")) return;
    try {
      await api.delete(`/admin/game-access/unlock/${id}`);
      toast({ title: "Unlock Request Deleted" });
      fetchRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Game Access Requests</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage user game access requests
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by username, email, or game..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-input bg-muted/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", ""].map(s => (
            <button
              key={s || "all"}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "gradient-bg text-primary-foreground"
                  : "border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Game Username</th>
                <th className="px-4 py-3 font-medium">Password</th>
                <th className="px-4 py-3 font-medium">Game</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No requests found.
                  </td>
                </tr>
              ) : (
                paginated.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <div className="flex flex-col">
                        <CopyCell value={req.username} label="Username" />
                        <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{req.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <CopyCell value={req.game_username} label="Game Username" />
                    </td>
                    <td className="px-4 py-3.5">
                      {req.game_password ? (
                        <CopyCell value={req.game_password} label="Password" />
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {req.game_image ? (
                          <img src={req.game_image} alt={req.game_name} className="h-7 w-7 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-muted-foreground">{(req.game_name || "?")[0]}</span>
                          </div>
                        )}
                        <span className="text-foreground font-medium">{req.game_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(req.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_BADGE[req.status] || ""}`}>
                        {req.status === "pending" && <Clock className="h-2.5 w-2.5" />}
                        {req.status === "approved" && <CheckCircle className="h-2.5 w-2.5" />}
                        {req.status === "rejected" && <XCircle className="h-2.5 w-2.5" />}
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {req.status === "pending" && (
                          <>
                            <button
                              onClick={() => { setActionModal({ request: req, action: "approved" }); setAdminNote(""); setGamePassword(""); setEditGameUsername(""); }}
                              className="rounded-lg bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => { setActionModal({ request: req, action: "rejected" }); setAdminNote(""); }}
                              className="rounded-lg bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                            >
                              Reject
                            </button>
                            {providerGameIds.has(Number(req.game_id)) && (
                              <button
                                onClick={() => handleAutoCreate(req)}
                                disabled={autoCreatingId === req.id}
                                title="Auto-create the panel account via the assigned Game API provider"
                                className="rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                              >
                                {autoCreatingId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => {
                            setEditModal(req);
                            setEditModalUsername(req.game_username || "");
                            setEditPassword(req.game_password || "");
                            setEditNote(req.admin_note || "");
                          }}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnlock(req.id)}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Delete unlock request"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({filtered.length} total)
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/50 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Approve/Reject Modal */}
      <Dialog open={!!actionModal} onOpenChange={() => setActionModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionModal?.action === "approved" ? "Approve" : "Reject"} Game Access
            </DialogTitle>
            <DialogDescription>
              {actionModal?.action === "approved"
                ? `Confirm access for ${actionModal?.request.username} (${actionModal?.request.email}) on ${actionModal?.request.game_name}.`
                : `Provide a reason for rejecting ${actionModal?.request.username}'s request.`}
            </DialogDescription>
          </DialogHeader>

          {actionModal && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User:</span>
                  <span className="font-medium text-foreground">{actionModal.request.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Game Username:</span>
                  <span className="font-medium text-primary">{actionModal.request.game_username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium text-foreground">{actionModal.request.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Game:</span>
                  <span className="font-medium text-foreground">{actionModal.request.game_name}</span>
                </div>
              </div>

              {actionModal.action === "approved" && (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <p className="text-[11px] text-primary">
                      Leave both fields below blank to auto-assign the next available account from
                      this game's account pool (Admin → Games → Manage Accounts). Fill them in only
                      if you want to override with specific credentials.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Game Username (optional override)
                    </label>
                    <input
                      type="text"
                      value={editGameUsername}
                      onChange={(e) => setEditGameUsername(e.target.value)}
                      placeholder="Leave blank to auto-assign from pool"
                      className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${
                        editGameUsername.trim() && validateGameUsername(editGameUsername)
                          ? "border-destructive focus:border-destructive focus:ring-destructive"
                          : "border-input focus:border-primary focus:ring-primary"
                      }`}
                    />
                    {editGameUsername.trim() && validateGameUsername(editGameUsername) ? (
                      <p className="text-[11px] text-destructive mt-1">{validateGameUsername(editGameUsername)}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        User requested: {actionModal.request.game_username} · letters, numbers, _ - . only, {USERNAME_MIN}-{USERNAME_MAX} chars
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Game Password (optional override)
                    </label>
                    <input
                      type="text"
                      value={gamePassword}
                      onChange={(e) => setGamePassword(e.target.value)}
                      placeholder="Leave blank to auto-assign from pool"
                      className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${
                        gamePassword.trim() && validateGamePassword(gamePassword)
                          ? "border-destructive focus:border-destructive focus:ring-destructive"
                          : "border-input focus:border-primary focus:ring-primary"
                      }`}
                    />
                    {gamePassword.trim() && validateGamePassword(gamePassword) ? (
                      <p className="text-[11px] text-destructive mt-1">{validateGamePassword(gamePassword)}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        This password will be visible to the user on their game card. At least {PASSWORD_MIN} characters.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {actionModal.action === "rejected" ? "Rejection Reason *" : "Note (optional)"}
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder={actionModal.action === "rejected" ? "Provide a reason..." : "Optional note..."}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setActionModal(null)} disabled={processing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAction}
                  disabled={
                    processing ||
                    (actionModal.action === "approved" &&
                      ((!!editGameUsername.trim() && !!validateGameUsername(editGameUsername)) ||
                        (!!gamePassword.trim() && !!validateGamePassword(gamePassword))))
                  }
                  className={actionModal.action === "approved"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
                >
                  {processing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {actionModal.action === "approved" ? "Confirm Approval" : "Reject Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
            <DialogDescription>
              Update password or note for {editModal?.username}'s request on {editModal?.game_name}.
            </DialogDescription>
          </DialogHeader>

          {editModal && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User:</span>
                  <span className="font-medium text-foreground">{editModal.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Game Username:</span>
                  <span className="font-medium text-primary">{editModal.game_username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium text-foreground">{editModal.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_BADGE[editModal.status] || ""}`}>
                    {editModal.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Game Username *</label>
                <input
                  type="text"
                  value={editModalUsername}
                  onChange={(e) => setEditModalUsername(e.target.value)}
                  placeholder="Game username..."
                  className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Auto-filled from the request. Edit if needed.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Game Password</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter or update password..."
                  className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Admin Note</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Add or update note..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setEditModal(null)} disabled={processing}>
                  Cancel
                </Button>
                <Button onClick={handleEdit} disabled={processing}>
                  {processing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGameAccessRequests;