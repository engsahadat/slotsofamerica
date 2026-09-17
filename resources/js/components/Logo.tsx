import { Gamepad2 } from "lucide-react";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  const { settings } = useSiteSettings();

  if (settings.logo_url) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 select-none">
        <img
          src={settings.logo_url}
          alt={settings.site_name || "Horizon Players"}
          className={`shrink-0 object-contain ${collapsed ? "h-10 w-10" : "h-12 max-w-[180px]"}`}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 select-none">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-lg shadow-purple-500/20">
        <Gamepad2 className="h-5 w-5 text-white" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-xl font-black tracking-wider text-white">
            HORIZON
          </span>
          <span className="font-display text-[9.5px] font-extrabold tracking-[0.2em] text-[#a78bfa] mt-0.5">
            PLAYERS ROOM
          </span>
        </div>
      )}
    </div>
  );
}
