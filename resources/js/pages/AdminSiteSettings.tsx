import { useState, useEffect } from "react";
import { Loader2, Upload, Save, Palette, Code, Globe, FileCode, Trash2, Type, KeyRound, ShieldCheck, MessageSquare, Mail, Send, Phone, CreditCard } from "lucide-react";
import api from "@/services/api";
import { uploadFile } from "@/lib/uploadFile";
import { toast } from "@/hooks/use-toast";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { Switch } from "@/components/ui/switch";

const TABS = [
  { key: "brand", label: "Brand", icon: Upload },
  { key: "colors", label: "Colors", icon: Palette },
  { key: "fonts", label: "Fonts", icon: Type },
  { key: "api_keys", label: "API Keys & Secrets", icon: KeyRound },
  { key: "seo", label: "SEO", icon: Globe },
  { key: "scripts", label: "Scripts", icon: Code },
  { key: "css", label: "Custom CSS", icon: FileCode },
] as const;

type TabKey = typeof TABS[number]["key"];

const SIMPLE_COLORS = [
  { key: "primary", label: "Primary", description: "Main brand color — buttons, links, highlights" },
  { key: "primary-foreground", label: "Button Text", description: "Text color on buttons and primary elements" },
  { key: "secondary", label: "Secondary", description: "Accent color — badges, gradients, hover effects" },
  { key: "background", label: "Background", description: "Page background color" },
  { key: "foreground", label: "Text", description: "Main text color across the site" },
  { key: "card", label: "Cards & Panels", description: "Background color for cards, modals, and panels" },
];

