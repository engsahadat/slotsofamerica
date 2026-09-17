import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import GameCard, { GameAccessRequest } from "@/components/GameCard";
import { buildAccessRequestMap } from "@/lib/accessRequests";
import { Link, Navigate } from "react-router-dom";
import LoginModal from "@/components/LoginModal";
import RegisterModal from "@/components/RegisterModal";
import HeroLoginForm from "@/components/HeroLoginForm";
import { motion } from "framer-motion";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { QuickContactWidget } from "@/components/QuickContactWidget";
import {
  Gamepad2, Menu, X, Headset, Wallet, Gift, Layers,
  Zap, ShieldCheck, Clock, CheckCircle, ArrowRight, Sparkles, Star, Quote,
} from "lucide-react";
import fundCarDefault from "@/assets/fund-transfer-car.png";
import transfersBgDefault from "@/assets/transfers-bg.jpg";
import brandDados from "@/assets/brand-dados.png";
import brandBear from "@/assets/brand-bear.png";
import brandInfo2 from "@/assets/brand-info2.png";
import brandInfo3 from "@/assets/brand-info3.png";
import brandInfo4 from "@/assets/brand-info4.png";
import statsBgDefault from "@/assets/landing-stats-bg.jpg";
import trophyDefault from "@/assets/landing-trophy.png";
import controllerDefault from "@/assets/landing-controller.png";
import coinsDefault from "@/assets/landing-coins.png";
import { LandingPageConfig, DEFAULT_LANDING_CONFIG, SectionBackground } from "@/types/landing-page";
import { getSectionBgStyle, hasCustomBg } from "@/lib/sectionBg";


const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
};

const sectionReveal = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.8, ease: "easeOut" as const },
  },
};

interface GameItem {
  id: string;
  name: string;
  download_url: string | null;
  image_url: string | null;
  web_url: string | null;
  ios_url: string | null;
  android_url: string | null;
}

const DEFAULT_FEATURE_IMAGES = [brandInfo2, brandInfo3, brandInfo4, brandBear];
const TRUST_ICONS = [ShieldCheck, Clock, CheckCircle];
const FEATURE_ICONS = [Headset, Wallet, Gift, Layers];

/** Renders the background layer for a section */
function SectionBg({ bg, fallbackImage, overlayClass = "bg-background/70" }: { bg: SectionBackground; fallbackImage?: string; overlayClass?: string }) {
  if (bg.background_type === "image" && bg.background_image_url) {
    return (
      <div className="absolute inset-0">
        <img src={bg.background_image_url} alt="" className="h-full w-full object-cover" />
        <div className={`absolute inset-0 ${overlayClass}`} />
      </div>
    );
  }
  if (bg.background_type === "color" || bg.background_type === "gradient") {
    return <div className="absolute inset-0" style={getSectionBgStyle(bg)} />;
  }
  if (fallbackImage) {
    return (
      <div className="absolute inset-0">
        <img src={fallbackImage} alt="" className="h-full w-full object-cover" />
        <div className={`absolute inset-0 ${overlayClass}`} />
      </div>
    );
  }
  return null;
}

