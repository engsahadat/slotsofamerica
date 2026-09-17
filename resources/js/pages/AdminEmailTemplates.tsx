import { useState, useEffect } from "react";
import { Loader2, Plus, Save, Trash2, Eye, EyeOff, Mail, Search, Copy, X, FileText, Gift, CreditCard, Newspaper, Sparkles, Send } from "lucide-react";
import { EmailBuilder } from "@/components/EmailBuilder";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

interface EmailTemplate {
  id: number;
  name: string;
  category: string;
  transaction_type: string;
  subject: string;
  body_html: string;
  is_active: boolean;
  trigger_event: string;
}

const TRIGGER_EVENTS = [
  { key: "manual", label: "Manual Only", desc: "No automatic trigger" },
  { key: "transaction_approved_deposit", label: "Deposit Approved", desc: "When a deposit is approved" },
  { key: "transaction_rejected_deposit", label: "Deposit Rejected", desc: "When a deposit is rejected" },
  { key: "transaction_approved_withdraw", label: "Withdrawal Approved", desc: "When a withdrawal is approved" },
  { key: "transaction_rejected_withdraw", label: "Withdrawal Rejected", desc: "When a withdrawal is rejected" },
  { key: "transaction_approved_transfer", label: "Transfer Approved", desc: "When a transfer is approved" },
  { key: "transaction_rejected_transfer", label: "Transfer Rejected", desc: "When a transfer is rejected" },
  { key: "transaction_approved_redeem", label: "Redeem Approved", desc: "When a redeem is approved" },
  { key: "transaction_rejected_redeem", label: "Redeem Rejected", desc: "When a redeem is rejected" },
  { key: "user_registered", label: "New User Registration", desc: "When a new user signs up" },
  { key: "password_request_approved", label: "Password Request Approved", desc: "When a password change is approved" },
  { key: "password_request_rejected", label: "Password Request Rejected", desc: "When a password change is rejected" },
  { key: "email_verification", label: "Email Verification", desc: "Branded verification email sent on signup" },
  { key: "password_reset", label: "Password Reset", desc: "Branded password reset email" },
];

const CATEGORIES = [
  { key: "transaction", label: "Transaction" },
  { key: "promo", label: "Promotion" },
  { key: "game", label: "Game" },
  { key: "welcome", label: "Welcome" },
  { key: "custom", label: "Custom" },
];

const PLACEHOLDERS = [
  { key: "{{user_name}}", desc: "User's display name" },
  { key: "{{email}}", desc: "User's email" },
  { key: "{{amount}}", desc: "Transaction amount" },
  { key: "{{type}}", desc: "Transaction type" },
  { key: "{{status}}", desc: "Transaction status" },
  { key: "{{site_name}}", desc: "Site name" },
  { key: "{{date}}", desc: "Current date" },
  { key: "{{game_name}}", desc: "Game name" },
  { key: "{{confirmation_url}}", desc: "Email confirmation link" },
  { key: "{{logo_url}}", desc: "Site logo URL" },
];

const DEFAULT_HTML = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #ffffff;">
  <h2 style="color: #f5c518; margin-bottom: 16px;">{{site_name}}</h2>
  <p>Hi {{user_name}},</p>
  <p>Your email content goes here.</p>
  <hr style="border-color: #333; margin: 20px 0;" />
  <p style="font-size: 12px; color: #888;">This email was sent by {{site_name}}</p>
