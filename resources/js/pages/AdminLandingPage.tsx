import { useState, useEffect, useRef } from "react";
import { uploadFile } from "@/lib/uploadFile";
import api from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { LandingPageConfig, DEFAULT_LANDING_CONFIG, SectionBackground, SectionBackgroundType } from "@/types/landing-page";
import {
  Save, Eye, Loader2, Upload, Trash2, Plus, X,
  Type, Image as ImageIcon, LayoutGrid, ArrowRight, Sparkles, Megaphone, Footprints, Navigation, BarChart3, MessageSquareQuote, Paintbrush, Palette, HelpCircle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

/* ─── Image Uploader ─── */
function ImageUploader({ value, onChange, label }: { value: string | null; onChange: (url: string | null) => void; label: string }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file, "landing-images");
      onChange(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.response?.data?.message || err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative w-20 h-14 rounded-lg overflow-hidden border border-border">
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button onClick={() => onChange(null)} className="absolute top-0.5 right-0.5 p-0.5 rounded bg-background/80">
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          </div>
        ) : null}
        <button onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? "Uploading..." : "Upload"}
        </button>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </div>
  );
}

/* ─── Input Field ─── */
function InputField({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
          className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground" />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground" />
      )}
    </div>
  );
}

/* ─── Background Picker ─── */
const BG_TYPE_OPTIONS: { value: SectionBackgroundType; label: string; icon: typeof Paintbrush }[] = [
  { value: "default", label: "Default", icon: Paintbrush },
  { value: "color", label: "Solid Color", icon: Palette },
  { value: "gradient", label: "Gradient", icon: Sparkles },
  { value: "image", label: "Image", icon: ImageIcon },
];

const PRESET_GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%)",
  "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  "linear-gradient(135deg, #141e30 0%, #243b55 100%)",
];