const Homepage = () => {
  const [mobileNav, setMobileNav] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [games, setGames] = useState<GameItem[]>([]);
  const [paymentGateways, setPaymentGateways] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);
  const [accessRequests, setAccessRequests] = useState<Record<string, GameAccessRequest>>({});
  const [cfg, setCfg] = useState<LandingPageConfig>(DEFAULT_LANDING_CONFIG);
  const [scrolled, setScrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { settings } = useSiteSettings();
  const { user, loading: authLoading } = useAuth();

  // Apply the admin-editable landing page config (Admin -> Landing Page) on top of the
  // hardcoded defaults — same merge shape as AdminLandingPage.tsx's own load effect, so a
  // section left untouched by the admin keeps its default copy/background instead of going blank.
  useEffect(() => {
    const saved = settings.landing_page_config;
    if (!saved || Object.keys(saved).length === 0) return;
    setCfg((prev) => ({
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
  }, [settings.landing_page_config]);

  // Track scroll for header
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fetchAccessRequests = useCallback(async () => {
    if (!user) { setAccessRequests({}); return; }
    try {
      const res = await api.get("/user/dashboard");
      const requests = res.data?.unlock_requests || [];
      const profileUsername = user?.username || user?.name || user?.email?.split("@")[0] || "unknown";
      setAccessRequests(buildAccessRequestMap(requests, profileUsername, res.data?.active_accounts));
    } catch (e) {
      console.warn("Failed to fetch access requests", e);
    }
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([
        api.get("/games").then((res) => {
          if (res.data?.games) setGames(res.data.games as GameItem[]);
        }).catch(() => {}),
        api.get("/payment-gateways").then((res) => {
          if (res.data?.gateways) setPaymentGateways(res.data.gateways as any[]);
        }).catch(() => {}),
      ]);
      setLoading(false);
    };
    load();
    fetchAccessRequests();

    // TODO: no Laravel broadcast/websocket backend exists yet (deferred), so game-access status
    // changes (e.g. an admin approving a request) can't push to the client. Poll instead so the
    // card updates without the user needing to manually reload the page.
    const interval = setInterval(fetchAccessRequests, 10000);
    return () => clearInterval(interval);
  }, [fetchAccessRequests]);

  const { hero, stats_banner, games_section, transfers_section, features_section, testimonials_section, faq_section, cta_section, footer, navbar } = cfg;

  // Mirrors ProtectedRoute's own redirect in reverse: that one sends a logged-OUT user here from
  // any protected page, but nothing sent a logged-IN user away from here — so opening this public
  // landing page in a fresh tab (auth restores fine from localStorage, but only after this
  // effect's async /auth/me round-trip resolves) always showed the logged-out marketing/login
  // view first, even for an already-authenticated user, instead of taking them straight to their
  // dashboard the way visiting "/" on an already-logged-in session normally would.
  if (!authLoading && user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── NAVBAR ─── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? "glass border-b border-border/50 shadow-lg shadow-background/50" 
          : "bg-transparent border-b border-transparent"
      }`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-3 select-none">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.site_name} width="160" height="48" decoding="async" className="h-12 max-w-[160px] object-contain" />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-lg shadow-purple-500/20">
                  <Gamepad2 className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-display text-xl font-black tracking-wider text-white">
                    HORIZON
                  </span>
                  <span className="font-display text-[9.5px] font-extrabold tracking-[0.2em] text-[#a78bfa] mt-0.5">
                    PLAYERS ROOM
                  </span>
                </div>
              </>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            {navbar.links.map((link, i) => (
              <a key={i} href={link.href} className="relative py-1 hover:text-foreground transition-colors duration-300 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-left">{link.label}</a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => setLoginOpen(true)} className="rounded-xl border border-border/60 px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/30 hover:border-border transition-all duration-300">Login</button>
            <button onClick={() => setRegisterOpen(true)} className="btn-glow rounded-xl gradient-bg px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all duration-300 shadow-lg shadow-primary/25">Register</button>
          </div>

          <button className="md:hidden text-foreground" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation menu">
            {mobileNav ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileNav && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="md:hidden border-t border-border/50 glass px-4 pb-4 pt-2 space-y-3">
            {navbar.links.map((link, i) => (
              <a key={i} href={link.href} onClick={() => setMobileNav(false)} className="block py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</a>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setMobileNav(false); setLoginOpen(true); }} className="flex-1 rounded-xl border border-border/60 py-2.5 text-center text-sm font-semibold text-foreground">Login</button>
              <button onClick={() => { setMobileNav(false); setRegisterOpen(true); }} className="flex-1 rounded-xl gradient-bg py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20">Register</button>
            </div>
          </motion.div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section className="relative flex min-h-screen items-center justify-center pt-16 py-12 sm:py-0 overflow-hidden" style={hero.text_color ? { color: hero.text_color } : {}}>
        <div className="absolute inset-0 bg-background">
          {hasCustomBg(hero) ? (
            <>
              {hero.background_type === "image" && hero.background_image_url && (
                <>
                  <img src={hero.background_image_url} alt="" fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-background/70" />
                </>
              )}
              {(hero.background_type === "color" || hero.background_type === "gradient") && (
                <div className="absolute inset-0" style={getSectionBgStyle(hero)} />
              )}
            </>
          ) : (
            <>
              {/* Premium animated background orbs */}
              <div className="absolute inset-0 opacity-40 animate-gradient-shift"
                style={{
                  background: "radial-gradient(ellipse 80% 60% at 20% 40%, hsl(var(--primary) / 0.3), transparent), radial-gradient(ellipse 60% 80% at 80% 60%, hsl(var(--secondary) / 0.25), transparent), radial-gradient(ellipse 50% 50% at 50% 20%, hsl(var(--primary) / 0.15), transparent)",
                }}
              />
              <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[150px] animate-glow-pulse" />
              <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-secondary/8 blur-[130px] animate-glow-pulse" style={{ animationDelay: "2s" }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/3 blur-[200px]" />
              <img loading="lazy" decoding="async" src={brandDados} alt="" className="absolute bottom-10 left-6 w-36 opacity-[0.06] pointer-events-none select-none hidden lg:block animate-float" />
              <img loading="lazy" decoding="async" src={brandBear} alt="" className="absolute top-24 right-10 w-20 opacity-[0.06] pointer-events-none select-none hidden lg:block animate-float" style={{ animationDelay: "3s" }} />
            </>
          )}
        </div>

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 w-full">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left min-w-0">
              <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-2 text-xs font-semibold text-foreground backdrop-blur-sm shadow-lg shadow-primary/5">
                  <Zap className="h-3.5 w-3.5 text-primary" /> {hero.badge_text}
                </span>
              </motion.div>

              <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1}
                className="mt-8 font-display text-4xl font-black leading-[1.05] tracking-wider sm:text-5xl xl:text-7xl text-foreground">
                {hero.title_line1}{" "}
                <span className="gradient-text drop-shadow-[0_0_30px_hsl(var(--primary)_/_0.3)]">{hero.title_highlight}</span>{" "}
                <br className="hidden sm:block" />
                {hero.title_line2}
              </motion.h1>

              <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2}
                className="mx-auto mt-6 max-w-lg text-base text-muted-foreground lg:mx-0 sm:text-lg leading-relaxed">
                {hero.subtitle}
              </motion.p>

              <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3}
                className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-6">
                {hero.trust_items.map((item, i) => {
                  const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-inner">
                        <Icon className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground/80">{item.label}</span>
                    </div>
                  );
                })}
              </motion.div>
            </div>

            <div className="w-full lg:max-w-xl flex-shrink-0">
              <HeroLoginForm onSwitchToRegister={() => setRegisterOpen(true)} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS BANNER ─── */}
      {stats_banner.visible && (
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionReveal} className="relative overflow-hidden py-16 bg-[#07080e]" style={stats_banner.text_color ? { color: stats_banner.text_color } : {}}>
          {/* Vertical grid lines background */}
          <div 
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(90deg, #ffffff 1px, transparent 1px)",
              backgroundSize: "60px 100%",
            }}
          />

          <div className="relative z-10 mx-auto max-w-5xl px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {stats_banner.stats.map((stat, i) => (
                <motion.div 
                  key={i} 
                  initial="hidden" 
                  whileInView="visible" 
                  viewport={{ once: true }} 
                  variants={fadeUp} 
                  custom={i}
                  className="group flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0c0d18]/90 px-6 py-8 shadow-2xl backdrop-blur-md transition-all duration-300 hover:border-primary/40 hover:bg-[#111322]"
                >
                  <div className="font-display text-3xl font-extrabold tracking-tight text-secondary sm:text-4xl lg:text-5xl drop-shadow-[0_0_20px_hsl(var(--secondary)_/_0.25)]">
                    {stat.value}
                  </div>
                  <p className="mt-2 text-xs sm:text-sm font-medium tracking-wide text-gray-400">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </motion.section>
      )}

      {/* ─── GAMES SECTION ─── */}
      {games_section.visible && (
        <motion.section id="games" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionReveal} className="relative section-padding overflow-hidden" style={{ ...(hasCustomBg(games_section) ? getSectionBgStyle(games_section) : {}), ...(games_section.text_color ? { color: games_section.text_color } : {}) }}>
          {games_section.background_type === "image" && games_section.background_image_url && (
            <div className="absolute inset-0">
              <img loading="lazy" decoding="async" src={games_section.background_image_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-background/80" />
            </div>
          )}

          {!hasCustomBg(games_section) && (
            <>
              <img loading="lazy" decoding="async" src={controllerDefault} alt="" className="absolute -left-10 top-20 w-32 opacity-[0.06] blur-[1px] pointer-events-none select-none hidden lg:block" />
              <img loading="lazy" decoding="async" src={coinsDefault} alt="" className="absolute -right-10 bottom-20 w-28 opacity-[0.06] blur-[1px] pointer-events-none select-none hidden lg:block" />
              <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-[120px]" />
              <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-secondary/5 rounded-full blur-[100px]" />
            </>
          )}

          <div className="relative z-10 mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} custom={0} className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/5 px-5 py-2 text-xs font-semibold text-foreground mb-5">
                <Gamepad2 className="h-3.5 w-3.5 text-secondary" /> Popular Games
              </span>
              <h2 className="font-display text-3xl font-bold tracking-wider sm:text-4xl lg:text-5xl gradient-text">{games_section.title}</h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground text-base">{games_section.subtitle}</p>
            </motion.div>

            <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
                    <div className="h-44 bg-muted" />
                    <div className="p-5 space-y-3">
                      <div className="h-5 w-2/3 rounded bg-muted" />
                      <div className="h-4 w-1/2 rounded bg-muted" />
                      <div className="h-10 w-full rounded-lg bg-muted mt-4" />
                    </div>
                  </div>
                ))
              ) : games.length > 0 ? (
                games.map((game, i) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    accessRequest={user && !authLoading ? (accessRequests[game.id] || null) : null}
                    index={i}
                    onRequestSent={fetchAccessRequests}
                    viewOnly={!user || authLoading}
                  />
                ))
              ) : (
                <div className="col-span-full text-center text-muted-foreground py-8">
                  <Gamepad2 className="mx-auto h-14 w-14 mb-4 opacity-20" />
                  <p className="text-sm">Games coming soon — stay tuned!</p>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      )}

      {/* ─── FUND TRANSFERS ─── */}
      {transfers_section.visible && (
        <motion.section id="transfers" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionReveal} className="relative overflow-hidden section-padding" style={transfers_section.text_color ? { color: transfers_section.text_color } : {}}>
          {hasCustomBg(transfers_section) ? (
            <SectionBg bg={transfers_section} overlayClass="bg-background/60" />
          ) : (
            <div className="absolute inset-0">
              <img loading="lazy" decoding="async" src={transfersBgDefault} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/90" />
              <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>
          )}
          <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-14 px-4 lg:flex-row lg:justify-between">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="max-w-lg text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-xs font-semibold text-foreground mb-5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {transfers_section.badge_text}
              </span>
              <h2 className="font-display text-3xl font-black tracking-wider sm:text-4xl lg:text-5xl text-foreground">
                {transfers_section.title_line1}{" "}
                <span className="gradient-text">{transfers_section.title_highlight}</span>
              </h2>
              <p className="mt-5 text-muted-foreground text-base leading-relaxed">{transfers_section.subtitle}</p>

              <div className="mt-7 flex flex-wrap gap-3 justify-center lg:justify-start">
                {transfers_section.actions.map((action) => (
                  <span key={action} className="rounded-full border border-border/60 glass-card px-5 py-2 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/30 transition-all duration-300 cursor-default">{action}</span>
                ))}
              </div>

              <button onClick={() => setRegisterOpen(true)}
                className="mt-10 btn-glow group inline-flex items-center gap-2 rounded-xl gradient-bg px-10 py-4 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 hover:shadow-primary/30 hover:opacity-90 transition-all duration-300">
                {transfers_section.cta_text}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>

            <motion.img initial={{ opacity: 0, x: 60 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              src={transfers_section.feature_image_url || fundCarDefault} alt="Instant transfers" className="w-72 lg:w-96 drop-shadow-2xl" />
          </div>
        </motion.section>
      )}

      {/* ─── FEATURES ─── */}
      {features_section.visible && (
        <motion.section id="features" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionReveal} className="relative section-padding overflow-hidden" style={{ ...(hasCustomBg(features_section) ? getSectionBgStyle(features_section) : {}), ...(features_section.text_color ? { color: features_section.text_color } : {}) }}>
          {features_section.background_type === "image" && features_section.background_image_url && (
            <div className="absolute inset-0">
              <img loading="lazy" decoding="async" src={features_section.background_image_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-background/80" />
            </div>
          )}

          {!hasCustomBg(features_section) && (
            <>
              <div className="absolute top-0 right-1/4 w-80 h-80 bg-secondary/4 rounded-full blur-[140px]" />
              <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-primary/4 rounded-full blur-[120px]" />
            </>
          )}

          <div className="relative z-10 mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-xs font-semibold text-foreground mb-5">
                <Star className="h-3.5 w-3.5 text-primary" /> Top Features
              </span>
              <h2 className="font-display text-3xl font-bold tracking-wider sm:text-4xl lg:text-5xl gradient-text">{features_section.title}</h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-base">{features_section.subtitle}</p>
            </motion.div>

            <div className="mt-16 grid gap-6 sm:grid-cols-2">
              {features_section.features.map((f, i) => {
                const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
                const defaultImg = DEFAULT_FEATURE_IMAGES[i % DEFAULT_FEATURE_IMAGES.length];
                return (
                  <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                    className="relative rounded-2xl glass-card p-7 overflow-hidden group transition-all duration-400">
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 rounded-2xl" />
                    <div className="relative">
                      <div className="shrink-0">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/15 group-hover:bg-primary/15 group-hover:border-primary/25 group-hover:shadow-lg group-hover:shadow-primary/10 transition-all duration-400">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-display text-sm font-bold tracking-wider">{f.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.section>
      )}

      {/* ─── TESTIMONIALS ─── */}
      {testimonials_section.visible && (
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionReveal} className="relative section-padding overflow-hidden" style={{ ...(hasCustomBg(testimonials_section) ? getSectionBgStyle(testimonials_section) : {}), ...(testimonials_section.text_color ? { color: testimonials_section.text_color } : {}) }}>
          {testimonials_section.background_type === "image" && testimonials_section.background_image_url && (
            <div className="absolute inset-0">
              <img loading="lazy" decoding="async" src={testimonials_section.background_image_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-background/80" />
            </div>
          )}

          {!hasCustomBg(testimonials_section) && (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-[180px]" />
            </>
          )}

          <div className="relative z-10 mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
              <span className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/5 px-5 py-2 text-xs font-semibold text-foreground mb-5">
                <Quote className="h-3.5 w-3.5 text-secondary" /> Player Reviews
              </span>
              <h2 className="font-display text-3xl font-bold tracking-wider sm:text-4xl lg:text-5xl gradient-text">{testimonials_section.title}</h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-base">{testimonials_section.subtitle}</p>
            </motion.div>

            <div className="grid gap-6 sm:grid-cols-3">
              {testimonials_section.testimonials.map((t, i) => (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                  className="rounded-2xl glass-card p-7 transition-all duration-400 group">
                  <div className="flex gap-1 mb-5">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-4 w-4 text-primary fill-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic leading-relaxed">"{t.quote}"</p>
                  <div className="mt-6 flex items-center gap-3 pt-5 border-t border-border/50">
                    {t.avatar_url ? (
                      <img loading="lazy" decoding="async" src={t.avatar_url} alt={t.name} className="h-11 w-11 rounded-full object-cover shadow-lg shadow-primary/20" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full gradient-bg text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20">
                        {t.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-semibold text-foreground">{t.name}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {testimonials_section.image_url && (
              <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-40 opacity-10 pointer-events-none select-none hidden xl:block">
                <img loading="lazy" decoding="async" src={testimonials_section.image_url} alt="" className="w-full" />
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* ─── FAQ SECTION ─── */}
      {faq_section.visible && faq_section.faqs.length > 0 && (
        <motion.section id="faq" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionReveal}
          className="relative section-padding overflow-hidden"
          style={{ ...(hasCustomBg(faq_section) ? getSectionBgStyle(faq_section) : {}), ...(faq_section.text_color ? { color: faq_section.text_color } : {}) }}
        >
          {faq_section.background_type === "image" && faq_section.background_image_url && (
            <div className="absolute inset-0">
              <img loading="lazy" decoding="async" src={faq_section.background_image_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-background/80" />
            </div>
          )}

          {!hasCustomBg(faq_section) && (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
              <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-primary/4 rounded-full blur-[140px]" />
            </>
          )}

          <div className="relative z-10 mx-auto max-w-3xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-xs font-semibold text-foreground mb-5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> FAQ
              </span>
              <h2 className="font-display text-3xl font-bold tracking-wider sm:text-4xl lg:text-5xl gradient-text">{faq_section.title}</h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-base">{faq_section.subtitle}</p>
            </motion.div>

            <div className="space-y-4">
              {faq_section.faqs.map((faq, i) => (
                <motion.details key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                  className="group rounded-2xl glass-card overflow-hidden transition-all duration-400"
                >
                  <summary className="flex cursor-pointer items-center justify-between px-7 py-6 text-sm font-semibold text-foreground select-none list-none [&::-webkit-details-marker]:hidden">
                    <span>{faq.question}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-open:rotate-90 shrink-0 ml-4" />
                  </summary>
                  <div className="px-7 pb-6 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-5">
                    {faq.answer}
                  </div>
                </motion.details>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* ─── BOTTOM CTA ─── */}
      {cta_section.visible && (
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={sectionReveal} className="relative overflow-hidden section-padding" style={cta_section.text_color ? { color: cta_section.text_color } : {}}>
          {/* Hero-style background */}
          <div className="absolute inset-0 bg-background">
            {hasCustomBg(cta_section) ? (
              <>
                {cta_section.background_type === "image" && cta_section.background_image_url && (
                  <>
                    <img loading="lazy" decoding="async" src={cta_section.background_image_url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-background/70" />
                  </>
                )}
                {(cta_section.background_type === "color" || cta_section.background_type === "gradient") && (
                  <div className="absolute inset-0" style={getSectionBgStyle(cta_section)} />
                )}
              </>
            ) : (
              <>
                <div className="absolute inset-0 opacity-40 animate-gradient-shift"
                  style={{
                    background: "radial-gradient(ellipse 80% 60% at 20% 40%, hsl(var(--primary) / 0.3), transparent), radial-gradient(ellipse 60% 80% at 80% 60%, hsl(var(--secondary) / 0.25), transparent), radial-gradient(ellipse 50% 50% at 50% 20%, hsl(var(--primary) / 0.15), transparent)",
                  }}
                />
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[150px] animate-glow-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-secondary/8 blur-[130px] animate-glow-pulse" style={{ animationDelay: "2s" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/3 blur-[200px]" />
              </>
            )}
          </div>

          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
              backgroundSize: "80px 80px",
            }}
          />

          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            {/* Logo instead of trophy */}
            <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mb-8">
              {settings.logo_url ? (
                <img loading="lazy" decoding="async" src={settings.logo_url} alt={settings.site_name} className="mx-auto h-20 max-w-[240px] object-contain drop-shadow-2xl" />
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl gradient-bg shadow-lg">
                  <Gamepad2 className="h-10 w-10 text-primary-foreground" />
                </div>
              )}
            </motion.div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/50">{cta_section.pre_title}</p>
            <h2 className="mt-3 font-display text-3xl font-black tracking-wider sm:text-4xl lg:text-5xl">{cta_section.title}</h2>
            <button onClick={() => setRegisterOpen(true)}
              className="mt-10 btn-glow group inline-flex items-center gap-3 rounded-xl gradient-bg px-14 py-5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 hover:opacity-90 transition-all duration-300">
              {cta_section.button_text}
              <Zap className="h-5 w-5 transition-transform group-hover:scale-110" />
            </button>
          </div>
        </motion.section>
      )}

      {/* ─── FOOTER ─── */}
      <motion.footer initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={sectionReveal} className="relative border-t border-border/30 py-16" style={{ ...(hasCustomBg(footer) ? getSectionBgStyle(footer) : { backgroundColor: "hsl(var(--card))" }), ...(footer.text_color ? { color: footer.text_color } : {}) }}>
        {footer.background_type === "image" && footer.background_image_url && (
          <div className="absolute inset-0">
            <img loading="lazy" decoding="async" src={footer.background_image_url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-background/80" />
          </div>
        )}

        {/* Payment Methods Logos — real configured payment gateways (Site Settings -> Payment
            Gateways) shown automatically, plus any admin-added extra logos (Landing Page editor
            copy explicitly promises this: "besides the ones from your payment gateways"). The
            gateway fetch used to be dead — fetched, stored, then never rendered anywhere. */}
        {(paymentGateways.filter(pg => pg.logo_url).length > 0 || (footer.extra_payment_methods || []).length > 0) && (
          <div className="relative z-10 mx-auto max-w-5xl px-4 mb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-muted-foreground/50 text-center mb-4">Accepted Payment Methods</p>
            <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3">
              {paymentGateways.filter(pg => pg.logo_url).map((pg) => (
                <div key={`gateway-${pg.id}`} className="flex items-center justify-center h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-muted/30 border border-border/20 transition-all duration-200 hover:border-primary/20 hover:bg-muted/50">
                  <img loading="lazy" decoding="async" src={pg.logo_url!} alt={pg.name} className="h-5 sm:h-6 max-w-[60px] sm:max-w-[72px] object-contain opacity-70 hover:opacity-100 transition-opacity" title={pg.name} />
                </div>
              ))}
              {(footer.extra_payment_methods || []).filter(pm => pm.logo_url).map((pm, i) => (
                <div key={`extra-${i}`} className="flex items-center justify-center h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-muted/30 border border-border/20 transition-all duration-200 hover:border-primary/20 hover:bg-muted/50">
                  <img loading="lazy" decoding="async" src={pm.logo_url} alt={pm.name} className="h-5 sm:h-6 max-w-[60px] sm:max-w-[72px] object-contain opacity-70 hover:opacity-100 transition-opacity" title={pm.name} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="relative z-10 mx-auto max-w-6xl px-4">
          {footer.show_games && games.length > 0 && (
            <div className="text-center">
              <h3 className="font-display text-xs font-bold uppercase tracking-[.3em] text-muted-foreground/60">Our Games</h3>
              <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
                {games.map((g) => (
                  <a key={g.id} href={g.download_url || "#"} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-300 cursor-pointer">{g.name}</a>
                ))}
              </div>
            </div>
          )}

          <div className={`flex flex-col items-center gap-5 border-t border-border/30 pt-10 sm:flex-row sm:justify-between ${footer.show_games && games.length > 0 ? 'mt-12' : ''}`}>
            <div className="flex items-center gap-2.5">
              {settings.logo_url ? (
                <img loading="lazy" decoding="async" src={settings.logo_url} alt={settings.site_name} className="h-10 max-w-[140px] object-contain" />
              ) : (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg shadow-lg shadow-primary/15">
                    <Gamepad2 className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="font-display text-sm font-bold tracking-wider gradient-text">
                    {settings.site_name || "Horizon Players"}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {footer.copyright_text || `© ${new Date().getFullYear()} ${settings.site_name || "HorizonPlayers"}. All rights reserved.`}
            </p>
          </div>
        </div>
      </motion.footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSwitchToRegister={() => { setLoginOpen(false); setRegisterOpen(true); }} />
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} onSwitchToLogin={() => { setRegisterOpen(false); setLoginOpen(true); }} />

      <QuickContactWidget />
    </div>
  );
};

export default Homepage;