import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import api from "@/services/api";
import { getPreloadedSettings } from "@/lib/preloadSettings";
import type { LandingPageConfig } from "@/types/landing-page";

export interface SiteFonts {
  primary: string;
  secondary: string;
  button: string;
}

export interface SiteSettings {
  id: string;
  logo_url: string | null;
  favicon_url: string | null;
  site_name: string;
  colors: Record<string, string>;
  fonts: SiteFonts;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  header_scripts: string;
  body_scripts: string;
  footer_scripts: string;
  custom_css: string;
  nav_links: { label: string; href: string; visible: boolean }[];
  landing_page_config?: Partial<LandingPageConfig> | null;

  whatsapp_number?: string | null;
  telegram_link?: string | null;
  messenger_link?: string | null;

  // Contact widget config (Support Channels) — public-safe, no secrets here.
  // NOTE: provider API secrets (game agent / Orion Stars / FastAPI / River Pay / GHL) used
  // to be exposed on this same public endpoint and were removed — see SiteSetting::PUBLIC_FIELDS
  // on the backend. AdminSiteSettings.tsx now fetches those via the authenticated admin endpoint.
  contact_display_mode?: "icons_only" | "icons_with_text" | null;
  contact_button_label?: string | null;
  contact_header_title?: string | null;
  contact_widget_position?: string | null;
  contact_button_color?: string | null;
  contact_text_color?: string | null;
}

const DEFAULT_SETTINGS: SiteSettings = {
  id: "",
  logo_url: null,
  favicon_url: null,
  site_name: "Horizon Players",
  colors: {},
  fonts: { primary: "", secondary: "", button: "" },
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  header_scripts: "",
  body_scripts: "",
  footer_scripts: "",
  custom_css: "",
  nav_links: [],
};