</div>`;

const STARTER_KITS = [
  {
    key: "welcome",
    label: "Welcome",
    desc: "Greet new users with a warm onboarding email",
    icon: Sparkles,
    color: "text-purple-400 bg-purple-500/10",
    preset: {
      name: "Welcome Email",
      category: "welcome",
      transaction_type: "welcome",
      trigger_event: "user_registered",
      subject: "🎉 Welcome to {{site_name}}, {{user_name}}!",
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#1a1a2e;color:#ffffff;">
  <h2 style="color:#f5c518;text-align:center;font-size:28px;margin-bottom:8px;">Welcome to {{site_name}}!</h2>
  <p style="text-align:center;color:#aaa;font-size:14px;margin-bottom:24px;">We're thrilled to have you on board, {{user_name}} 🎮</p>
  <div style="background:#252547;border-radius:12px;padding:24px;margin-bottom:20px;">
    <h3 style="color:#f5c518;margin:0 0 12px 0;font-size:18px;">Getting Started</h3>
    <p style="color:#ccc;font-size:14px;line-height:1.7;margin:0;">1. Browse our game library and pick your favorites<br/>2. Make your first deposit to fund your account<br/>3. Start playing and enjoy exclusive rewards!</p>
  </div>
  <div style="text-align:center;margin:24px 0;">
    <a href="#" style="display:inline-block;padding:14px 40px;background:#f5c518;color:#1a1a2e;text-decoration:none;font-weight:bold;border-radius:8px;font-size:16px;">Explore Games</a>
  </div>
  <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
  <p style="font-size:12px;color:#888;text-align:center;">Need help? Reply to this email or visit our support page.</p>
</div>`,
    },
  },
  {
    key: "promo",
    label: "Promotion",
    desc: "Announce deals, bonuses, or special offers",
    icon: Gift,
    color: "text-orange-400 bg-orange-500/10",
    preset: {
      name: "Special Promotion",
      category: "promo",
      transaction_type: "promo",
      trigger_event: "manual",
      subject: "🔥 Exclusive Offer Just For You, {{user_name}}!",
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#1a1a2e;color:#ffffff;">
  <h2 style="color:#f5c518;text-align:center;font-size:32px;margin-bottom:4px;">🔥 LIMITED TIME OFFER</h2>
  <p style="text-align:center;color:#ff6b6b;font-size:14px;font-weight:bold;margin-bottom:24px;">Expires {{date}}</p>
  <div style="background:linear-gradient(135deg,#252547,#1e3a5f);border-radius:12px;padding:28px;text-align:center;margin-bottom:20px;border:1px solid #f5c51833;">
    <p style="color:#f5c518;font-size:48px;font-weight:bold;margin:0;">50% BONUS</p>
    <p style="color:#ccc;font-size:16px;margin:8px 0 0 0;">On your next deposit of $25 or more</p>
  </div>
  <div style="text-align:center;margin:24px 0;">
    <a href="#" style="display:inline-block;padding:14px 40px;background:#f5c518;color:#1a1a2e;text-decoration:none;font-weight:bold;border-radius:8px;font-size:16px;">Claim Now</a>
  </div>
  <p style="font-size:12px;color:#888;text-align:center;">Terms & conditions apply. Cannot be combined with other offers.</p>
</div>`,
    },
  },
  {
    key: "transaction",
    label: "Transaction",
    desc: "Notify users about deposits, withdrawals, or transfers",
    icon: CreditCard,
    color: "text-green-400 bg-green-500/10",
    preset: {
      name: "Transaction Notification",
      category: "transaction",
      transaction_type: "transaction",
      trigger_event: "transaction_approved_deposit",
      subject: "{{type}} of ${{amount}} — {{status}}",
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#1a1a2e;color:#ffffff;">
  <h2 style="color:#f5c518;margin-bottom:16px;">Transaction Update</h2>
  <p>Hi {{user_name}},</p>
  <p>Your <strong>{{type}}</strong> request has been updated.</p>
  <div style="background:#252547;border-radius:8px;padding:20px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#aaa;padding:6px 0;font-size:14px;">Amount</td><td style="color:#fff;text-align:right;font-size:14px;font-weight:bold;">\${{amount}}</td></tr>
      <tr><td style="color:#aaa;padding:6px 0;font-size:14px;">Type</td><td style="color:#fff;text-align:right;font-size:14px;">{{type}}</td></tr>
      <tr><td style="color:#aaa;padding:6px 0;font-size:14px;">Status</td><td style="color:#f5c518;text-align:right;font-size:14px;font-weight:bold;">{{status}}</td></tr>
      <tr><td style="color:#aaa;padding:6px 0;font-size:14px;">Date</td><td style="color:#fff;text-align:right;font-size:14px;">{{date}}</td></tr>
    </table>
  </div>
  <hr style="border:none;border-top:1px solid #333;margin:20px 0;" />
  <p style="font-size:12px;color:#888;">This email was sent by {{site_name}}</p>
</div>`,
    },
  },
  {
    key: "newsletter",
    label: "Newsletter",
    desc: "Send updates, news, and game highlights",
    icon: Newspaper,
    color: "text-blue-400 bg-blue-500/10",
    preset: {
      name: "Weekly Newsletter",
      category: "custom",
      transaction_type: "custom",
      trigger_event: "manual",
      subject: "📰 This Week at {{site_name}} — {{date}}",
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#1a1a2e;color:#ffffff;">
  <h2 style="color:#f5c518;text-align:center;font-size:26px;margin-bottom:4px;">📰 Weekly Update</h2>
  <p style="text-align:center;color:#aaa;font-size:13px;margin-bottom:24px;">{{date}} • {{site_name}}</p>
  <div style="background:#252547;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h3 style="color:#f5c518;margin:0 0 8px 0;font-size:16px;">🎮 Featured Game</h3>
    <p style="color:#ccc;font-size:14px;line-height:1.6;margin:0;">Check out {{game_name}} — our hottest new addition! Play now and earn bonus rewards on your first session.</p>
  </div>
  <div style="background:#252547;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h3 style="color:#f5c518;margin:0 0 8px 0;font-size:16px;">💰 Top Promotions</h3>
    <p style="color:#ccc;font-size:14px;line-height:1.6;margin:0;">Don't miss our weekend deposit bonus — get 25% extra on deposits over $20. Limited time only!</p>
  </div>
  <div style="background:#252547;border-radius:12px;padding:20px;margin-bottom:20px;">
    <h3 style="color:#f5c518;margin:0 0 8px 0;font-size:16px;">📢 Announcements</h3>
    <p style="color:#ccc;font-size:14px;line-height:1.6;margin:0;">We've improved our transfer speeds and added new payment methods. Your experience just got better!</p>
  </div>
  <div style="text-align:center;margin:20px 0;">
    <a href="#" style="display:inline-block;padding:12px 36px;background:#f5c518;color:#1a1a2e;text-decoration:none;font-weight:bold;border-radius:8px;font-size:14px;">Visit Dashboard</a>
  </div>
  <hr style="border:none;border-top:1px solid #333;margin:20px 0;" />
  <p style="font-size:12px;color:#888;text-align:center;">You're receiving this because you're a member of {{site_name}}.</p>
</div>`,
    },
  },
  {
    key: "blank",
    label: "Blank",
    desc: "Start from scratch with an empty template",
    icon: FileText,
    color: "text-muted-foreground bg-muted",
    preset: {
      name: "",
      category: "custom",
      transaction_type: "custom",
      trigger_event: "manual",
      subject: "",
      body_html: DEFAULT_HTML,
    },
  },
];

const AdminEmailTemplates = () => {
  const { settings } = useSiteSettings();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickingKit, setPickingKit] = useState(true);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "custom",
    transaction_type: "custom",
    trigger_event: "manual",
    subject: "",
    body_html: DEFAULT_HTML,
  });
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [showTestInput, setShowTestInput] = useState<string | null>(null);

  const sendTestEmail = async (subject: string, body_html: string, templateId: string) => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    setSendingTest(templateId);
    try {
      const res = await api.post("/admin/email-templates/send-test", { to: testEmail, subject, body_html });
      toast({ title: "Test email sent!", description: res.data?.message || `Sent to ${testEmail}` });
      setShowTestInput(null);
    } catch (err: any) {
      toast({ title: "Failed to send", description: errMsg(err, "Please try again."), variant: "destructive" });
    }
    setSendingTest(null);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/email-templates");
      setTemplates(data.templates || []);
    } catch (err: any) {
      toast({ title: "Failed to load templates", description: errMsg(err, "Please try again."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const createTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.subject.trim()) {
      toast({ title: "Name and subject are required", variant: "destructive" });
      return;
    }
    setSaving("new");
    try {
      await api.post("/admin/email-templates", {
        name: newTemplate.name,
        category: newTemplate.category,
        transaction_type: newTemplate.transaction_type || newTemplate.category,
        trigger_event: newTemplate.trigger_event,
        subject: newTemplate.subject,
        body_html: newTemplate.body_html,
      });
      toast({ title: "Template created!" });
      setCreating(false);
      setPickingKit(true);
      setNewTemplate({ name: "", category: "custom", transaction_type: "custom", trigger_event: "manual", subject: "", body_html: DEFAULT_HTML });
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Failed to create", description: errMsg(err, "Please try again."), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const saveTemplate = async (t: EmailTemplate) => {
    setSaving(String(t.id));
    try {
      await api.put(`/admin/email-templates/${t.id}`, {
        name: t.name,
        category: t.category,
        transaction_type: t.transaction_type,
        trigger_event: t.trigger_event,
        subject: t.subject,
        body_html: t.body_html,
        is_active: t.is_active,
      });
      toast({ title: "Template saved" });
      setEditingId(null);
    } catch (err: any) {
      toast({ title: "Save failed", description: errMsg(err, "Please try again."), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("Delete this email template?")) return;
    try {
      await api.delete(`/admin/email-templates/${id}`);
      toast({ title: "Template deleted" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      toast({ title: "Delete failed", description: errMsg(err, "Please try again."), variant: "destructive" });
    }
  };

  const duplicateTemplate = async (t: EmailTemplate) => {
    setSaving("dup");
    try {
      await api.post(`/admin/email-templates/${t.id}/duplicate`);
      toast({ title: "Template duplicated" });
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: errMsg(err, "Please try again."), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (t: EmailTemplate) => {
    const updated = { ...t, is_active: !t.is_active };
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    try {
      await api.put(`/admin/email-templates/${t.id}`, { is_active: updated.is_active });
      toast({ title: updated.is_active ? "Template enabled" : "Template disabled" });
    } catch (err: any) {
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x))); // revert optimistic update
      toast({ title: "Failed to update", description: errMsg(err, "Please try again."), variant: "destructive" });
    }
  };

  const updateField = (id: number, field: string, value: any) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const previewHtml = (html: string) =>
    html
      .replace(/\{\{user_name\}\}/g, "John Doe")
      .replace(/\{\{email\}\}/g, "john@example.com")
      .replace(/\{\{amount\}\}/g, "50.00")
      .replace(/\{\{type\}\}/g, "deposit")
      .replace(/\{\{status\}\}/g, "Pending")
      .replace(/\{\{site_name\}\}/g, settings.site_name || "MySite")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{game_name\}\}/g, "Slots Master");

  const filtered = templates.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || t.category === filterCat;
    return matchSearch && matchCat;
  });

  const catColor = (cat: string) => {
    const map: Record<string, string> = {
      transaction: "text-green-400 bg-green-500/10",
      promo: "text-orange-400 bg-orange-500/10",
      game: "text-blue-400 bg-blue-500/10",
      welcome: "text-purple-400 bg-purple-500/10",
      custom: "text-primary bg-primary/10",
    };
    return map[cat] || "text-muted-foreground bg-muted";
  };

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Email Templates</h1>
          <p className="text-muted-foreground mt-1">Create and manage email templates for transactions, promotions, games, and more</p>
        </div>
        <button
          onClick={() => { setPickingKit(true); setCreating(true); }}
          className="flex items-center gap-2 rounded-lg gradient-bg px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-muted/50 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setFilterCat("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${filterCat === "all" ? "gradient-bg text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilterCat(c.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${filterCat === c.key ? "gradient-bg text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {creating && pickingKit && (
        <div className="rounded-xl border-2 border-primary/30 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Choose a Starter Template</h3>
            <button onClick={() => { setCreating(false); setPickingKit(true); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Pick a pre-built template to get started quickly, or start from scratch.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STARTER_KITS.map((kit) => (
              <button
                key={kit.key}
                onClick={() => {
                  setNewTemplate({ ...kit.preset });
                  setPickingKit(false);
                }}
                className="group rounded-lg border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/30 p-4 text-left transition-all space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full p-1.5 ${kit.color}`}>
                    <kit.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{kit.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{kit.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {creating && !pickingKit && (
        <div className="rounded-xl border-2 border-primary/30 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setPickingKit(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors">← Back</button>
              <h3 className="text-sm font-bold text-foreground">Create New Template</h3>
            </div>
            <button onClick={() => { setCreating(false); setPickingKit(true); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Template Name</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Welcome Email, Game Promo..."
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Category</label>
              <Select
                value={newTemplate.category}
                onValueChange={(v) => setNewTemplate((p) => ({ ...p, category: v, transaction_type: v }))}
              >
                <SelectTrigger className="w-full bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Trigger Event</label>
            <Select
              value={newTemplate.trigger_event}
              onValueChange={(v) => setNewTemplate((p) => ({ ...p, trigger_event: v }))}
            >
              <SelectTrigger className="w-full bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTS.map((ev) => (
                  <SelectItem key={ev.key} value={ev.key}>{ev.label} — {ev.desc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">When this event occurs, this email will be automatically sent to the user.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Subject Line</label>
            <input
              type="text"
              value={newTemplate.subject}
              onChange={(e) => setNewTemplate((p) => ({ ...p, subject: e.target.value }))}
              placeholder="e.g. 🎮 New game available! Check it out"
              className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Placeholders helper */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Available Placeholders (click to copy)</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { navigator.clipboard.writeText(p.key); toast({ title: `Copied ${p.key}` }); }}
                  className="px-2 py-1 rounded bg-muted text-xs font-mono text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  title={p.desc}
                >
                  {p.key}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Email Body</label>
            <EmailBuilder
              html={newTemplate.body_html}
              onChange={(html) => setNewTemplate((p) => ({ ...p, body_html: html }))}
            />
          </div>

          {/* Send Test Email */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Send Test Email</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="recipient@example.com"
                value={showTestInput === "new" ? testEmail : ""}
                onFocus={() => setShowTestInput("new")}
                onChange={(e) => { setShowTestInput("new"); setTestEmail(e.target.value); }}
                className="flex-1 rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => sendTestEmail(newTemplate.subject, newTemplate.body_html, "new")}
                disabled={sendingTest === "new"}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {sendingTest === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send Test
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setCreating(false); setPickingKit(true); }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={createTemplate}
              disabled={saving === "new"}
              className="flex items-center gap-2 rounded-lg gradient-bg px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create Template
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{search || filterCat !== "all" ? "No templates match your search" : "No email templates yet. Click 'New Template' to get started."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((t) => {
            const isEditing = editingId === t.id;
            const isPreviewing = previewId === t.id;

            return (
              <div key={t.id} className="rounded-xl border border-border bg-card/60 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${catColor(t.category)}`}>
                      {t.category}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{t.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {t.is_active ? "Active" : "Disabled"}
                    </span>
                    {t.trigger_event && t.trigger_event !== "manual" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400">
                        ⚡ {TRIGGER_EVENTS.find((ev) => ev.key === t.trigger_event)?.label || t.trigger_event}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleActive(t)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title={t.is_active ? "Disable" : "Enable"}>
                      {t.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button onClick={() => duplicateTemplate(t)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Duplicate">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button onClick={() => setPreviewId(isPreviewing ? null : t.id)} className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border">
                      {isPreviewing ? "Hide" : "Preview"}
                    </button>
                    <button onClick={() => setEditingId(isEditing ? null : t.id)} className="text-xs font-medium text-primary hover:underline">
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Preview */}
                {isPreviewing && (
                  <div className="p-4 border-b border-border bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Subject: {t.subject}</p>
                    <div className="rounded-lg overflow-hidden" dangerouslySetInnerHTML={{ __html: previewHtml(t.body_html) }} />
                  </div>
                )}

                {/* Edit */}
                {isEditing && (
                  <div className="p-4 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">Template Name</label>
                        <input
                          type="text"
                          value={t.name}
                          onChange={(e) => updateField(t.id, "name", e.target.value)}
                          className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">Category</label>
                        <Select value={t.category} onValueChange={(v) => updateField(t.id, "category", v)}>
                          <SelectTrigger className="w-full bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Trigger Event</label>
                      <Select value={t.trigger_event || "manual"} onValueChange={(v) => updateField(t.id, "trigger_event", v)}>
                        <SelectTrigger className="w-full bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRIGGER_EVENTS.map((ev) => (
                            <SelectItem key={ev.key} value={ev.key}>{ev.label} — {ev.desc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">When this event occurs, this email will be automatically sent to the user.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Subject Line</label>
                      <input
                        type="text"
                        value={t.subject}
                        onChange={(e) => updateField(t.id, "subject", e.target.value)}
                        className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Placeholders helper */}
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Placeholders (click to copy)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PLACEHOLDERS.map((p) => (
                          <button
                            key={p.key}
                            onClick={() => { navigator.clipboard.writeText(p.key); toast({ title: `Copied ${p.key}` }); }}
                            className="px-2 py-1 rounded bg-muted text-xs font-mono text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            title={p.desc}
                          >
                            {p.key}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Email Body</label>
                      <EmailBuilder
                        html={t.body_html}
                        onChange={(html) => updateField(t.id, "body_html", html)}
                      />
                    </div>
                    {/* Send Test Email */}
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground">Send Test Email</p>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          placeholder="recipient@example.com"
                          value={showTestInput === String(t.id) ? testEmail : ""}
                          onFocus={() => setShowTestInput(String(t.id))}
                          onChange={(e) => { setShowTestInput(String(t.id)); setTestEmail(e.target.value); }}
                          className="flex-1 rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          onClick={() => sendTestEmail(t.subject, t.body_html, String(t.id))}
                          disabled={sendingTest === String(t.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          {sendingTest === String(t.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Send Test
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                      </button>
                      <button
                        onClick={() => saveTemplate(t)}
                        disabled={saving === String(t.id)}
                        className="flex items-center gap-2 rounded-lg gradient-bg px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {saving === String(t.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Template
                      </button>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {!isEditing && !isPreviewing && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground">Subject:</span> {t.subject}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminEmailTemplates;