const AdminSiteSettings = () => {
  const { refetch } = useSiteSettings();
  const [tab, setTab] = useState<TabKey>("brand");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [siteName, setSiteName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [headerScripts, setHeaderScripts] = useState("");
  const [bodyScripts, setBodyScripts] = useState("");
  const [footerScripts, setFooterScripts] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [fonts, setFonts] = useState({ primary: "", secondary: "", button: "" });

  // Integration Secrets state — legacy per-game credentials (Game Agent API, Orion
  // Stars, Fast API, River Pay) moved to Admin > Game API Providers; GoHighLevel
  // stays here since it's a CRM integration, not a game provider.
  const [ghlApiKey, setGhlApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [ghlAssignedUserId, setGhlAssignedUserId] = useState("");

  // FAST Payment (automated deposit gateway — DollarPayWallet/Kashuuu) credentials. Named
  // "fast_payment_*" deliberately, not "fast_api_*" — that prefix already belongs to an
  // unrelated legacy Game API provider on this same table.
  const [fastPaymentBaseUrl, setFastPaymentBaseUrl] = useState("");
  const [fastPaymentMerchantId, setFastPaymentMerchantId] = useState("");
  const [fastPaymentKey, setFastPaymentKey] = useState("");

  // Brevo (SMS + Email OTP delivery — replaces Infobip) & Mail state
  const [brevoApiKey, setBrevoApiKey] = useState("");
  const [brevoSmsSender, setBrevoSmsSender] = useState("");
  const [brevoEmailSender, setBrevoEmailSender] = useState("");
  const [brevoEmailSenderName, setBrevoEmailSenderName] = useState("");
  const [brevoEmailEnabled, setBrevoEmailEnabled] = useState(true);
  const [brevoSmsEnabled, setBrevoSmsEnabled] = useState(true);
  const [testingChannel, setTestingChannel] = useState<"email" | "sms" | null>(null);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Fetch Verification Settings (Brevo & SMTP)
  const fetchVerificationSettings = async () => {
    try {
      const res = await api.get("/admin/verifications/settings");
      const vs = res.data?.settings;
      if (vs) {
        setBrevoApiKey(vs.brevo_api_key || "");
        setBrevoSmsSender(vs.brevo_sms_sender || "");
        setBrevoEmailSender(vs.brevo_email_sender || "");
        setBrevoEmailSenderName(vs.brevo_email_sender_name || "");
        setBrevoEmailEnabled(vs.brevo_email_enabled ?? true);
        setBrevoSmsEnabled(vs.brevo_sms_enabled ?? true);
        setSmtpHost(vs.smtp_host || "");
        setSmtpPort(vs.smtp_port || 587);
        setSmtpEmail(vs.smtp_email || vs.smtp_username || "");
        setSmtpPassword(vs.smtp_password || "");
      }
    } catch {
      // Ignore fallback
    }
  };

  // Load settings into form. Uses the authenticated /admin/site-settings endpoint (full
  // model, including API secrets) rather than the public useSiteSettings() context — the
  // public endpoint deliberately excludes secrets now (see SiteSetting::PUBLIC_FIELDS), and
  // depending on it here would both leave the secret fields blank and, since the effect would
  // re-run after refetch() on save, wipe out whatever the admin just typed.
  const fetchFullSettings = async () => {
    try {
      const res = await api.get("/admin/site-settings");
      const s = res.data?.settings;
      if (!s) return;
      setSiteName(s.site_name);
      setLogoUrl(s.logo_url);
      setFaviconUrl(s.favicon_url);
      setColors(s.colors || {});
      setSeoTitle(s.seo_title || "");
      setSeoDescription(s.seo_description || "");
      setSeoKeywords(s.seo_keywords || "");
      setHeaderScripts(s.header_scripts || "");
      setBodyScripts(s.body_scripts || "");
      setFooterScripts(s.footer_scripts || "");
      setCustomCss(s.custom_css || "");
      setFonts(s.fonts || { primary: "", secondary: "", button: "" });

      setGhlApiKey(s.ghl_api_key || "");
      setGhlLocationId(s.ghl_location_id || "");
      setGhlAssignedUserId(s.ghl_assigned_user_id || "");

      setFastPaymentBaseUrl(s.fast_payment_base_url || "");
      setFastPaymentMerchantId(s.fast_payment_merchant_id || "");
      setFastPaymentKey(s.fast_payment_key || "");
    } catch (e: any) {
      toast({ title: "Failed to load settings", description: e?.response?.data?.message || e?.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchVerificationSettings();
    fetchFullSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File, type: "logo" | "favicon") => {
    setUploading(true);
    try {
      const url = await uploadFile(file, "brand-assets");
      if (type === "logo") setLogoUrl(url);
      else setFaviconUrl(url);
      toast({ title: `${type === "logo" ? "Logo" : "Favicon"} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save Site Settings & Game Credentials
      await api.post("/admin/site-settings", {
        site_name: siteName,
        logo_url: logoUrl,
        favicon_url: faviconUrl,
        colors,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        seo_keywords: seoKeywords || null,
        header_scripts: headerScripts,
        body_scripts: bodyScripts,
        footer_scripts: footerScripts,
        custom_css: customCss,
        fonts,
        ghl_api_key: ghlApiKey || null,
        ghl_location_id: ghlLocationId || null,
        ghl_assigned_user_id: ghlAssignedUserId || null,
        fast_payment_base_url: fastPaymentBaseUrl || null,
        fast_payment_merchant_id: fastPaymentMerchantId || null,
        fast_payment_key: fastPaymentKey || null,
      });

      // Save Brevo & Verification Credentials
      await api.post("/admin/verifications/settings", {
        brevo_api_key: brevoApiKey || null,
        brevo_sms_sender: brevoSmsSender || null,
        brevo_email_sender: brevoEmailSender || null,
        brevo_email_sender_name: brevoEmailSenderName || null,
        brevo_email_enabled: brevoEmailEnabled,
        brevo_sms_enabled: brevoSmsEnabled,
        smtp_host: smtpHost || null,
        smtp_port: smtpPort,
        smtp_email: smtpEmail || null,
        smtp_username: smtpEmail || null,
        smtp_password: smtpPassword || null,
      });

      toast({ title: "Settings and API Keys saved successfully!" });
      await refetch();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateColor = (key: string, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const resetColor = (key: string) => {
    setColors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const hslToHex = (hsl: string): string => {
    try {
      const parts = hsl.trim().split(/\s+/);
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    } catch {
      return "#000000";
    }
  };

  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  // Mirrors index.css's :root block exactly — a real fallback for when getComputedStyle can't
  // (or, for a value this app has never overridden, shouldn't need to) resolve the live custom
  // property, instead of silently defaulting to "0 0% 0%" (pure black), which every one of these
  // swatches would render as — none of them are actually supposed to be black, and background/
  // card genuinely ARE dark, so a near-black swatch was easy to mistake for "blank/not working"
  // sitting on this same dark page background.
  const DEFAULT_THEME_HSL: Record<string, string> = {
    primary: "230 80% 60%",
    "primary-foreground": "0 0% 100%",
    secondary: "270 60% 55%",
    background: "228 28% 5%",
    foreground: "210 40% 96%",
    card: "228 28% 8%",
  };

  const getCurrentHslValue = (key: string): string => {
    if (colors[key]) return colors[key];
    const computed = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
    return computed || DEFAULT_THEME_HSL[key] || "0 0% 0%";
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Site Settings</h1>
          <p className="text-muted-foreground mt-1">Manage branding, colors, API keys, SEO, scripts, and navigation</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg gradient-bg px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium capitalize transition-all ${
                tab === t.key
                  ? "gradient-bg text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-border bg-card p-6 glow-card">
        {/* Brand Tab */}
        {tab === "brand" && (
          <div className="space-y-6">
            <div>
              <label className="text-sm font-semibold text-foreground">Site Name</label>
              <p className="text-xs text-muted-foreground mb-2">This name appears in the sidebar logo area</p>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full max-w-md rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-foreground">Logo</label>
                <p className="text-xs text-muted-foreground mb-2">Displayed in the sidebar and navbar</p>
                {logoUrl && (
                  <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border inline-block">
                    <img src={logoUrl} alt="Logo" className="h-16 max-w-[200px] object-contain" />
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border bg-muted/20 hover:bg-muted/40 px-4 py-3 text-sm text-muted-foreground transition-colors">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {logoUrl ? "Change Logo" : "Upload Logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "logo")}
                  />
                </label>
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground">Favicon</label>
                <p className="text-xs text-muted-foreground mb-2">Browser tab icon (recommended: 32x32 or 64x64 PNG)</p>
                {faviconUrl && (
                  <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border inline-block">
                    <img src={faviconUrl} alt="Favicon" className="h-10 w-10 object-contain" />
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border bg-muted/20 hover:bg-muted/40 px-4 py-3 text-sm text-muted-foreground transition-colors">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {faviconUrl ? "Change Favicon" : "Upload Favicon"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "favicon")}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Colors Tab */}
        {tab === "colors" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Theme Colors</h3>
              <p className="text-xs text-muted-foreground mb-6">Pick 5 colors to style your entire site. All other colors are auto-derived.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SIMPLE_COLORS.map((cv) => {
                const currentHsl = getCurrentHslValue(cv.key);
                const hexValue = hslToHex(currentHsl);
                const isOverridden = cv.key in colors;
                return (
                  <div key={cv.key} className={`rounded-xl border p-4 transition-all ${isOverridden ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="relative">
                        <input
                          type="color"
                          value={hexValue}
                          onChange={(e) => updateColor(cv.key, hexToHsl(e.target.value))}
                          // A light, fixed-contrast ring — border-border alone is itself a dark
                          // color, so a swatch for something legitimately dark (Background, Cards
                          // & Panels) had a dark fill on a dark border on this same dark page —
                          // functionally invisible, easy to mistake for a blank/broken control.
                          className="h-10 w-10 rounded-lg cursor-pointer border-2 border-white/25 bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{cv.label}</p>
                          <span className="font-mono text-[10px] text-muted-foreground">{hexValue.toUpperCase()}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{cv.description}</p>
                      </div>
                    </div>
                    {isOverridden && (
                      <button
                        onClick={() => resetColor(cv.key)}
                        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Reset to default
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fonts Tab */}
        {tab === "fonts" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Typography</h3>
              <p className="text-xs text-muted-foreground mb-4">Set custom Google Fonts for different parts of your site.</p>
            </div>

            {([
              { key: "primary" as const, label: "Primary Font (Headers & Display)", description: "Used for headings and logo text", placeholder: "e.g. Orbitron, Montserrat" },
              { key: "secondary" as const, label: "Secondary Font (Body Text)", description: "Used for paragraphs and general content", placeholder: "e.g. Inter, Roboto" },
              { key: "button" as const, label: "Button Font", description: "Used specifically for button text", placeholder: "e.g. Poppins, Raleway" },
            ]).map((item) => (
              <div key={item.key} className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{item.label}</label>
                <input
                  type="text"
                  value={fonts[item.key]}
                  onChange={(e) => setFonts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  placeholder={item.placeholder}
                  className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}
          </div>
        )}

        {/* API Keys & Secrets Tab */}
        {tab === "api_keys" && (
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Service & Integration API Keys
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Input your live Brevo SMS/Email keys and SMTP credentials below — these power both user email/phone
                verification (OTP behavior/limits are configured separately on Rewards & Verification) and transactional emails.
              </p>
            </div>

            {/* Brevo SMS & Email API Credentials (replaces Infobip) */}
            <div className="rounded-xl border border-border bg-emerald-500/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                    <MessageSquare className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Brevo SMS & Email API (BREVO_API_KEY)</h4>
                    <p className="text-xs text-muted-foreground">SMS and Email OTP delivery — same API key used for user email/phone verification</p>
                  </div>
                </div>
                {(() => {
                  const configured = !!brevoApiKey;
                  return (
                    <div className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border ${
                      configured ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                      {configured ? "Configured" : "Not Configured"}
                    </div>
                  );
                })()}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Brevo API Key (BREVO_API_KEY)</label>
                  <input
                    type="password"
                    value={brevoApiKey}
                    onChange={(e) => setBrevoApiKey(e.target.value)}
                    placeholder="xkeysib-••••••••••••••••••••••••"
                    className="w-full rounded-xl border border-emerald-500/40 bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SMS Sender Name (BREVO_SMS_SENDER)</label>
                  <input
                    type="text"
                    value={brevoSmsSender}
                    onChange={(e) => setBrevoSmsSender(e.target.value)}
                    placeholder="Horizon"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email Sender Address (BREVO_EMAIL_SENDER)</label>
                  <input
                    type="text"
                    value={brevoEmailSender}
                    onChange={(e) => setBrevoEmailSender(e.target.value)}
                    placeholder="noreply@yourdomain.com"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email Sender Name (BREVO_EMAIL_SENDER_NAME)</label>
                  <input
                    type="text"
                    value={brevoEmailSenderName}
                    onChange={(e) => setBrevoEmailSenderName(e.target.value)}
                    placeholder="Horizon Players"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { checked: brevoEmailEnabled, onChange: setBrevoEmailEnabled, icon: Mail, label: "Enable Email OTP" },
                  { checked: brevoSmsEnabled, onChange: setBrevoSmsEnabled, icon: Phone, label: "Enable SMS OTP" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">{item.label}</span>
                    </div>
                    <Switch checked={item.checked} onCheckedChange={item.onChange} />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(["email", "sms"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    disabled={testingChannel !== null || !brevoApiKey}
                    onClick={async () => {
                      const destination = prompt(
                        ch === "email" ? "Send test email to:" : "Send test to phone number (E.164, e.g. +15551234567):"
                      );
                      if (!destination) return;
                      setTestingChannel(ch);
                      try {
                        const endpoint = ch === "email" ? "/admin/verifications/test-email-otp" : "/admin/verifications/test-sms";
                        const { data } = await api.post(endpoint, { destination });
                        toast({ title: `✅ Test ${ch} sent`, description: data?.message ?? "" });
                      } catch (err: any) {
                        toast({ title: `Test ${ch} failed`, description: err.response?.data?.message || err.message, variant: "destructive" });
                      } finally {
                        setTestingChannel(null);
                      }
                    }}
                    className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {testingChannel === ch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Test {ch === "email" ? "Email" : "SMS"} OTP
                  </button>
                ))}
              </div>
            </div>

            {/* SMTP Mail Server Settings */}
            <div className="rounded-xl border border-border bg-sky-500/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10">
                    <Mail className="h-5 w-5 text-sky-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">SMTP Email Server (Verification Emails)</h4>
                    <p className="text-xs text-muted-foreground">Hostinger / Custom SMTP Host, Port, Email, and Password — also used for transaction/password-request emails</p>
                  </div>
                </div>
                {(() => {
                  const configured = !!(smtpHost && smtpEmail && smtpPassword);
                  return (
                    <div className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border ${
                      configured ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                      {configured ? "Connected" : "Not Configured"}
                    </div>
                  );
                })()}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SMTP Host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.hostinger.com"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SMTP Port</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                    placeholder="587"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SMTP Email / Username</label>
                  <input
                    type="email"
                    value={smtpEmail}
                    onChange={(e) => setSmtpEmail(e.target.value)}
                    placeholder="noreply@yourdomain.com"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SMTP Password</label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!smtpHost || !smtpEmail || !smtpPassword) {
                    toast({ title: "Please fill in SMTP settings and save first", variant: "destructive" });
                    return;
                  }
                  setTestingSmtp(true);
                  try {
                    const { data } = await api.post("/admin/verifications/test-email", {});
                    toast({ title: "✅ Test email sent!", description: data?.message ?? "" });
                  } catch (err: any) {
                    toast({ title: "SMTP Test Failed", description: err.response?.data?.message || err.message || "Could not send test email", variant: "destructive" });
                  } finally {
                    setTestingSmtp(false);
                  }
                }}
                disabled={testingSmtp || !smtpHost || !smtpEmail}
                className="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test SMTP
              </button>
            </div>

            {/* GoHighLevel (GHL) CRM Integration */}
            <div className="rounded-xl border border-border bg-indigo-500/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-border pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">GoHighLevel (GHL) CRM Integration</h4>
                  <p className="text-xs text-muted-foreground">GHL API Key, Location ID, and Assigned User ID for automated player sync</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">API Key / Access Token</label>
                  <input
                    type="password"
                    value={ghlApiKey}
                    onChange={(e) => setGhlApiKey(e.target.value)}
                    placeholder="ghl_key_••••••••"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Location ID</label>
                  <input
                    type="text"
                    value={ghlLocationId}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                    placeholder="loc_12345"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assigned User ID</label>
                  <input
                    type="text"
                    value={ghlAssignedUserId}
                    onChange={(e) => setGhlAssignedUserId(e.target.value)}
                    placeholder="usr_12345"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            {/* FAST Payment (automated deposit gateway) Credentials */}
            <div className="rounded-xl border border-border bg-sky-500/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b border-border pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10">
                  <CreditCard className="h-5 w-5 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">FAST Payment (Automated Deposit Gateway)</h4>
                  <p className="text-xs text-muted-foreground">DollarPayWallet/Kashuuu Merchant ID and Key — powers Google Pay / Cash App / Apple Pay deposits</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Base URL</label>
                  <input
                    type="text"
                    value={fastPaymentBaseUrl}
                    onChange={(e) => setFastPaymentBaseUrl(e.target.value)}
                    placeholder="https://mh.dollarpaywallet.com"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Merchant ID</label>
                  <input
                    type="text"
                    value={fastPaymentMerchantId}
                    onChange={(e) => setFastPaymentMerchantId(e.target.value)}
                    placeholder="1092768610"
                    className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-sky-400">Key</label>
                  <input
                    type="password"
                    value={fastPaymentKey}
                    onChange={(e) => setFastPaymentKey(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="w-full rounded-xl border border-sky-500/40 bg-muted/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all font-mono"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Webhook URL for this gateway's dashboard (if it asks for one to whitelist): <code className="font-mono">{`${window.location.origin}/api/webhooks/fast-payment`}</code>
              </p>
            </div>
          </div>
        )}

        {/* SEO Tab */}
        {tab === "seo" && (
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="text-sm font-semibold text-foreground">Page Title</label>
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="My Gaming Platform"
                maxLength={60}
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Meta Description</label>
              <textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="Describe your site in 1-2 sentences..."
                maxLength={160}
                rows={3}
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Meta Keywords</label>
              <input
                type="text"
                value={seoKeywords}
                onChange={(e) => setSeoKeywords(e.target.value)}
                placeholder="online games, sweepstakes, casino, rewards"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated. Most search engines ignore this today, but some directories/social scrapers still read it.</p>
            </div>
          </div>
        )}

        {/* Scripts Tab */}
        {tab === "scripts" && (
          <div className="space-y-6">
            <div>
              <label className="text-sm font-semibold text-foreground">Header Scripts</label>
              <p className="text-xs text-muted-foreground mb-1.5">Injected into &lt;head&gt; on every page — e.g. Google Analytics, Meta Pixel.</p>
              <textarea
                value={headerScripts}
                onChange={(e) => setHeaderScripts(e.target.value)}
                rows={6}
                placeholder="<!-- Google Analytics, etc. -->"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Body Scripts</label>
              <p className="text-xs text-muted-foreground mb-1.5">Injected at the start of &lt;body&gt; — e.g. GTM noscript fallback, chat widgets.</p>
              <textarea
                value={bodyScripts}
                onChange={(e) => setBodyScripts(e.target.value)}
                rows={6}
                placeholder="<!-- Chat widget, GTM noscript, etc. -->"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Footer Scripts</label>
              <p className="text-xs text-muted-foreground mb-1.5">Injected at the end of &lt;body&gt;, right before the page closes.</p>
              <textarea
                value={footerScripts}
                onChange={(e) => setFooterScripts(e.target.value)}
                rows={6}
                placeholder="<!-- Deferred trackers, etc. -->"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
            <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠️ These are injected as raw HTML/JS on every page load, unsanitized. Only paste scripts from sources you trust — this is equivalent to giving that code full access to your site and your visitors' sessions.
            </p>
          </div>
        )}

        {/* Custom CSS Tab */}
        {tab === "css" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground">Custom CSS</label>
              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                rows={15}
                placeholder="/* Custom CSS overrides */"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSiteSettings;
