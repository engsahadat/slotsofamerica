import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Gift, Save, DollarSign, Phone, Mail, User, Search,
  ShieldCheck, CheckCircle2, XCircle, Clock, Hash, ChevronLeft,
  ChevronRight, Eye, Settings, Users, History, TrendingUp, Award, Trash2, Plus,
} from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PhoneVerificationRequests from "@/components/admin/PhoneVerificationRequests";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ──────────────────────────────────────────
interface RewardItem { id: string; key: string; value: number; description: string | null; is_active: boolean; }
interface VerificationUser {
  id: string; username: string | null; display_name: string | null; email: string | null; phone: string | null;
  email_verified: boolean; phone_verified: boolean; first_name: string | null; last_name: string | null;
}
interface VerificationCode {
  id: string; user_id: string; type: string; code: string; expires_at: string; attempts: number; verified: boolean; created_at: string;
}
interface VerificationSettings {
  id: string; otp_expiry_minutes: number; resend_cooldown_seconds: number; max_attempts: number; max_per_hour: number;
  email_verification_enabled: boolean; phone_verification_enabled: boolean;
  smtp_host: string; smtp_port: number; smtp_email: string; smtp_password: string;
  smtp_username?: string; mail_from_address?: string; mail_from_name?: string;
  brevo_api_key: string;
  brevo_email_sender: string; brevo_email_sender_name: string; brevo_sms_sender: string;
  brevo_email_enabled: boolean; brevo_sms_enabled: boolean;
}
interface RewardHistoryEntry {
  id: string; user_id: string; reward_key: string; amount: number; created_at: string;
}

const DEFAULT_SETTINGS: VerificationSettings = {
  id: "", otp_expiry_minutes: 10, resend_cooldown_seconds: 60, max_attempts: 5, max_per_hour: 5,
  email_verification_enabled: true, phone_verification_enabled: true,
  smtp_host: "", smtp_port: 465, smtp_email: "", smtp_password: "",
  brevo_api_key: "",
  brevo_email_sender: "", brevo_email_sender_name: "", brevo_sms_sender: "",
  brevo_email_enabled: false, brevo_sms_enabled: false,
};

const PAGE_SIZE = 10;

const REWARD_META: Record<string, { label: string; icon: typeof User; color: string }> = {
  profile_completion_reward: { label: "Profile Completion", icon: User, color: "text-amber-400" },
  email_verification_reward: { label: "Email Verification", icon: Mail, color: "text-emerald-400" },
  phone_verification_reward: { label: "Phone Verification", icon: Phone, color: "text-sky-400" },
};

const REWARD_DESCRIPTIONS: Record<string, string> = {
  profile_completion_reward: "Credited when a user completes their full profile",
  email_verification_reward: "Credited when a user verifies their email address",
  phone_verification_reward: "Credited when a user verifies their phone number",
};

