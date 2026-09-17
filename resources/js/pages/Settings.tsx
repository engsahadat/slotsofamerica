import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Camera, Loader2, Save, User, KeyRound, Eye, EyeOff, Bell, Shield, ChevronRight, Check, CircleCheck, Trash2, AlertTriangle, Mail, Phone, Gift, ShieldCheck, ShieldAlert, History, CreditCard, DollarSign, Award, Clock, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { uploadFile } from "@/lib/uploadFile";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateChatProfileCache } from "@/lib/openChatWithProfile";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { getCountryByName } from "@/lib/countries";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { VerificationOtpModal } from "@/components/VerificationOtpModal";

const profileSchema = z.object({
  display_name: z.string().trim().max(50, "Display name must be less than 50 characters").optional(),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(30, "Username must be less than 30 characters").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores").optional(),
  first_name: z.string().trim().max(50, "First name must be less than 50 characters").optional(),
  last_name: z.string().trim().max(50, "Last name must be less than 50 characters").optional(),
  phone: z.string().trim().max(20, "Phone must be less than 20 characters").regex(/^[+\d\s()-]*$/, "Invalid phone format").optional().or(z.literal("")),
  country: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  gender: z.string().trim().optional(),
});

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

const SettingsPage = () => {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    display_name: "",
    username: "",
    email: "",
    avatar_url: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
    country: "",
    state: "",
    phone: "",
    email_notifications: true,
    phone_verified: false,
    email_verified: false,
    balance: 0,
    created_at: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("profile");

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setFetchError(null);
    // The authenticated user object (from /api/auth/me, already loaded by AuthContext) has
    // everything this form needs — no separate fetch required. Laravel's User model stores a
    // single `name` field rather than separate display_name/first_name/last_name columns, so
    // first/last name here are a best-effort split of that one field for display purposes only.
    const nameParts = (user.name || "").trim().split(" ");
    setProfile({
      display_name: user.name || "",
      username: user.username || "",
      email: user.email || "",
      avatar_url: user.avatar_url || "",
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      date_of_birth: user.date_of_birth || "",
      gender: user.gender || "",
      country: user.country || "",
      state: user.state || "",
      phone: user.phone || "",
      email_notifications: user.email_notifications ?? true,
      phone_verified: user.phone_verified ?? false,
      email_verified: !!user.email_verified_at,
      balance: Number(user.balance) || 0,
      created_at: user.created_at || "",
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    const result = profileSchema.safeParse({
      display_name: profile.display_name || undefined,
      username: profile.username || undefined,
      first_name: profile.first_name || undefined,
      last_name: profile.last_name || undefined,
      phone: profile.phone || "",
      country: profile.country || undefined,
      state: profile.state || undefined,
      gender: profile.gender || undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      toast({ title: "Validation Error", description: "Please fix the highlighted fields.", variant: "destructive" });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
        || profile.display_name || undefined;
      await api.post("/user/settings/profile", {
        name,
        phone: profile.phone || null,
        country: profile.country || null,
        state: profile.state || null,
        gender: profile.gender || null,
        date_of_birth: profile.date_of_birth || null,
        email_notifications: profile.email_notifications,
        avatar_url: profile.avatar_url || null,
      });
      await refreshUser();
      invalidateChatProfileCache();
      toast({ title: "Profile updated successfully" });
    } catch (err: any) {
      toast({ title: "Error saving profile", description: err.response?.data?.message || "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image must be less than 2MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const avatarUrl = await uploadFile(file, "avatars");
      setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
      // Persist immediately rather than waiting for the user to press the profile Save button.
      await api.post("/user/settings/profile", { avatar_url: avatarUrl });
      await refreshUser();
      toast({ title: "Profile picture updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.response?.data?.message || err.message || "Could not upload image.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your profile...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Failed to Load Profile</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{fetchError}</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchProfile(); }}
          className="rounded-xl gradient-bg px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-slide-in w-full space-y-8">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="relative group shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="h-20 w-20 rounded-full object-cover border-2 border-border shadow-lg"
              />
            ) : (
              <div className="h-20 w-20 rounded-full gradient-bg flex items-center justify-center text-2xl font-bold text-primary-foreground border-2 border-border shadow-lg">
                {(profile.display_name?.[0] || profile.email?.[0] || "U").toUpperCase()}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-all duration-200"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-foreground" />
              ) : (
                <Camera className="h-5 w-5 text-foreground" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          {/* Name & email */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-bold tracking-wide truncate">
              {profile.display_name || profile.username || "Your Profile"}
            </h1>
            <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
            {profile.username && (
              <p className="text-xs text-muted-foreground mt-0.5">@{profile.username}</p>
            )}
          </div>
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start sm:self-center flex items-center gap-2 rounded-xl gradient-bg px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Profile Completion */}
      <ProfileCompletion profile={profile} />

      {/* Verification Status */}
      <VerificationStatusCard
        emailVerified={profile.email_verified}
        phoneVerified={profile.phone_verified}
        onEmailVerified={() => setProfile((p) => ({ ...p, email_verified: true }))}
        onPhoneVerified={() => setProfile((p) => ({ ...p, phone_verified: true }))}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-card border border-border rounded-xl p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger
            value="profile"
            className="flex-1 min-w-[80px] rounded-lg py-2.5 text-xs sm:text-sm font-medium data-[state=active]:gradient-bg data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
          >
            <User className="h-4 w-4 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="flex-1 min-w-[80px] rounded-lg py-2.5 text-xs sm:text-sm font-medium data-[state=active]:gradient-bg data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
          >
            <CreditCard className="h-4 w-4 mr-1.5" />
            Account
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="flex-1 min-w-[80px] rounded-lg py-2.5 text-xs sm:text-sm font-medium data-[state=active]:gradient-bg data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
          >
            <Shield className="h-4 w-4 mr-1.5" />
            Security
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex-1 min-w-[80px] rounded-lg py-2.5 text-xs sm:text-sm font-medium data-[state=active]:gradient-bg data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
          >
            <Bell className="h-4 w-4 mr-1.5" />
            Notifications
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="mt-6"
          >
            {activeTab === "profile" && (
              <div className="space-y-6">
                <SettingsCard title="Personal Information" icon={<User className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <SettingsField label="First Name" error={errors.first_name}>
                      <SettingsInput value={profile.first_name} onChange={(v) => setProfile((p) => ({ ...p, first_name: v }))} placeholder="Enter first name" />
                    </SettingsField>
                    <SettingsField label="Last Name" error={errors.last_name}>
                      <SettingsInput value={profile.last_name} onChange={(v) => setProfile((p) => ({ ...p, last_name: v }))} placeholder="Enter last name" />
                    </SettingsField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <SettingsField label="Display Name" error={errors.display_name}>
                      <SettingsInput value={profile.display_name} onChange={(v) => setProfile((p) => ({ ...p, display_name: v }))} placeholder="Enter display name" />
                    </SettingsField>
                    <SettingsField label="Username">
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-muted-foreground text-sm pointer-events-none">@</span>
                        <SettingsInput value={profile.username} onChange={() => {}} placeholder="username" className="pl-8 pr-10 opacity-60 cursor-not-allowed bg-muted/50" />
                        <Lock className="absolute right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Username cannot be changed after registration.
                      </p>
                    </SettingsField>
                  </div>
                  <SettingsField label="Email">
                    <div className="flex items-center gap-2 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground cursor-not-allowed">
                      {profile.email}
                      {profile.email_verified ? (
                        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CircleCheck className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="ml-auto text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Unverified
                        </span>
                      )}
                    </div>
                  </SettingsField>
                </SettingsCard>

                <SettingsCard title="Details" icon={<ChevronRight className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <SettingsField label="Date of Birth">
                      <SettingsInput type="date" value={profile.date_of_birth} onChange={(v) => setProfile((p) => ({ ...p, date_of_birth: v }))} className="[color-scheme:dark]" />
                    </SettingsField>
                    <SettingsField label="Gender">
                      <SettingsSelect value={profile.gender} onChange={(v) => setProfile((p) => ({ ...p, gender: v }))} placeholder="Select gender" options={GENDER_OPTIONS.map((g) => ({ label: g, value: g }))} />
                    </SettingsField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <SettingsField label="Country">
                      <div className="flex items-center gap-2 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground cursor-not-allowed">
                        <span className="text-base">🇺🇸</span> United States
                      </div>
                    </SettingsField>
                    <SettingsField label="State">
                      <SettingsSelect
                        value={profile.state}
                        onChange={(v) => setProfile((p) => ({ ...p, state: v }))}
                        placeholder="Select state"
                        options={(getCountryByName("United States")?.states ?? []).map((s) => ({ label: s, value: s }))}
                      />
                    </SettingsField>
                  </div>
                  <SettingsField label="Phone" error={errors.phone}>
                    <div className="flex">
                      <div className="flex items-center gap-1.5 rounded-l-xl border border-r-0 border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
                        <span className="text-base">🇺🇸</span>
                        <span className="font-medium">+1</span>
                      </div>
                      <SettingsInput
                        type="tel"
                        value={profile.phone}
                        onChange={(v) => {
                          const digits = v.replace(/\D/g, "").slice(0, 10);
                          let formatted = "";
                          if (digits.length > 0) formatted = `(${digits.slice(0, 3)}`;
                          if (digits.length >= 4) formatted += `) ${digits.slice(3, 6)}`;
                          if (digits.length >= 7) formatted += `-${digits.slice(6)}`;
                          setProfile((p) => ({ ...p, phone: formatted }));
                        }}
                        placeholder="(555) 000-0000"
                        maxLength={14}
                        className="rounded-l-none"
                      />
                    </div>
                    {profile.phone_verified ? (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                          <CircleCheck className="h-3 w-3" /> Phone Verified
                        </span>
                      </div>
                    ) : profile.phone && profile.phone.replace(/\D/g, "").length === 10 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Not verified — verify it below under Account Verification.
                      </p>
                    ) : null}
                  </SettingsField>
                </SettingsCard>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-6">
                {/* Account Overview */}
                <SettingsCard title="Account Overview" icon={<CreditCard className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Balance</span>
                      </div>
                      <p className="text-xl font-bold text-foreground">${profile.balance.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Status</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {profile.email_verified && profile.phone_verified ? (
                          <span className="text-primary flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Fully Verified</span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Partially Verified</span>
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Member Since</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </p>
                    </div>
                  </div>
                </SettingsCard>

                {/* User ID Card */}
                <SettingsCard title="Account Information" icon={<User className="h-4 w-4" />}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">User ID</p>
                        <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{String(user?.id || "").substring(0, 8).toUpperCase() || "—"}</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(String(user?.id || "").substring(0, 8).toUpperCase() || "");
                          toast({ title: "Copied to clipboard" });
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Email</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{profile.email}</p>
                      </div>
                      {profile.email_verified ? (
                        <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                          <CircleCheck className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="text-xs bg-destructive/10 text-destructive px-2.5 py-1 rounded-full font-medium">Unverified</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Phone</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{profile.phone || "Not set"}</p>
                      </div>
                      {profile.phone ? (
                        profile.phone_verified ? (
                          <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                            <CircleCheck className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="text-xs bg-destructive/10 text-destructive px-2.5 py-1 rounded-full font-medium">Unverified</span>
                        )
                      ) : null}
                    </div>
                  </div>
                </SettingsCard>

                {/* Reward History */}
                <RewardHistorySection />
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <PasswordChangeSection />
                <DeleteAccountSection />
              </div>
            )}

            {activeTab === "notifications" && (
              <SettingsCard title="Email Preferences" icon={<Bell className="h-4 w-4" />}>
                <label className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30 cursor-pointer group hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Email Notifications</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Receive updates about transactions, password changes, and more</p>
                    </div>
                  </div>
                  <div className="relative shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={profile.email_notifications}
                      onChange={(e) => setProfile((prev) => ({ ...prev, email_notifications: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 rounded-full bg-muted border border-border peer-checked:bg-primary peer-checked:border-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground/70 peer-checked:bg-primary-foreground peer-checked:translate-x-5 transition-all shadow-sm" />
                  </div>
                </label>
                <p className="text-xs text-muted-foreground mt-2">Changes are saved when you click "Save Changes" above.</p>
              </SettingsCard>
            )}
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
};

/* ─── Reusable UI Components ─── */

const SettingsCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
    <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
      <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</span>
      {title}
    </h2>
    {children}
  </div>
);

const SettingsField = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground block">{label}</label>
    {children}
    {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</p>}
  </div>
);

const SettingsInput = ({
  value, onChange, placeholder, type = "text", className = "", maxLength,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; maxLength?: number;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    maxLength={maxLength}
    className={`w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all placeholder:text-muted-foreground/50 ${className}`}
  />
);

const PROFILE_FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "display_name", label: "Display name" },
  { key: "username", label: "Username" },
  { key: "avatar_url", label: "Profile picture" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "state", label: "State" },
  { key: "phone", label: "Phone" },
] as const;

const ProfileCompletion = ({ profile }: { profile: Record<string, any> }) => {
  const filled = useMemo(() => PROFILE_FIELDS.filter((f) => !!profile[f.key]).length, [profile]);
  const total = PROFILE_FIELDS.length;
  const pct = Math.round((filled / total) * 100);
  const missing = PROFILE_FIELDS.filter((f) => !profile[f.key]);
  const prevPctRef = useRef(pct);

  useEffect(() => {
    if (pct === 100 && prevPctRef.current < 100) {
      import("canvas-confetti").then((mod) => {
        const fire = mod.default;
        fire({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#6366f1", "#8b5cf6", "#a855f7", "#22c55e"] });
      });
    }
    prevPctRef.current = pct;
  }, [pct]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <CircleCheck className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Profile Completion</span>
        </div>
        <span className={`text-sm font-bold ${pct === 100 ? "text-green-400" : "text-primary"}`}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "gradient-bg"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct === 100 ? (
        <p className="text-xs text-green-400 mt-2 font-medium">🎉 Profile complete!</p>
      ) : missing.length > 0 ? (
        <p className="text-xs text-muted-foreground mt-2">
          Missing: {missing.map((f) => f.label).join(", ")}
        </p>
      ) : null}
    </div>
  );
};

const VerificationStatusCard = ({
  emailVerified,
  phoneVerified,
  onEmailVerified,
  onPhoneVerified,
}: {
  emailVerified: boolean;
  phoneVerified: boolean;
  onEmailVerified: () => void;
  onPhoneVerified: () => void;
}) => {
  const [otpModal, setOtpModal] = useState<"email" | "phone" | null>(null);
  const allVerified = emailVerified && phoneVerified;

  if (allVerified) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Fully Verified</p>
            <p className="text-xs text-muted-foreground">Your email and phone number are verified. You have access to all features.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Verification Required</p>
            <p className="text-xs text-muted-foreground">
              {!emailVerified && !phoneVerified
                ? "Verify your email or phone number to unlock withdrawals, transfers, and priority support."
                : !emailVerified
                ? "Verify your email address to unlock full features."
                : "Verify your phone number to unlock full features."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`flex items-center justify-between rounded-xl border p-4 ${
            emailVerified ? "border-primary/20 bg-primary/5" : "border-amber-500/20 bg-amber-500/5"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                emailVerified ? "bg-primary/10" : "bg-amber-500/10"
              }`}>
                <Mail className={`h-4 w-4 ${emailVerified ? "text-primary" : "text-amber-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Email</p>
                <p className={`text-xs font-medium ${emailVerified ? "text-primary" : "text-amber-400"}`}>
                  {emailVerified ? "Verified" : "Not verified"}
                </p>
              </div>
            </div>
            {!emailVerified && (
              <button onClick={() => setOtpModal("email")}
                className="rounded-lg gradient-bg px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                Verify Now
              </button>
            )}
            {emailVerified && <CircleCheck className="h-5 w-5 text-primary" />}
          </div>

          <div className={`flex items-center justify-between rounded-xl border p-4 ${
            phoneVerified ? "border-primary/20 bg-primary/5" : "border-amber-500/20 bg-amber-500/5"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                phoneVerified ? "bg-primary/10" : "bg-amber-500/10"
              }`}>
                <Phone className={`h-4 w-4 ${phoneVerified ? "text-primary" : "text-amber-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Phone</p>
                <p className={`text-xs font-medium ${phoneVerified ? "text-primary" : "text-amber-400"}`}>
                  {phoneVerified ? "Verified" : "Not verified"}
                </p>
              </div>
            </div>
            {!phoneVerified && (
              <button onClick={() => setOtpModal("phone")}
                className="rounded-lg gradient-bg px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                Verify Now
              </button>
            )}
            {phoneVerified && <CircleCheck className="h-5 w-5 text-primary" />}
          </div>
        </div>
      </div>

      {otpModal && (
        <VerificationOtpModal
          type={otpModal}
          onClose={() => setOtpModal(null)}
          onVerified={() => {
            if (otpModal === "email") onEmailVerified();
            else onPhoneVerified();
            setOtpModal(null);
          }}
        />
      )}
    </>
  );
};

const SettingsSelect = ({
  value, onChange, placeholder, options,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; options: { label: string; value: string }[];
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all appearance-none"
  >
    <option value="">{placeholder}</option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

/* ─── Reward History Section ─── */

const REWARD_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  profile_completion_reward: { label: "Profile Completion", icon: <User className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10" },
  email_verification_reward: { label: "Email Verification", icon: <Mail className="h-3.5 w-3.5" />, color: "text-green-400 bg-green-500/10" },
  phone_verification_reward: { label: "Phone Verification", icon: <Phone className="h-3.5 w-3.5" />, color: "text-blue-400 bg-blue-500/10" },
};

const RewardHistorySection = () => {
  const { user } = useAuth();
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setError(null);
      try {
        const { data } = await api.get("/user/reward-history");
        setRewards(data.history || []);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || "Failed to load reward history.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  return (
    <SettingsCard title="Reward History" icon={<Award className="h-4 w-4" />}>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-6">
          <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      ) : rewards.length === 0 ? (
        <div className="text-center py-8">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <Gift className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No rewards yet</p>
          <p className="text-xs text-muted-foreground mt-1">Complete your profile and verify your account to earn rewards!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rewards.map((r) => {
            const meta = REWARD_LABELS[r.reward_key] || { label: r.reward_key, icon: <Gift className="h-3.5 w-3.5" />, color: "text-muted-foreground bg-muted" };
            return (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${meta.color}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-primary">+${Number(r.amount).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}
    </SettingsCard>
  );
};

/* ─── Password Section ─── */

const PasswordChangeSection = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");

  const handleChangePassword = async () => {
    setError("");
    if (!currentPassword) { setError("Please enter your current password"); return; }
    if (newPassword.length < 6) { setError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setChanging(true);
    try {
      await api.post("/user/settings/password", {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast({ title: "Password changed successfully" });
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to update password.");
    } finally {
      setChanging(false);
    }
  };

  return (
    <SettingsCard title="Change Password" icon={<KeyRound className="h-4 w-4" />}>
      <SettingsField label="Current Password">
        <PasswordInput value={currentPassword} onChange={setCurrentPassword} show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} placeholder="Enter current password" />
      </SettingsField>
      <SettingsField label="New Password">
        <PasswordInput value={newPassword} onChange={setNewPassword} show={showNew} onToggle={() => setShowNew(!showNew)} placeholder="Enter new password" />
        {newPassword && <PasswordStrengthIndicator password={newPassword} />}
      </SettingsField>
      <SettingsField label="Confirm New Password">
        <PasswordInput value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} placeholder="Confirm new password" />
      </SettingsField>
      {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</p>}
      <button
        onClick={handleChangePassword}
        disabled={changing || !currentPassword || !newPassword || !confirmPassword}
        className="w-full flex items-center justify-center gap-2 rounded-xl gradient-bg px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
      >
        {changing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Update Password
      </button>
    </SettingsCard>
  );
};

const PasswordInput = ({
  value, onChange, show, onToggle, placeholder,
}: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder: string;
}) => (
  <div className="relative">
    <input
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all placeholder:text-muted-foreground/50"
    />
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);

/* ─── Password Strength ─── */

const getPasswordStrength = (password: string): { label: string; score: number; color: string } => {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: "Weak", score: 1, color: "bg-destructive" };
  if (score <= 3) return { label: "Medium", score: 2, color: "bg-yellow-500" };
  return { label: "Strong", score: 3, color: "bg-green-500" };
};

const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const { label, score, color } = getPasswordStrength(password);
  const checks = [
    { met: password.length >= 6, text: "At least 6 characters" },
    { met: /[A-Z]/.test(password), text: "Uppercase letter" },
    { met: /[0-9]/.test(password), text: "Number" },
    { met: /[^A-Za-z0-9]/.test(password), text: "Special character" },
  ];
  return (
    <div className="mt-3 space-y-2.5 p-3 rounded-xl bg-muted/30 border border-border">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-muted"}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-semibold text-foreground">{label}</span>
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <div key={c.text} className="flex items-center gap-1.5 text-xs">
            <div className={`h-4 w-4 rounded-md flex items-center justify-center text-[10px] transition-colors ${c.met ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
              {c.met && <Check className="h-3 w-3" />}
            </div>
            <span className={c.met ? "text-foreground" : "text-muted-foreground"}>{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DeleteAccountSection = () => {
  const [showDialog, setShowDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Regression: this used to call the dead Supabase auth stub, which resolved instantly without
  // actually signing the user out — so the "Your account has been signed out" toast was a lie;
  // the session stayed fully logged in. There is still no backend self-service account-deletion
  // endpoint, so this now does the one thing it can honestly do: really sign the user out and
  // send them home, while being upfront that deletion itself needs support.
  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await signOut();
      toast({ title: "Signed out", description: "You've been signed out. To permanently delete your account and data, please contact support — this can't be completed automatically yet." });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDialog(false);
    }
  };

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
          <Trash2 className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Permanently delete your account and all associated data. This action cannot be undone.
      </p>
      <button
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Delete Account
      </button>

      <AnimatePresence>
        {showDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
              onClick={() => setShowDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete Account</h3>
                  <p className="text-xs text-muted-foreground">This action is permanent</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                All your data, transactions, and game accounts will be permanently deleted. Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm.
              </p>
              <SettingsInput
                value={confirmText}
                onChange={setConfirmText}
                placeholder='Type "DELETE" to confirm'
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDialog(false); setConfirmText(""); }}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={confirmText !== "DELETE" || deleting}
                  className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Forever
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SettingsPage;
