import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, Search, Loader2, Mail, Calendar, Wallet,
  Shield, ShieldCheck, User, Hash, ChevronLeft, ChevronRight,
  Download, Phone, CheckCircle2, XCircle, Flag, AlertTriangle, Plus, Trash2, PenSquare,
} from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserProfile {
  id: number;
  username: string | null;
  name: string;
  email: string | null;
  balance: number;
  created_at: string;
  phone: string | null;
  country: string | null;
  email_verified_by_admin: boolean;
  phone_verified: boolean;
  is_flagged: boolean;
  flagged_at: string | null;
  flagged_reason: string | null;
  role?: string;
}

const roleColors: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  manager: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  user: "bg-green-500/10 text-green-400 border-green-500/20",
};

const roleIcons: Record<string, typeof Shield> = {
  admin: ShieldCheck,
  manager: Shield,
  user: User,
};

const PAGE_SIZE = 10;

const AdminUsers = () => {
  const { role: currentRole } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [firstAdminId, setFirstAdminId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager" | "user">("all");
  const [flagFilter, setFlagFilter] = useState<"all" | "flagged" | "unflagged">("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [page, setPage] = useState(1);
  const [changingRole, setChangingRole] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Add User State
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "manager" | "admin">("user");
  const [newBalance, setNewBalance] = useState("0");
  const [newPhone, setNewPhone] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserErrors, setCreateUserErrors] = useState<Record<string, string>>({});

  // Delete User State
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Adjust Balance State
  const [adjustBalanceOpen, setAdjustBalanceOpen] = useState(false);
  const [balanceType, setBalanceType] = useState<"add" | "subtract" | "set">("add");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState("");
  const [adjustingBalance, setAdjustingBalance] = useState(false);
  const [adjustBalanceErrors, setAdjustBalanceErrors] = useState<Record<string, string>>({});

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!newUsername.trim()) errs.username = "Username is required";
    if (!newName.trim()) errs.name = "Full Name is required";
    if (!newEmail.trim()) errs.email = "Email is required";
    if (!newPassword.trim()) errs.password = "Password is required";
    else if (newPassword.trim().length < 6) errs.password = "Password must be at least 6 characters";
    if (Object.keys(errs).length > 0) {
      setCreateUserErrors(errs);
      return;
    }
    setCreateUserErrors({});
    setCreatingUser(true);
    try {
      const res = await api.post("/admin/users", {
        username: newUsername.trim(),
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword.trim(),
        role: newRole,
        balance: parseFloat(newBalance) || 0,
        phone: newPhone.trim() || null,
      });
      toast({ title: "User Created", description: `${newName} has been registered.` });
      setAddUserOpen(false);
      setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewBalance("0"); setNewPhone("");
      fetchUsers();
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const sErrors: Record<string, string> = {};
        Object.entries(err.response.data.errors).forEach(([k, v]: [string, any]) => {
          sErrors[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setCreateUserErrors(sErrors);
      } else {
        toast({ title: "Error", description: err.response?.data?.message || "Failed to create user.", variant: "destructive" });
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setDeletingUser(true);
    try {
      await api.delete(`/admin/users/${deleteConfirmUser.id}`);
      toast({ title: "User Deleted", description: `User #${deleteConfirmUser.id} has been removed.` });
      setDeleteConfirmUser(null);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to delete user.", variant: "destructive" });
    } finally {
      setDeletingUser(false);
    }
  };

  const fetchUsers = async () => {
    try {
      let page = 1;
      let lastPage = 1;
      let allUsers: UserProfile[] = [];
      do {
        const res = await api.get("/admin/users", { params: { per_page: 500, page } });
        allUsers = allUsers.concat((res.data.data || []) as UserProfile[]);
        lastPage = res.data.last_page || 1;
        page++;
      } while (page <= lastPage);
      setUsers(allUsers);

      const admins = allUsers.filter((u) => u.role === "admin");
      if (admins.length > 0) {
        const first = admins.reduce((a, b) =>
          new Date(a.created_at) < new Date(b.created_at) ? a : b
        );
        setFirstAdminId(first.id);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to load users.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        (currentRole === "admin" && (u.email || "").toLowerCase().includes(q));
      const matchesRole = roleFilter === "all" || (u.role || "user") === roleFilter;
      const matchesFlag = flagFilter === "all" || (flagFilter === "flagged" ? u.is_flagged : !u.is_flagged);
      return matchesSearch && matchesRole && matchesFlag;
    });
  }, [users, search, roleFilter, flagFilter, currentRole]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleRoleChange = async (userId: number, newRole: "admin" | "manager" | "user") => {
    if (userId === firstAdminId) {
      toast({ title: "Error", description: "Cannot change the primary admin's role", variant: "destructive" });
      return;
    }
    setChangingRole(true);
    try {
      const res = await api.post(`/admin/users/${userId}/role`, { role: newRole });
      const updated = res.data.user as UserProfile;
      toast({ title: `Role updated to ${newRole}` });
      setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, ...updated } : prev));
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
    } catch (err) {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    } finally {
      setChangingRole(false);
    }
  };

  const handleToggleFlag = async () => {
    if (!selectedUser) return;
    setTogglingFlag(true);
    try {
      const reason = !selectedUser.is_flagged ? "Manually flagged by admin" : undefined;
      const res = await api.post(`/admin/users/${selectedUser.id}/flag`, reason ? { reason } : {});
      const updated = res.data.user as UserProfile;
      toast({ title: updated.is_flagged ? "Account flagged" : "Account unflagged" });
      setSelectedUser((prev) => (prev ? { ...prev, ...updated } : prev));
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      toast({ title: "Error", description: "Failed to update flag status.", variant: "destructive" });
    } finally {
      setTogglingFlag(false);
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const errs: Record<string, string> = {};
    const amountNum = parseFloat(balanceAmount);
    if (!balanceAmount.trim() || Number.isNaN(amountNum)) errs.amount = "Enter a valid amount";
    else if (amountNum < 0) errs.amount = "Amount cannot be negative";
    if (!balanceReason.trim()) errs.reason = "Reason is required";
    if (Object.keys(errs).length > 0) {
      setAdjustBalanceErrors(errs);
      return;
    }
    setAdjustBalanceErrors({});
    setAdjustingBalance(true);
    try {
      const res = await api.post(`/admin/users/${selectedUser.id}/balance`, {
        amount: amountNum,
        type: balanceType,
        reason: balanceReason.trim(),
      });
      const updated = res.data.user as UserProfile;
      toast({ title: "Balance Updated", description: `New balance: $${Number(updated.balance).toFixed(2)}` });
      setSelectedUser((prev) => (prev ? { ...prev, ...updated } : prev));
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setAdjustBalanceOpen(false);
      setBalanceAmount(""); setBalanceReason(""); setBalanceType("add");
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const sErrors: Record<string, string> = {};
        Object.entries(err.response.data.errors).forEach(([k, v]: [string, any]) => {
          sErrors[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setAdjustBalanceErrors(sErrors);
      } else {
        toast({ title: "Error", description: err.response?.data?.message || "Failed to adjust balance.", variant: "destructive" });
      }
    } finally {
      setAdjustingBalance(false);
    }
  };

  // Export currently loaded users to JSON. Admins get email/phone; managers get a limited set.
  const handleExport = () => {
    setExporting(true);
    try {
      const exportData = users.map((u) => ({
        username: u.username,
        name: u.name,
        ...(currentRole === "admin" ? { email: u.email, phone: u.phone } : {}),
        balance: u.balance,
        country: u.country,
        role: u.role,
        created_at: u.created_at,
      }));
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${exportData.length} user(s) exported.` });
    } finally {
      setExporting(false);
    }
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Users</h1>
          <p className="text-muted-foreground mt-1">
            {users.length} registered user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentRole === "admin" && (
            <button
              onClick={() => setAddUserOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add User
            </button>
          )}
          <button onClick={handleExport} disabled={exporting || users.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by username, name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-input bg-muted/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as any); setPage(1); }}
          className="rounded-lg border border-input bg-muted/50 py-2.5 px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="user">User</option>
        </select>
        <select value={flagFilter} onChange={(e) => { setFlagFilter(e.target.value as any); setPage(1); }}
          className="rounded-lg border border-input bg-muted/50 py-2.5 px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer">
          <option value="all">All Status</option>
          <option value="flagged">🚩 Flagged</option>
          <option value="unflagged">Clean</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">User</th>
                {currentRole === "admin" && <th className="px-6 py-3 font-medium">Email</th>}
                {currentRole === "admin" && <th className="px-6 py-3 font-medium">Phone</th>}
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium text-right">Balance</th>
                <th className="px-6 py-3 font-medium text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={currentRole === "admin" ? 5 : 3} className="px-6 py-12 text-center text-muted-foreground">
                    {search || roleFilter !== "all" ? "No users match your filters." : "No users found."}
                  </td>
                </tr>
              ) : (
                paginated.map((u) => {
                  const RoleIcon = roleIcons[u.role || "user"] || User;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className="hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-bg text-xs font-bold text-primary-foreground uppercase relative">
                            {(u.username || u.name || "?")[0]}
                            {u.is_flagged && (
                              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive flex items-center justify-center">
                                <Flag className="h-2 w-2 text-destructive-foreground" />
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-foreground flex items-center gap-1.5">
                              {u.name || u.username || "—"}
                              {u.is_flagged && <span className="text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded px-1">FLAGGED</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      {currentRole === "admin" && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="text-xs">{u.email || "—"}</span>
                          </div>
                        </td>
                      )}
                      {currentRole === "admin" && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="text-xs">{u.phone || "—"}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${roleColors[u.role || "user"]}`}>
                          <RoleIcon className="h-3 w-3" />
                          {u.role || "user"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <Wallet className="h-3.5 w-3.5 text-primary" />
                          ${Number(u.balance).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">{new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}{"–"}{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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
      </div>

      {/* User Detail Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          {selectedUser && (() => {
            const RoleIcon = roleIcons[selectedUser.role || "user"] || User;
            return (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-bg text-lg font-bold text-primary-foreground uppercase">
                      {(selectedUser.username || selectedUser.name || "?")[0]}
                    </div>
                    <div>
                      <span>{selectedUser.name || selectedUser.username || "Unknown"}</span>
                      <p className="text-xs text-muted-foreground font-normal mt-0.5">@{selectedUser.username || "—"}</p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-5 space-y-4">
                  {/* Balance */}
                  <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Balance</p>
                    <p className="text-3xl font-display font-bold">${Number(selectedUser.balance).toFixed(2)}</p>
                    {currentRole === "admin" && (
                      <button
                        onClick={() => { setBalanceAmount(""); setBalanceReason(""); setBalanceType("add"); setAdjustBalanceErrors({}); setAdjustBalanceOpen(true); }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <PenSquare className="h-3.5 w-3.5" /> Adjust Balance
                      </button>
                    )}
                  </div>

                  {/* Info rows */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Shield className="h-3 w-3" />Role</span>
                      {currentRole === "admin" && selectedUser.id !== firstAdminId ? (
                        <div className="flex items-center gap-1.5">
                          {changingRole && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          <select
                            value={selectedUser.role || "user"}
                            onChange={(e) => handleRoleChange(selectedUser.id, e.target.value as "admin" | "manager" | "user")}
                            disabled={changingRole}
                            className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs font-semibold capitalize text-foreground outline-none focus:border-primary transition-colors disabled:opacity-50"
                          >
                            <option value="user">User</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${roleColors[selectedUser.role || "user"]}`}>
                          <RoleIcon className="h-3 w-3" />
                          {selectedUser.role || "user"}
                        </span>
                      )}
                    </div>

                    {currentRole === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" />Email</span>
                        <span className="text-sm font-medium">{selectedUser.email || "—"}</span>
                      </div>
                    )}

                    {currentRole === "admin" && selectedUser.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="h-3 w-3" />Phone</span>
                        <span className="text-sm font-medium">{selectedUser.phone}</span>
                      </div>
                    )}

                    {selectedUser.country && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="h-3 w-3" />Country</span>
                        <span className="text-sm font-medium">{selectedUser.country}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3 w-3" />Joined</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedUser.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </span>
                    </div>

                    {/* Verification Status (read-only — manual admin verify action is not yet available) */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" />Email Verified</span>
                      {selectedUser.email_verified_by_admin ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" /> Not verified</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="h-3 w-3" />Phone Verified</span>
                      {selectedUser.phone_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" /> Not verified</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="h-3 w-3" />User ID</span>
                      <span className="text-xs font-mono text-muted-foreground">#{selectedUser.id}</span>
                    </div>
                  </div>

                  {/* Flag/Unflag toggle (admin only) */}
                  {currentRole === "admin" && selectedUser.role !== "admin" && (
                    <button
                      onClick={handleToggleFlag}
                      disabled={togglingFlag}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                        selectedUser.is_flagged
                          ? "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                          : "bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20"
                      }`}
                    >
                      {togglingFlag ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : selectedUser.is_flagged ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Flag className="h-4 w-4" />
                      )}
                      {selectedUser.is_flagged ? "Unflag Account" : "Flag Account"}
                    </button>
                  )}

                  {/* Flagged info */}
                  {selectedUser.is_flagged && selectedUser.flagged_reason && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                      <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> Flagged
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedUser.flagged_reason}</p>
                      {selectedUser.flagged_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(selectedUser.flagged_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Delete user button (admin only, except primary admin) */}
                  {currentRole === "admin" && selectedUser.id !== firstAdminId && (
                    <button
                      onClick={() => setDeleteConfirmUser(selectedUser)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" /> Delete User Account
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Plus className="h-5 w-5 text-primary" /> Create New User
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Username *</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => { setNewUsername(e.target.value); if (createUserErrors.username) setCreateUserErrors(p => ({ ...p, username: "" })); }}
                placeholder="e.g. john_doe"
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                  createUserErrors.username ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {createUserErrors.username && <p className="text-xs text-destructive font-medium mt-1">{createUserErrors.username}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); if (createUserErrors.name) setCreateUserErrors(p => ({ ...p, name: "" })); }}
                placeholder="e.g. John Doe"
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                  createUserErrors.name ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {createUserErrors.name && <p className="text-xs text-destructive font-medium mt-1">{createUserErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); if (createUserErrors.email) setCreateUserErrors(p => ({ ...p, email: "" })); }}
                  placeholder="john@example.com"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                    createUserErrors.email ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {createUserErrors.email && <p className="text-xs text-destructive font-medium mt-1">{createUserErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Password *</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); if (createUserErrors.password) setCreateUserErrors(p => ({ ...p, password: "" })); }}
                placeholder="Minimum 6 characters"
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                  createUserErrors.password ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {createUserErrors.password && <p className="text-xs text-destructive font-medium mt-1">{createUserErrors.password}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Initial Balance ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddUserOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingUser}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {creatingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create User"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog */}
      <Dialog open={adjustBalanceOpen} onOpenChange={setAdjustBalanceOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Wallet className="h-5 w-5 text-primary" /> Adjust Balance
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleAdjustBalance} className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                Current balance for <strong className="text-foreground">@{selectedUser.username}</strong>: ${Number(selectedUser.balance).toFixed(2)}
              </p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Action</label>
                <select
                  value={balanceType}
                  onChange={(e) => setBalanceType(e.target.value as "add" | "subtract" | "set")}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="add">Add to balance</option>
                  <option value="subtract">Subtract from balance</option>
                  <option value="set">Set balance to</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Amount ($) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={balanceAmount}
                  onChange={(e) => { setBalanceAmount(e.target.value); if (adjustBalanceErrors.amount) setAdjustBalanceErrors(p => ({ ...p, amount: "" })); }}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                    adjustBalanceErrors.amount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {adjustBalanceErrors.amount && <p className="text-xs text-destructive font-medium mt-1">{adjustBalanceErrors.amount}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason *</label>
                <input
                  type="text"
                  value={balanceReason}
                  onChange={(e) => { setBalanceReason(e.target.value); if (adjustBalanceErrors.reason) setAdjustBalanceErrors(p => ({ ...p, reason: "" })); }}
                  placeholder="e.g. Manual correction, goodwill credit..."
                  className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors ${
                    adjustBalanceErrors.reason ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {adjustBalanceErrors.reason && <p className="text-xs text-destructive font-medium mt-1">{adjustBalanceErrors.reason}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustBalanceOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustingBalance}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {adjustingBalance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Delete User Account
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete user <strong className="text-foreground">@{deleteConfirmUser?.username}</strong> (#{deleteConfirmUser?.id})? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setDeleteConfirmUser(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={deletingUser}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-2"
            >
              {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