// ── Stat Card ──────────────────────────────────────
function StatCard({ icon: Icon, label, value, pct, color, trend }: {
  icon: typeof Users; label: string; value: number; pct?: number; color: string; trend?: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            <TrendingUp className="h-3 w-3" /> {trend}
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      {pct !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground mb-1">
            <span>Completion</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toggle Switch ──────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
        checked ? "border-primary bg-primary" : "border-border bg-muted"
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 ${
        checked ? "translate-x-5" : "translate-x-0"
      }`} />
    </button>
  );
}

// ── Component ──────────────────────────────────────
const AdminRewards = () => {
  const { role } = useAuth();
  const isManager = role === "manager";
  const [tab, setTab] = useState<"rewards" | "verification" | "phone" | "history">(
    isManager ? "phone" : "rewards",
  );
  const [loading, setLoading] = useState(true);

  // Rewards state
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [editValues, setEditValues] = useState<Record<string, { value: number; is_active: boolean }>>({});
  const [saving, setSaving] = useState(false);

  // Verification state
  const [users, setUsers] = useState<VerificationUser[]>([]);
  const [codes, setCodes] = useState<VerificationCode[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unverified" | "verified">("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [userCodes, setUserCodes] = useState<VerificationCode[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [settings, setSettings] = useState<VerificationSettings>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // History state
  const [history, setHistory] = useState<RewardHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchAll = async () => {
    if (isManager) {
      setLoading(false);
      return;
    }
    try {
      const [rewardsRes, usersRes, codesRes, settingsRes, historyRes] = await Promise.all([
        api.get("/admin/rewards"),
        api.get("/admin/verifications/users"),
        api.get("/admin/verifications/codes"),
        api.get("/admin/verifications/settings"),
        api.get("/admin/verifications/history"),
      ]);

      const items = (rewardsRes.data?.rewards || []) as unknown as RewardItem[];
      setRewards(items);
      const vals: Record<string, { value: number; is_active: boolean }> = {};
      items.forEach((r) => { vals[r.id] = { value: Number(r.value), is_active: r.is_active }; });
      setEditValues(vals);

      const rawUsers = usersRes.data?.users || [];
      const mappedUsers: VerificationUser[] = rawUsers.map((u: any) => ({
        id: u.id,
        username: u.username || "",
        display_name: u.name || u.username || u.email || "",
        email: u.email || "",
        phone: u.phone || "",
        email_verified: !!u.email_verified_at,
        phone_verified: !!u.phone_verified,
        first_name: u.name ? u.name.split(" ")[0] : "",
        last_name: u.name ? u.name.split(" ").slice(1).join(" ") : "",
      }));
      setUsers(mappedUsers);

      const rawCodes = codesRes.data?.codes || [];
      const mappedCodes: VerificationCode[] = rawCodes.map((c: any) => ({
        id: String(c.id),
        user_id: String(c.user_id),
        type: c.channel,
        code: "*****",
        expires_at: c.expires_at,
        attempts: c.attempts,
        verified: !!c.verified_at,
        created_at: c.created_at,
      }));
      setCodes(mappedCodes);

      if (settingsRes.data?.settings) {
        // smtp_email isn't a real backend column (it's an on-save alias for smtp_username/
        // mail_from_address, see AdminVerificationApiController::updateSettings) — backfill it
        // from smtp_username on load so the field doesn't appear to reset after a save+refetch.
        const s = settingsRes.data.settings;
        setSettings({ ...s, smtp_email: s.smtp_email || s.smtp_username || "" });
      }

      const rawHistory = (historyRes.data?.history || []).map((h: any) => ({
        id: String(h.id),
        user_id: String(h.user_id),
        reward_key: h.reward_key,
        amount: Number(h.amount),
        created_at: h.created_at,
      }));
      setHistory(rawHistory);
    } catch (err: any) {
      toast({ title: "Error loading verification data", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (isManager) setTab("phone");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  // ── Stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = users.length;
    const emailVerified = users.filter((u) => u.email_verified).length;
    const phoneVerified = users.filter((u) => u.phone_verified).length;
    const profileComplete = users.filter((u) => u.first_name && u.last_name && u.email && u.phone).length;
    const totalRewarded = history.reduce((sum, h) => sum + h.amount, 0);
    return { total, emailVerified, phoneVerified, profileComplete, totalRewarded };
  }, [users, history]);

  // ── Rewards handlers ──────────────────────────
  const handleSaveRewards = async () => {
    setSaving(true);
    let hasError = false;
    for (const reward of rewards) {
      const edit = editValues[reward.id];
      if (!edit) continue;
      try {
        await api.put(`/admin/rewards/${reward.id}`, { value: edit.value, is_active: edit.is_active });
      } catch (err: any) {
        hasError = true;
        toast({ title: "Error saving", description: err.response?.data?.message || err.message, variant: "destructive" });
      }
    }
    setSaving(false);
    if (!hasError) { toast({ title: "Rewards config saved!" }); fetchAll(); }
  };

  const handleDeleteReward = async (id: string, key: string) => {
    if (!confirm(`Delete reward rule "${key}"?`)) return;
    try {
      await api.delete(`/admin/rewards/${id}`);
      toast({ title: "Reward Rule Deleted" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error deleting", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  // ── Verification handlers ─────────────────────
  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || (u.username || "").toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.phone || "").toLowerCase().includes(q);
      const matchesFilter = filter === "all" || (filter === "verified" && u.email_verified && u.phone_verified) || (filter === "unverified" && (!u.email_verified || !u.phone_verified));
      return matchesSearch && matchesFilter;
    });
  }, [users, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleViewUser = (user: VerificationUser) => { setSelectedUser(user); setUserCodes(codes.filter((c) => c.user_id === user.id)); };

  const handleAdminVerify = async (userId: string, type: "email" | "phone") => {
    setVerifying(true);
    try {
      const currentVerified = type === "email"
        ? users.find((u) => u.id === userId)?.email_verified
        : users.find((u) => u.id === userId)?.phone_verified;

      const res = await api.post("/admin/verifications/toggle", {
        user_id: userId,
        type,
        verified: !currentVerified,
      });

      toast({ title: res.data?.message || `${type === "email" ? "Email" : "Phone"} verification updated` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error updating verification", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleReject = async (userId: string, type: "email" | "phone") => {
    try {
      await api.post("/admin/verifications/codes/invalidate", { user_id: userId, channel: type === "email" ? "email" : "sms" });
      toast({ title: `Pending ${type} verification codes invalidated` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error invalidating codes", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await api.post("/admin/verifications/settings", settings);
      toast({ title: res.data?.message || "Verification settings saved successfully!" });
      if (res.data?.settings) setSettings(res.data.settings);
    } catch (err: any) {
      toast({ title: "Error saving settings", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  // ── History helpers ───────────────────────────
  const historyTotalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const historyPaginated = history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

  const getUserDisplay = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    return u ? (u.display_name || u.username || u.email || "Unknown") : userId.slice(0, 8) + "…";
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="h-12 w-12 rounded-2xl gradient-bg flex items-center justify-center animate-pulse">
        <Gift className="h-6 w-6 text-primary-foreground" />
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading rewards & verification…</p>
    </div>
  );

  const pct = (n: number) => stats.total ? Math.round((n / stats.total) * 100) : 0;

  return (
    <div className="space-y-8 animate-slide-in">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-bg shadow-lg shadow-primary/20">
              <Award className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-wide">Rewards & Verification</h1>
              <p className="text-sm text-muted-foreground">Configure rewards, manage user verification, and track payouts</p>
            </div>
          </div>
        </div>
      </div>


      {/* ═══ Stats Dashboard (admin only) ═══ */}
      {!isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Users} label="Total Users" value={stats.total} color="from-primary to-primary/70" />
          <StatCard icon={Mail} label="Email Verified" value={stats.emailVerified} pct={pct(stats.emailVerified)} color="from-emerald-500 to-emerald-600" />
          <StatCard icon={Phone} label="Phone Verified" value={stats.phoneVerified} pct={pct(stats.phoneVerified)} color="from-sky-500 to-sky-600" />
          <StatCard icon={User} label="Profile Complete" value={stats.profileComplete} pct={pct(stats.profileComplete)} color="from-amber-500 to-amber-600" />
          <StatCard icon={DollarSign} label="Total Rewarded" value={stats.totalRewarded} color="from-violet-500 to-violet-600" trend={history.length > 0 ? `${history.length} payouts` : undefined} />
        </div>
      )}

      {/* ═══ Tabs ═══ */}
      <div className="flex gap-1 rounded-xl bg-muted/40 p-1.5 border border-border">
        {(isManager
          ? [{ key: "phone" as const, label: "Phone Verification", icon: Phone }]
          : [
              { key: "rewards" as const, label: "Reward Config", icon: Gift },
              { key: "verification" as const, label: "User Verification", icon: ShieldCheck },
              { key: "phone" as const, label: "Phone Verification", icon: Phone },
              { key: "history" as const, label: "Reward History", icon: History },
            ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
              tab === t.key
                ? "gradient-bg text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ═══ TAB: Phone Verification ═══            */}
      {/* ═══════════════════════════════════════════ */}
      {tab === "phone" && (
        <div className="space-y-5">
          <PhoneVerificationRequests />
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ═══ TAB: Reward Config ═══                 */}
      {/* ═══════════════════════════════════════════ */}
      {tab === "rewards" && !isManager && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {rewards.map((reward) => {
              const meta = REWARD_META[reward.key] || { label: reward.key, icon: DollarSign, color: "text-primary" };
              const desc = REWARD_DESCRIPTIONS[reward.key] || reward.description || "";
              const edit = editValues[reward.id];
              if (!edit) return null;
              const IconComp = meta.icon;
              return (
                <div key={reward.id} className={`group relative rounded-2xl border bg-card p-6 transition-all hover:shadow-lg ${
                  edit.is_active ? "border-primary/20 hover:border-primary/40 hover:shadow-primary/5" : "border-border opacity-60"
                }`}>
                  {/* Status Badge & Delete */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteReward(reward.id, meta.label)}
                      className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete Reward Rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <Toggle checked={edit.is_active} onChange={(v) => setEditValues((prev) => ({ ...prev, [reward.id]: { ...prev[reward.id], is_active: v } }))} />
                  </div>

                  {/* Icon & Label */}
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${
                    reward.key === "profile_completion_reward" ? "from-amber-500 to-amber-600" :
                    reward.key === "email_verification_reward" ? "from-emerald-500 to-emerald-600" :
                    "from-sky-500 to-sky-600"
                  } shadow-lg mb-4`}>
                    <IconComp className="h-6 w-6 text-white" />
                  </div>

                  <h3 className="text-base font-bold text-foreground mb-1">{meta.label}</h3>
                  <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{desc}</p>

                  {/* Amount Input */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Reward Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">$</span>
                      <input
                        type="number" min="0" step="0.01" value={edit.value}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, [reward.id]: { ...prev[reward.id], value: parseFloat(e.target.value) || 0 } }))}
                        className="w-full rounded-xl border border-border bg-muted/30 pl-10 pr-4 py-3 text-lg font-bold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Status Label */}
                  <div className="mt-4 flex items-center gap-2">
                    {edit.is_active ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5" /> Disabled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveRewards} disabled={saving}
              className="flex items-center gap-2 rounded-xl gradient-bg px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Rewards Config
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ═══ TAB: User Verification ═══             */}
      {/* ═══════════════════════════════════════════ */}
      {tab === "verification" && !isManager && (
        <div className="space-y-5">

          {/* Settings Toggle */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Manage individual user verification statuses</p>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                showSettings ? "gradient-bg text-primary-foreground shadow-md" : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Settings className="h-4 w-4" /> OTP Settings
            </button>
          </div>

          {/* Verification Settings Panel */}
          {showSettings && (
            <div className="rounded-2xl border border-primary/20 bg-card p-6 space-y-5 shadow-lg shadow-primary/5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Verification Settings</h3>
                  <p className="text-xs text-muted-foreground">Configure OTP behavior and limits globally</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { key: "email_verification_enabled" as const, icon: Mail, label: "Email Verification", desc: "Allow users to verify email via OTP" },
                  { key: "phone_verification_enabled" as const, icon: Phone, label: "Phone Verification", desc: "Allow users to verify phone via live chat" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                    <Toggle checked={settings[item.key]} onChange={(v) => setSettings((s) => ({ ...s, [item.key]: v }))} />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: "otp_expiry_minutes" as const, label: "OTP Expiry", unit: "min", min: 1, max: 60 },
                  { key: "resend_cooldown_seconds" as const, label: "Resend Cooldown", unit: "sec", min: 10, max: 300 },
                  { key: "max_attempts" as const, label: "Max Attempts", unit: "tries", min: 1, max: 20 },
                  { key: "max_per_hour" as const, label: "Max / Hour", unit: "codes", min: 1, max: 20 },
                ].map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{field.label}</label>
                    <div className="relative">
                      <input type="number" min={field.min} max={field.max} value={settings[field.key]}
                        onChange={(e) => setSettings((s) => ({ ...s, [field.key]: Math.max(field.min, Math.min(field.max, parseInt(e.target.value) || field.min)) }))}
                        className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">{field.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground border-t border-border pt-4">
                SMTP and Brevo (Email/SMS) delivery credentials are configured on{" "}
                <span className="font-semibold text-foreground">Site Settings → API Keys & Secrets</span> — this panel only
                controls verification behavior/limits above.
              </p>

              <div className="flex items-center gap-3">
                <button onClick={handleSaveSettings} disabled={savingSettings}
                  className="flex items-center gap-2 rounded-xl gradient-bg px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
                </button>
              </div>
            </div>
          )}

          {/* Search & Filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Search users…" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
            <div className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border">
              {[
                { key: "all" as const, label: "All" },
                { key: "unverified" as const, label: "Unverified" },
                { key: "verified" as const, label: "Verified" },
              ].map((f) => (
                <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">User</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Phone</th>
                    <th className="px-5 py-3.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="px-5 py-3.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Phone</th>
                    <th className="px-5 py-3.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-16 text-center">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No users found</p>
                    </td></tr>
                  ) : paginated.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-bg text-xs font-bold text-primary-foreground uppercase shadow-sm">
                            {(u.username || u.display_name || "?")[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm">{u.display_name || u.username || "—"}</p>
                            <p className="text-[11px] text-muted-foreground">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[180px] truncate">{u.email || "—"}</td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">{u.phone || "—"}</td>
                      <td className="px-5 py-3.5 text-center">
                        {u.email_verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Verified</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"><Clock className="h-3 w-3" /> Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {u.phone_verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Verified</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"><Clock className="h-3 w-3" /> Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button onClick={() => handleViewUser(u)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors">
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-xs font-semibold text-muted-foreground">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Detail Modal */}
          <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
            <DialogContent className="sm:max-w-lg border-border bg-card">
              {selectedUser && (
                <div>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-bg text-lg font-bold text-primary-foreground uppercase shadow-lg">
                        {(selectedUser.username || selectedUser.display_name || "?")[0]}
                      </div>
                      <div>
                        <span className="text-lg">{selectedUser.display_name || selectedUser.username || "Unknown"}</span>
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">{selectedUser.email}</p>
                      </div>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Email Card */}
                      <div className={`rounded-xl border p-4 ${selectedUser.email_verified ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                        <div className="flex items-center gap-2 mb-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-bold text-foreground">Email</span></div>
                        {selectedUser.email_verified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                        ) : (
                          <div className="space-y-2">
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3.5 w-3.5" /> Not Verified</span>
                            <button onClick={() => handleAdminVerify(selectedUser.id, "email")} disabled={verifying}
                              className="w-full rounded-lg bg-emerald-500/10 border border-emerald-500/20 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              {verifying ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Mark Verified"}
                            </button>
                            <button onClick={() => handleReject(selectedUser.id, "email")}
                              className="w-full rounded-lg bg-destructive/10 border border-destructive/20 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20 transition-colors">
                              Reject / Invalidate
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Phone Card */}
                      <div className={`rounded-xl border p-4 ${selectedUser.phone_verified ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                        <div className="flex items-center gap-2 mb-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-bold text-foreground">Phone</span></div>
                        <p className="text-xs text-muted-foreground mb-2">{selectedUser.phone || "No phone"}</p>
                        {selectedUser.phone_verified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
                        ) : (
                          <div className="space-y-2">
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3.5 w-3.5" /> Not Verified</span>
                            <button onClick={() => handleAdminVerify(selectedUser.id, "phone")} disabled={verifying}
                              className="w-full rounded-lg bg-emerald-500/10 border border-emerald-500/20 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              {verifying ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Mark Verified"}
                            </button>
                            <button onClick={() => handleReject(selectedUser.id, "phone")}
                              className="w-full rounded-lg bg-destructive/10 border border-destructive/20 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20 transition-colors">
                              Reject / Invalidate
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Verification Codes */}
                    {userCodes.length > 0 && (
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Verification Codes</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {userCodes.map((c) => {
                            const isExpired = new Date(c.expires_at) < new Date();
                            return (
                              <div key={c.id} className="flex items-center justify-between text-xs rounded-lg border border-border bg-card p-2.5">
                                <div className="flex items-center gap-3">
                                  {c.type === "email" ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <Phone className="h-3.5 w-3.5 text-muted-foreground" />}
                                  <span className="font-mono font-bold text-foreground tracking-wider">{c.code}</span>
                                  <span className="text-muted-foreground capitalize">{c.type}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-muted-foreground">×{c.attempts}</span>
                                  {c.verified ? <span className="text-emerald-400 font-bold">Used</span> : isExpired ? <span className="text-destructive font-bold">Expired</span> : <span className="text-amber-400 font-bold">Active</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ═══ TAB: Reward History ═══                */}
      {/* ═══════════════════════════════════════════ */}
      {tab === "history" && !isManager && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Track which users received rewards and when</p>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">User</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reward</th>
                    <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                    <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyPaginated.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-16 text-center">
                      <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No reward history yet</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Rewards will appear here once users complete verification actions</p>
                    </td></tr>
                  ) : historyPaginated.map((h) => {
                    const meta = REWARD_META[h.reward_key];
                    const IconComp = meta?.icon || DollarSign;
                    return (
                      <tr key={h.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg text-[10px] font-bold text-primary-foreground uppercase">
                              {getUserDisplay(h.user_id)[0]}
                            </div>
                            <span className="text-sm font-semibold text-foreground">{getUserDisplay(h.user_id)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <IconComp className={`h-4 w-4 ${meta?.color || "text-primary"}`} />
                            <span className="text-sm text-foreground">{meta?.label || h.reward_key}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="font-mono font-bold text-emerald-400">${h.amount.toFixed(2)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleDateString()} {new Date(h.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  {(historyPage - 1) * PAGE_SIZE + 1}–{Math.min(historyPage * PAGE_SIZE, history.length)} of {history.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-xs font-semibold text-muted-foreground">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRewards;