interface SiteSettingsContextType {
  settings: SiteSettings;
  loading: boolean;
  refetch: () => Promise<void>;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  refetch: async () => {},
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const preloaded = getPreloadedSettings();
  const [settings, setSettings] = useState<SiteSettings>(() => {
    if (preloaded) {
      return {
        ...DEFAULT_SETTINGS,
        site_name: preloaded.site_name || DEFAULT_SETTINGS.site_name,
        logo_url: preloaded.logo_url ?? DEFAULT_SETTINGS.logo_url,
        favicon_url: preloaded.favicon_url ?? DEFAULT_SETTINGS.favicon_url,
        seo_title: preloaded.seo_title ?? DEFAULT_SETTINGS.seo_title,
        seo_description: preloaded.seo_description ?? DEFAULT_SETTINGS.seo_description,
      };
    }
    return DEFAULT_SETTINGS;
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const res = await api.get("/site-settings");
      const data = res.data?.settings;

      if (data) {
        setSettings({
          id: String(data.id),
          logo_url: data.logo_url,
          favicon_url: data.favicon_url,
          site_name: data.site_name || "Horizon Players",
          colors: (data.colors as Record<string, string>) || {},
          fonts: (data.fonts as unknown as SiteFonts) || { primary: "", secondary: "", button: "" },
          seo_title: data.seo_title,
          seo_description: data.seo_description,
          seo_keywords: data.seo_keywords,
          header_scripts: data.header_scripts || "",
          body_scripts: data.body_scripts || "",
          footer_scripts: data.footer_scripts || "",
          custom_css: data.custom_css || "",
          nav_links: (data.nav_links as any[]) || [],
          landing_page_config: (data.landing_page_config as Partial<LandingPageConfig>) ?? null,
          whatsapp_number: data.whatsapp_number ?? null,
          telegram_link: data.telegram_link ?? null,
          messenger_link: data.messenger_link ?? null,
          contact_display_mode: data.contact_display_mode ?? null,
          contact_button_label: data.contact_button_label ?? null,
          contact_header_title: data.contact_header_title ?? null,
          contact_widget_position: data.contact_widget_position ?? null,
          contact_button_color: data.contact_button_color ?? null,
          contact_text_color: data.contact_text_color ?? null,
        });
      }
    } catch (e) {
      console.warn("Failed to fetch site settings", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (Object.keys(settings.colors).length === 0) return;
    const root = document.documentElement;
    const c = settings.colors;

    const adjustLightness = (hsl: string, delta: number): string => {
      try {
        const parts = hsl.trim().split(/\s+/);
        const h = parts[0];
        const s = parts[1];
        const l = Math.max(0, Math.min(100, parseFloat(parts[2]) + delta));
        return `${h} ${s} ${Math.round(l)}%`;
      } catch { return hsl; }
    };

    const isLight = (hsl: string): boolean => {
      try { return parseFloat(hsl.trim().split(/\s+/)[2]) > 50; } catch { return false; }
    };

    Object.entries(c).forEach(([key, value]) => {
      if (value) root.style.setProperty(`--${key}`, value);
    });

    if (c.primary) {
      root.style.setProperty("--primary", c.primary);
      if (!c["primary-foreground"]) {
        root.style.setProperty("--primary-foreground", isLight(c.primary) ? "0 0% 10%" : "0 0% 100%");
      }
      root.style.setProperty("--ring", c.primary);
      root.style.setProperty("--sidebar-primary", c.primary);
      root.style.setProperty("--sidebar-ring", c.primary);
    }
    if (c["primary-foreground"]) {
      root.style.setProperty("--primary-foreground", c["primary-foreground"]);
    }
    if (c.secondary) {
      root.style.setProperty("--secondary", c.secondary);
      root.style.setProperty("--secondary-foreground", isLight(c.secondary) ? "0 0% 10%" : "0 0% 100%");
      root.style.setProperty("--accent", c.secondary);
      root.style.setProperty("--accent-foreground", isLight(c.secondary) ? "0 0% 10%" : "0 0% 100%");
    }
    if (c.background) {
      root.style.setProperty("--background", c.background);
      root.style.setProperty("--muted", adjustLightness(c.background, 8));
      root.style.setProperty("--border", adjustLightness(c.background, 12));
      root.style.setProperty("--input", adjustLightness(c.background, 12));
      root.style.setProperty("--sidebar-background", adjustLightness(c.background, 1));
      root.style.setProperty("--sidebar-border", adjustLightness(c.background, 9));
      root.style.setProperty("--sidebar-accent", adjustLightness(c.background, 8));
    }
    if (c.foreground) {
      root.style.setProperty("--foreground", c.foreground);
      root.style.setProperty("--muted-foreground", adjustLightness(c.foreground, isLight(c.foreground) ? -30 : 30));
      root.style.setProperty("--sidebar-foreground", adjustLightness(c.foreground, isLight(c.foreground) ? -5 : 5));
      root.style.setProperty("--sidebar-accent-foreground", c.foreground);
      root.style.setProperty("--sidebar-primary-foreground", isLight(c.foreground) ? "0 0% 100%" : "0 0% 100%");
    }
    if (c.card) {
      root.style.setProperty("--card", c.card);
      root.style.setProperty("--card-foreground", c.foreground || getComputedStyle(root).getPropertyValue("--foreground").trim());
      root.style.setProperty("--popover", c.card);
      root.style.setProperty("--popover-foreground", c.foreground || getComputedStyle(root).getPropertyValue("--foreground").trim());
    }

    return () => {
      const allKeys = [
        "primary", "primary-foreground", "ring", "sidebar-primary", "sidebar-ring",
        "secondary", "secondary-foreground", "accent", "accent-foreground",
        "background", "muted", "border", "input", "sidebar-background", "sidebar-border", "sidebar-accent",
        "foreground", "muted-foreground", "sidebar-foreground", "sidebar-accent-foreground", "sidebar-primary-foreground",
        "card", "card-foreground", "popover", "popover-foreground",
      ];
      allKeys.forEach((key) => root.style.removeProperty(`--${key}`));
    };
  }, [settings.colors]);

  useEffect(() => {
    const { primary, secondary, button } = settings.fonts;
    const fontsToLoad = [primary, secondary, button].filter(Boolean);
    
    const oldLink = document.getElementById("site-settings-fonts") as HTMLLinkElement | null;
    oldLink?.remove();

    if (fontsToLoad.length > 0) {
      const families = [...new Set(fontsToLoad)].map((f) => f.replace(/\s+/g, "+") + ":wght@300;400;500;600;700;800;900").join("&family=");
      const link = document.createElement("link");
      link.id = "site-settings-fonts";
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      document.head.appendChild(link);
    }

    const root = document.documentElement;
    if (primary) root.style.setProperty("--font-display", `'${primary}', sans-serif`);
    else root.style.removeProperty("--font-display");
    if (secondary) root.style.setProperty("--font-body", `'${secondary}', sans-serif`);
    else root.style.removeProperty("--font-body");
    if (button) root.style.setProperty("--font-button", `'${button}', sans-serif`);
    else root.style.removeProperty("--font-button");

    return () => {
      document.getElementById("site-settings-fonts")?.remove();
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
      root.style.removeProperty("--font-button");
    };
  }, [settings.fonts]);

  useEffect(() => {
    const id = "site-settings-custom-css";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = settings.custom_css;
    return () => {
      style?.remove();
    };
  }, [settings.custom_css]);

  useEffect(() => {
    if (settings.seo_title) document.title = settings.seo_title;
    const setMeta = (name: string, content: string | null) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };
    setMeta("description", settings.seo_description);
    setMeta("keywords", settings.seo_keywords);
  }, [settings.seo_title, settings.seo_description, settings.seo_keywords]);

  useEffect(() => {
    if (!settings.favicon_url) return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = settings.favicon_url;
  }, [settings.favicon_url]);

  useEffect(() => {
    const injectScripts = (html: string, container: HTMLElement, prefix: string) => {
      container.querySelectorAll(`[data-site-settings="${prefix}"]`).forEach((el) => el.remove());
      if (!html.trim()) return;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      Array.from(wrapper.children).forEach((child) => {
        const clone = child.cloneNode(true) as HTMLElement;
        clone.setAttribute("data-site-settings", prefix);
        if (clone.tagName === "SCRIPT") {
          const script = document.createElement("script");
          Array.from(clone.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
          script.textContent = clone.textContent;
          container.appendChild(script);
        } else {
          container.appendChild(clone);
        }
      });
    };

    injectScripts(settings.header_scripts, document.head, "header");
    injectScripts(settings.body_scripts, document.body, "body");
    injectScripts(settings.footer_scripts, document.body, "footer");

    return () => {
      document.head.querySelectorAll('[data-site-settings="header"]').forEach((el) => el.remove());
      document.body.querySelectorAll('[data-site-settings="body"]').forEach((el) => el.remove());
      document.body.querySelectorAll('[data-site-settings="footer"]').forEach((el) => el.remove());
    };
  }, [settings.header_scripts, settings.body_scripts, settings.footer_scripts]);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading, refetch: fetchSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