function BackgroundPicker({ bg, onChange }: { bg: SectionBackground; onChange: (bg: SectionBackground) => void }) {
  const [gradColor1, setGradColor1] = useState(bg.background_gradient?.match(/#[a-fA-F0-9]{6}/g)?.[0] || "#667eea");
  const [gradColor2, setGradColor2] = useState(bg.background_gradient?.match(/#[a-fA-F0-9]{6}/g)?.[1] || "#764ba2");
  const [gradAngle, setGradAngle] = useState(() => {
    const match = bg.background_gradient?.match(/(\d+)deg/);
    return match ? parseInt(match[1]) : 135;
  });

  const buildGradient = (c1: string, c2: string, angle: number) => {
    const grad = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
    onChange({ ...bg, background_gradient: grad });
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Paintbrush className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Section Background</span>
      </div>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {BG_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button key={opt.value} onClick={() => onChange({ ...bg, background_type: opt.value })}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                bg.background_type === opt.value
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}>
              <Icon className="h-3 w-3" /> {opt.label}
            </button>
          );
        })}
      </div>

      {/* Color picker */}
      {bg.background_type === "color" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Background Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={bg.background_color || "#1a1a2e"}
              onChange={(e) => onChange({ ...bg, background_color: e.target.value })}
              className="h-10 w-14 rounded-lg border border-border cursor-pointer bg-transparent" />
            <input type="text" value={bg.background_color || ""} placeholder="#1a1a2e"
              onChange={(e) => onChange({ ...bg, background_color: e.target.value })}
              className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
          </div>
          {bg.background_color && (
            <div className="h-12 rounded-lg border border-border" style={{ backgroundColor: bg.background_color }} />
          )}
        </div>
      )}

      {/* Gradient picker */}
      {bg.background_type === "gradient" && (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">Gradient Presets</label>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_GRADIENTS.map((g, i) => (
              <button key={i} onClick={() => {
                const colors = g.match(/#[a-fA-F0-9]{6}/g) || [];
                if (colors[0]) setGradColor1(colors[0]);
                if (colors[1]) setGradColor2(colors[1]);
                onChange({ ...bg, background_gradient: g });
              }}
                className={`h-10 rounded-lg border-2 transition-all ${
                  bg.background_gradient === g ? "border-primary scale-105 shadow-md" : "border-border hover:border-foreground/30"
                }`} style={{ background: g }} />
            ))}
          </div>

          {/* Custom gradient builder */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <label className="block text-xs font-bold text-foreground">Build Your Own Gradient</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Color 1</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={gradColor1}
                    onChange={(e) => { setGradColor1(e.target.value); buildGradient(e.target.value, gradColor2, gradAngle); }}
                    className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent" />
                  <input type="text" value={gradColor1}
                    onChange={(e) => { setGradColor1(e.target.value); buildGradient(e.target.value, gradColor2, gradAngle); }}
                    className="flex-1 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Color 2</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={gradColor2}
                    onChange={(e) => { setGradColor2(e.target.value); buildGradient(gradColor1, e.target.value, gradAngle); }}
                    className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent" />
                  <input type="text" value={gradColor2}
                    onChange={(e) => { setGradColor2(e.target.value); buildGradient(gradColor1, e.target.value, gradAngle); }}
                    className="flex-1 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary font-mono" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Angle: {gradAngle}°</label>
              <input type="range" min={0} max={360} value={gradAngle}
                onChange={(e) => { const a = parseInt(e.target.value); setGradAngle(a); buildGradient(gradColor1, gradColor2, a); }}
                className="w-full accent-primary" />
            </div>
          </div>

          <label className="block text-xs font-medium text-muted-foreground">Or paste CSS gradient</label>
          <input type="text" value={bg.background_gradient || ""} placeholder="linear-gradient(135deg, #667eea, #764ba2)"
            onChange={(e) => onChange({ ...bg, background_gradient: e.target.value })}
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
          {bg.background_gradient && (
            <div className="h-12 rounded-lg border border-border" style={{ background: bg.background_gradient }} />
          )}
        </div>
      )}

      {/* Image uploader */}
      {bg.background_type === "image" && (
        <ImageUploader label="Background Image" value={bg.background_image_url} onChange={(v) => onChange({ ...bg, background_image_url: v })} />
      )}

      {/* Text color override — always available */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-foreground">Text Color Override</label>
          {bg.text_color && (
            <button onClick={() => onChange({ ...bg, text_color: null })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-3 w-3" /> Reset to Default
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {bg.text_color ? "Custom text color active." : "Using default theme text color. Pick a color to override."}
        </p>
        <div className="flex items-center gap-3">
          <input type="color" value={bg.text_color || "#ffffff"}
            onChange={(e) => onChange({ ...bg, text_color: e.target.value })}
            className="h-10 w-14 rounded-lg border border-border cursor-pointer bg-transparent" />
          <input type="text" value={bg.text_color || ""} placeholder="Default"
            onChange={(e) => onChange({ ...bg, text_color: e.target.value || null })}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary font-mono" />
        </div>
        {/* Live preview */}
        <div className="h-16 rounded-lg border border-border flex items-center justify-center text-sm font-bold"
          style={{
            ...(bg.background_color ? { backgroundColor: bg.background_color } : {}),
            ...(bg.background_gradient ? { background: bg.background_gradient } : {}),
            ...(bg.background_image_url ? { backgroundImage: `url(${bg.background_image_url})`, backgroundSize: "cover" } : {}),
            ...(!bg.background_color && !bg.background_gradient && !bg.background_image_url ? { backgroundColor: "hsl(var(--card))" } : {}),
            color: bg.text_color || undefined,
          }}>
          Preview Text
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminLandingPage() {
  const [config, setConfig] = useState<LandingPageConfig>(DEFAULT_LANDING_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.get("/admin/site-settings").then((res) => {
      const data = res.data?.settings;
      if (data?.landing_page_config && Object.keys(data.landing_page_config as object).length > 0) {
        const saved = data.landing_page_config as unknown as Partial<LandingPageConfig>;
        setConfig(prev => ({
          hero: { ...prev.hero, ...saved.hero },
          stats_banner: { ...prev.stats_banner, ...saved.stats_banner },
          games_section: { ...prev.games_section, ...saved.games_section },
          transfers_section: { ...prev.transfers_section, ...saved.transfers_section },
          features_section: { ...prev.features_section, ...saved.features_section },
          testimonials_section: { ...prev.testimonials_section, ...saved.testimonials_section },
          faq_section: { ...prev.faq_section, ...saved.faq_section },
          cta_section: { ...prev.cta_section, ...saved.cta_section },
          footer: { ...prev.footer, ...saved.footer },
          navbar: { ...prev.navbar, ...saved.navbar },
        }));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof LandingPageConfig>(section: K, value: LandingPageConfig[K]) => {
    setConfig((prev) => ({ ...prev, [section]: value }));
  };

  const updateBg = <K extends keyof LandingPageConfig>(section: K, bg: SectionBackground) => {
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], ...bg } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/admin/site-settings", { landing_page_config: config });
      toast({ title: "Landing page updated!" });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const { hero, stats_banner, games_section, transfers_section, features_section, testimonials_section, faq_section, cta_section, footer, navbar } = config;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-wider">Landing Page Editor</h1>
          <p className="text-sm text-muted-foreground">Customize every section of your landing page</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" target="_blank" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Eye className="h-4 w-4" /> Preview
          </a>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg gradient-bg px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <Tabs defaultValue="hero" className="space-y-6">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="hero" className="gap-1.5 text-xs"><Type className="h-3.5 w-3.5" /> Hero</TabsTrigger>
          <TabsTrigger value="navbar" className="gap-1.5 text-xs"><Navigation className="h-3.5 w-3.5" /> Navbar</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Stats</TabsTrigger>
          <TabsTrigger value="games" className="gap-1.5 text-xs"><LayoutGrid className="h-3.5 w-3.5" /> Games</TabsTrigger>
          <TabsTrigger value="transfers" className="gap-1.5 text-xs"><ArrowRight className="h-3.5 w-3.5" /> Transfers</TabsTrigger>
          <TabsTrigger value="features" className="gap-1.5 text-xs"><Sparkles className="h-3.5 w-3.5" /> Features</TabsTrigger>
          <TabsTrigger value="testimonials" className="gap-1.5 text-xs"><MessageSquareQuote className="h-3.5 w-3.5" /> Testimonials</TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5 text-xs"><HelpCircle className="h-3.5 w-3.5" /> FAQ</TabsTrigger>
          <TabsTrigger value="cta" className="gap-1.5 text-xs"><Megaphone className="h-3.5 w-3.5" /> CTA</TabsTrigger>
          <TabsTrigger value="footer" className="gap-1.5 text-xs"><Footprints className="h-3.5 w-3.5" /> Footer</TabsTrigger>
        </TabsList>

        {/* ── HERO ── */}
        <TabsContent value="hero" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="font-display text-sm font-bold tracking-wider">Hero Section</h3>
            <BackgroundPicker bg={hero} onChange={(bg) => updateBg("hero", bg)} />
            <InputField label="Badge Text" value={hero.badge_text} onChange={(v) => update("hero", { ...hero, badge_text: v })} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InputField label="Title Line 1" value={hero.title_line1} onChange={(v) => update("hero", { ...hero, title_line1: v })} />
              <InputField label="Highlighted Word" value={hero.title_highlight} onChange={(v) => update("hero", { ...hero, title_highlight: v })} />
              <InputField label="Title Line 2" value={hero.title_line2} onChange={(v) => update("hero", { ...hero, title_line2: v })} />
            </div>
            <InputField label="Subtitle" value={hero.subtitle} onChange={(v) => update("hero", { ...hero, subtitle: v })} multiline />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Trust Badges</label>
              <div className="space-y-2">
                {hero.trust_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={item.label} onChange={(e) => {
                      const items = [...hero.trust_items];
                      items[i] = { label: e.target.value };
                      update("hero", { ...hero, trust_items: items });
                    }} className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors" />
                    <button onClick={() => update("hero", { ...hero, trust_items: hero.trust_items.filter((_, j) => j !== i) })}
                      className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                <button onClick={() => update("hero", { ...hero, trust_items: [...hero.trust_items, { label: "New Badge" }] })}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Badge</button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── NAVBAR ── */}
        <TabsContent value="navbar" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="font-display text-sm font-bold tracking-wider">Navigation Links</h3>
            <p className="text-xs text-muted-foreground">Logo and site name are managed in Site Settings → Branding.</p>
            <div className="space-y-3">
              {navbar.links.map((link, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input type="text" value={link.label} placeholder="Label" onChange={(e) => {
                    const links = [...navbar.links];
                    links[i] = { ...links[i], label: e.target.value };
                    update("navbar", { ...navbar, links });
                  }} className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                  <input type="text" value={link.href} placeholder="#section or /path" onChange={(e) => {
                    const links = [...navbar.links];
                    links[i] = { ...links[i], href: e.target.value };
                    update("navbar", { ...navbar, links });
                  }} className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                  <button onClick={() => update("navbar", { ...navbar, links: navbar.links.filter((_, j) => j !== i) })}
                    className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={() => update("navbar", { ...navbar, links: [...navbar.links, { label: "Link", href: "#" }] })}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Link</button>
            </div>
          </div>
        </TabsContent>

        {/* ── STATS BANNER ── */}
        <TabsContent value="stats" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Stats Banner</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={stats_banner.visible} onCheckedChange={(v) => update("stats_banner", { ...stats_banner, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={stats_banner} onChange={(bg) => updateBg("stats_banner", bg)} />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Stats</label>
              <div className="space-y-3">
                {stats_banner.stats.map((stat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input type="text" value={stat.value} placeholder="10K+" onChange={(e) => {
                      const stats = [...stats_banner.stats];
                      stats[i] = { ...stats[i], value: e.target.value };
                      update("stats_banner", { ...stats_banner, stats });
                    }} className="w-28 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary font-bold" />
                    <input type="text" value={stat.label} placeholder="Label" onChange={(e) => {
                      const stats = [...stats_banner.stats];
                      stats[i] = { ...stats[i], label: e.target.value };
                      update("stats_banner", { ...stats_banner, stats });
                    }} className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                    <button onClick={() => update("stats_banner", { ...stats_banner, stats: stats_banner.stats.filter((_, j) => j !== i) })}
                      className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                <button onClick={() => update("stats_banner", { ...stats_banner, stats: [...stats_banner.stats, { value: "0", label: "New Stat" }] })}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Stat</button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── GAMES ── */}
        <TabsContent value="games" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Games Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={games_section.visible} onCheckedChange={(v) => update("games_section", { ...games_section, visible: v })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Games are pulled automatically from your Games catalog.</p>
            <BackgroundPicker bg={games_section} onChange={(bg) => updateBg("games_section", bg)} />
            <InputField label="Section Title" value={games_section.title} onChange={(v) => update("games_section", { ...games_section, title: v })} />
            <InputField label="Section Subtitle" value={games_section.subtitle} onChange={(v) => update("games_section", { ...games_section, subtitle: v })} multiline />
          </div>
        </TabsContent>

        {/* ── TRANSFERS ── */}
        <TabsContent value="transfers" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Fund Transfers Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={transfers_section.visible} onCheckedChange={(v) => update("transfers_section", { ...transfers_section, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={transfers_section} onChange={(bg) => updateBg("transfers_section", bg)} />
            <InputField label="Badge Text" value={transfers_section.badge_text} onChange={(v) => update("transfers_section", { ...transfers_section, badge_text: v })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Title Line 1" value={transfers_section.title_line1} onChange={(v) => update("transfers_section", { ...transfers_section, title_line1: v })} />
              <InputField label="Highlighted Word" value={transfers_section.title_highlight} onChange={(v) => update("transfers_section", { ...transfers_section, title_highlight: v })} />
            </div>
            <InputField label="Description" value={transfers_section.subtitle} onChange={(v) => update("transfers_section", { ...transfers_section, subtitle: v })} multiline />
            <InputField label="CTA Button Text" value={transfers_section.cta_text} onChange={(v) => update("transfers_section", { ...transfers_section, cta_text: v })} />
            <ImageUploader label="Feature Image (e.g. car illustration)" value={transfers_section.feature_image_url} onChange={(v) => update("transfers_section", { ...transfers_section, feature_image_url: v })} />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Action Tags</label>
              <div className="flex flex-wrap gap-2">
                {transfers_section.actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1">
                    <input type="text" value={action} onChange={(e) => {
                      const actions = [...transfers_section.actions];
                      actions[i] = e.target.value;
                      update("transfers_section", { ...transfers_section, actions });
                    }} className="bg-transparent text-xs text-foreground outline-none w-20" />
                    <button onClick={() => update("transfers_section", { ...transfers_section, actions: transfers_section.actions.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                <button onClick={() => update("transfers_section", { ...transfers_section, actions: [...transfers_section.actions, "New"] })}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add</button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── FEATURES ── */}
        <TabsContent value="features" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Features Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={features_section.visible} onCheckedChange={(v) => update("features_section", { ...features_section, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={features_section} onChange={(bg) => updateBg("features_section", bg)} />
            <InputField label="Section Title" value={features_section.title} onChange={(v) => update("features_section", { ...features_section, title: v })} />
            <InputField label="Section Subtitle" value={features_section.subtitle} onChange={(v) => update("features_section", { ...features_section, subtitle: v })} />
            <div className="space-y-4">
              {features_section.features.map((f, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Feature {i + 1}</span>
                    <button onClick={() => update("features_section", { ...features_section, features: features_section.features.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <InputField label="Title" value={f.title} onChange={(v) => {
                    const features = [...features_section.features];
                    features[i] = { ...features[i], title: v };
                    update("features_section", { ...features_section, features });
                  }} />
                  <InputField label="Description" value={f.desc} onChange={(v) => {
                    const features = [...features_section.features];
                    features[i] = { ...features[i], desc: v };
                    update("features_section", { ...features_section, features });
                  }} multiline />
                  <ImageUploader label="Feature Image" value={f.image_url} onChange={(v) => {
                    const features = [...features_section.features];
                    features[i] = { ...features[i], image_url: v };
                    update("features_section", { ...features_section, features });
                  }} />
                </div>
              ))}
              <button onClick={() => update("features_section", { ...features_section, features: [...features_section.features, { title: "New Feature", desc: "Description here", image_url: null }] })}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Feature</button>
            </div>
          </div>
        </TabsContent>

        {/* ── TESTIMONIALS ── */}
        <TabsContent value="testimonials" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Testimonials Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={testimonials_section.visible} onCheckedChange={(v) => update("testimonials_section", { ...testimonials_section, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={testimonials_section} onChange={(bg) => updateBg("testimonials_section", bg)} />
            <InputField label="Section Title" value={testimonials_section.title} onChange={(v) => update("testimonials_section", { ...testimonials_section, title: v })} />
            <InputField label="Section Subtitle" value={testimonials_section.subtitle} onChange={(v) => update("testimonials_section", { ...testimonials_section, subtitle: v })} />
            <ImageUploader label="Decorative Image (optional)" value={testimonials_section.image_url} onChange={(v) => update("testimonials_section", { ...testimonials_section, image_url: v })} />
            <div className="space-y-4">
              {testimonials_section.testimonials.map((t, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Testimonial {i + 1}</span>
                    <button onClick={() => update("testimonials_section", { ...testimonials_section, testimonials: testimonials_section.testimonials.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <InputField label="Name" value={t.name} onChange={(v) => {
                    const testimonials = [...testimonials_section.testimonials];
                    testimonials[i] = { ...testimonials[i], name: v };
                    update("testimonials_section", { ...testimonials_section, testimonials });
                  }} />
                  <InputField label="Quote" value={t.quote} onChange={(v) => {
                    const testimonials = [...testimonials_section.testimonials];
                    testimonials[i] = { ...testimonials[i], quote: v };
                    update("testimonials_section", { ...testimonials_section, testimonials });
                  }} multiline />
                  <ImageUploader label="Avatar (optional)" value={t.avatar_url} onChange={(v) => {
                    const testimonials = [...testimonials_section.testimonials];
                    testimonials[i] = { ...testimonials[i], avatar_url: v };
                    update("testimonials_section", { ...testimonials_section, testimonials });
                  }} />
                </div>
              ))}
              <button onClick={() => update("testimonials_section", { ...testimonials_section, testimonials: [...testimonials_section.testimonials, { name: "New Player", quote: "Great platform!", avatar_url: null }] })}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Testimonial</button>
            </div>
          </div>
        </TabsContent>

        {/* ── FAQ ── */}
        <TabsContent value="faq" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">FAQ Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={faq_section.visible} onCheckedChange={(v) => update("faq_section", { ...faq_section, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={faq_section} onChange={(bg) => updateBg("faq_section", bg)} />
            <InputField label="Section Title" value={faq_section.title} onChange={(v) => update("faq_section", { ...faq_section, title: v })} />
            <InputField label="Section Subtitle" value={faq_section.subtitle} onChange={(v) => update("faq_section", { ...faq_section, subtitle: v })} />
            <div className="space-y-4">
              {faq_section.faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">FAQ {i + 1}</span>
                    <button onClick={() => update("faq_section", { ...faq_section, faqs: faq_section.faqs.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <InputField label="Question" value={faq.question} onChange={(v) => {
                    const faqs = [...faq_section.faqs];
                    faqs[i] = { ...faqs[i], question: v };
                    update("faq_section", { ...faq_section, faqs });
                  }} />
                  <InputField label="Answer" value={faq.answer} onChange={(v) => {
                    const faqs = [...faq_section.faqs];
                    faqs[i] = { ...faqs[i], answer: v };
                    update("faq_section", { ...faq_section, faqs });
                  }} multiline />
                </div>
              ))}
              <button onClick={() => update("faq_section", { ...faq_section, faqs: [...faq_section.faqs, { question: "New question?", answer: "Answer here." }] })}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add FAQ</button>
            </div>
          </div>
        </TabsContent>

        {/* ── CTA ── */}
        <TabsContent value="cta" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold tracking-wider">Bottom CTA Section</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch checked={cta_section.visible} onCheckedChange={(v) => update("cta_section", { ...cta_section, visible: v })} />
              </div>
            </div>
            <BackgroundPicker bg={cta_section} onChange={(bg) => updateBg("cta_section", bg)} />
            <InputField label="Pre-Title Text" value={cta_section.pre_title} onChange={(v) => update("cta_section", { ...cta_section, pre_title: v })} />
            <InputField label="Main Title" value={cta_section.title} onChange={(v) => update("cta_section", { ...cta_section, title: v })} />
            <InputField label="Button Text" value={cta_section.button_text} onChange={(v) => update("cta_section", { ...cta_section, button_text: v })} />
            <ImageUploader label="CTA Image" value={cta_section.image_url} onChange={(v) => update("cta_section", { ...cta_section, image_url: v })} />
          </div>
        </TabsContent>

        {/* ── FOOTER ── */}
        <TabsContent value="footer" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="font-display text-sm font-bold tracking-wider">Footer</h3>
            <BackgroundPicker bg={footer} onChange={(bg) => updateBg("footer", bg)} />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Show Games List</span>
              <Switch checked={footer.show_games} onCheckedChange={(v) => update("footer", { ...footer, show_games: v })} />
            </div>
            <InputField label="Copyright Text (leave empty for default)" value={footer.copyright_text || ""} onChange={(v) => update("footer", { ...footer, copyright_text: v || null })} />

            {/* Extra Payment Methods */}
            <div className="space-y-3 pt-3 border-t border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra Payment Method Logos</h4>
              <p className="text-[11px] text-muted-foreground/70">Add additional payment logos to display on the landing page (besides the ones from your payment gateways).</p>
              {(footer.extra_payment_methods || []).map((pm, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Payment Method {i + 1}</span>
                    <button onClick={() => update("footer", { ...footer, extra_payment_methods: (footer.extra_payment_methods || []).filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <InputField label="Name" value={pm.name} onChange={(v) => {
                    const methods = [...(footer.extra_payment_methods || [])];
                    methods[i] = { ...methods[i], name: v };
                    update("footer", { ...footer, extra_payment_methods: methods });
                  }} />
                  <ImageUploader label="Logo" value={pm.logo_url || null} onChange={(v) => {
                    if (!v) return;
                    const methods = [...(footer.extra_payment_methods || [])];
                    methods[i] = { ...methods[i], logo_url: v };
                    update("footer", { ...footer, extra_payment_methods: methods });
                  }} />
                </div>
              ))}
              <button onClick={() => update("footer", { ...footer, extra_payment_methods: [...(footer.extra_payment_methods || []), { name: "Payment Method", logo_url: "" }] })}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add Payment Method</button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
