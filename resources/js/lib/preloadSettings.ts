export interface PreloadedSettings {
  site_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

const FALLBACK_TITLE = "Horizon Players";

let _preloaded: PreloadedSettings | null = null;
export function getPreloadedSettings() {
  return _preloaded;
}

function revealPage() {
  if (typeof document !== 'undefined') {
    document.body.classList.add("settings-loaded");
  }
}

export async function preloadSiteSettings(): Promise<PreloadedSettings | null> {
  try {
    const res = await fetch("/api/site-settings");
    if (!res.ok) {
      document.title = FALLBACK_TITLE;
      revealPage();
      return null;
    }

    const result = await res.json();
    const data = result.settings || result;

    if (!data) {
      document.title = FALLBACK_TITLE;
      revealPage();
      return null;
    }

    _preloaded = data as PreloadedSettings;

    // Apply title immediately
    document.title = data.seo_title || data.site_name || FALLBACK_TITLE;

    // Apply favicon immediately
    if (data.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        document.head.appendChild(link);
      }
      link.type = "image/png";
      link.href = data.favicon_url;
    }

    // Apply meta description
    if (data.seo_description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (meta) meta.content = data.seo_description;

      let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
      if (ogDesc) ogDesc.content = data.seo_description;
    }

    // Apply OG title
    const title = data.seo_title || data.site_name || FALLBACK_TITLE;
    let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    if (ogTitle) ogTitle.content = title;

    revealPage();
    return _preloaded;
  } catch (err) {
    console.warn("Failed to preload site settings:", err);
    document.title = FALLBACK_TITLE;
    revealPage();
    return null;
  }
}
