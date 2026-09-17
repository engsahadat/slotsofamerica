import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Gamepad2,
  ShieldCheck,
  ShieldAlert,
  ArrowLeftRight,
  KeyRound,
  Wallet,
  Banknote,
  Coins,
  PanelTop,
  Mail,
  Bell,
  Settings,
  Gift,
  MessageCircle,
  FileDown,
  History,
  DatabaseBackup,
  Plug,
  Database,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/types";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  items: NavItem[];
  collapsed?: boolean;
}

// Explicit icon map — avoids `import { icons }` which pulls in the entire
// lucide-react icon library (~600KB) into the main bundle.
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Gamepad2,
  ShieldCheck,
  ShieldAlert,
  ArrowLeftRight,
  KeyRound,
  Wallet,
  Banknote,
  Coins,
  PanelTop,
  Mail,
  Bell,
  Settings,
  Gift,
  MessageCircle,
  FileDown,
  History,
  DatabaseBackup,
  Plug,
  Database,
};

export function SidebarNav({ items, collapsed = false }: SidebarNavProps) {
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const Icon = ICON_MAP[item.icon];
        const isActive = location.pathname === item.href;

        return (
          <RouterNavLink
            key={item.href}
            to={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "gradient-bg text-primary-foreground shadow-lg"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            {Icon && <Icon className="h-5 w-5 shrink-0" />}
            {!collapsed && <span>{item.title}</span>}
          </RouterNavLink>
        );
      })}
    </nav>
  );
}
