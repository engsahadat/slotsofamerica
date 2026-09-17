import { ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Bell, LogOut, ChevronLeft, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SidebarNav } from "@/components/SidebarNav";
import { ADMIN_NAV_ITEMS, MANAGER_NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNotificationBell } from "@/components/AdminNotificationBell";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, role } = useAuth();
  const isAdmin = location.pathname.startsWith("/admin");
  // avatar_url is already part of the authenticated user object from useAuth().
  const avatarUrl = user?.avatar_url || null;

  const navItems = role === "manager" ? MANAGER_NAV_ITEMS : ADMIN_NAV_ITEMS;

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Mobile: fixed full-height overlay. Desktop: sticky (not plain relative) so the
          // sidebar itself stays pinned to the viewport while the main content scrolls — with
          // relative it was a normal flex item that scrolled away with the page as soon as the
          // nav list (now 18+ items) or a tall page made the document taller than one screen.
          "fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:sticky lg:top-0",
          collapsed ? "w-[70px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <Logo collapsed={collapsed} />

        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          {isAdmin && (
            <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {!collapsed && "Admin Panel"}
            </p>
          )}
          <SidebarNav items={navItems} collapsed={collapsed} />
        </div>

        {/* User View link at bottom of sidebar */}
        <button
          onClick={() => { navigate("/home"); setMobileOpen(false); }}
          className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span>User View</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center border-t border-sidebar-border p-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => navigate("/home")}
            className="hidden lg:flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            User View
          </button>
          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <AdminNotificationBell />

            <div className="h-8 w-px bg-border" />

            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover border border-border" />
              ) : (
                <div className="h-8 w-8 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {(user?.email?.[0] ?? "U").toUpperCase()}{(user?.email?.[1] ?? "").toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-medium">{user?.email?.split("@")[0] ?? "User"}</p>
                <p className="text-xs text-muted-foreground capitalize">{role || "User"}</p>
              </div>
            </div>

            <button onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
