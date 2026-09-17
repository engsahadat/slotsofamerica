import type { NavItem } from "@/types";

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/admin", icon: "LayoutDashboard", roles: ["ADMIN"] },
  { title: "Users", href: "/admin/users", icon: "Users", roles: ["ADMIN"] },
  { title: "Games", href: "/admin/games", icon: "Gamepad2", roles: ["ADMIN"] },
  { title: "Game Access", href: "/admin/game-access", icon: "ShieldCheck", roles: ["ADMIN"] },
  { title: "Transactions", href: "/admin/transactions", icon: "ArrowLeftRight", roles: ["ADMIN"] },
  { title: "Password Requests", href: "/admin/password-requests", icon: "KeyRound", roles: ["ADMIN"] },
  { title: "Payment Gateways", href: "/admin/payment-gateways", icon: "Wallet", roles: ["ADMIN"] },
  { title: "Withdraw Methods", href: "/admin/withdraw-methods", icon: "Banknote", roles: ["ADMIN"] },
  { title: "Redeem Settings", href: "/admin/redeem-settings", icon: "Coins", roles: ["ADMIN"] },
  { title: "Landing Page", href: "/admin/landing-page", icon: "PanelTop", roles: ["ADMIN"] },
  { title: "Email Templates", href: "/admin/email-templates", icon: "Mail", roles: ["ADMIN"] },
  { title: "Notifications", href: "/admin/notifications", icon: "Bell", roles: ["ADMIN"] },
  { title: "Site Settings", href: "/admin/site-settings", icon: "Settings", roles: ["ADMIN"] },
  { title: "Rewards & Verification", href: "/admin/rewards", icon: "Gift", roles: ["ADMIN"] },
  { title: "Support Channels", href: "/admin/support-channels", icon: "MessageCircle", roles: ["ADMIN"] },
  { title: "Export & Settings", href: "/admin/export-requests", icon: "FileDown", roles: ["ADMIN"] },
  { title: "Activity Log", href: "/admin/activity-log", icon: "History", roles: ["ADMIN"] },
  { title: "Game API", href: "/admin/game-api-providers", icon: "Plug", roles: ["ADMIN"] },
  { title: "Backup & Recovery", href: "/admin/backups", icon: "DatabaseBackup", roles: ["ADMIN"] },
  { title: "RLS Diagnostics", href: "/admin/rls-diagnostics", icon: "Database", roles: ["ADMIN"] },
];

export const MANAGER_NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard", roles: ["MANAGER"] },
  { title: "Users", href: "/admin/users", icon: "Users", roles: ["MANAGER"] },
  { title: "Games", href: "/admin/games", icon: "Gamepad2", roles: ["MANAGER"] },
  { title: "Game Access", href: "/admin/game-access", icon: "ShieldCheck", roles: ["MANAGER"] },
  { title: "Transactions", href: "/admin/transactions", icon: "ArrowLeftRight", roles: ["MANAGER"] },
  { title: "Password Requests", href: "/admin/password-requests", icon: "KeyRound", roles: ["MANAGER"] },
  { title: "Payment Gateways", href: "/admin/payment-gateways", icon: "Wallet", roles: ["MANAGER"] },
  { title: "Withdraw Methods", href: "/admin/withdraw-methods", icon: "Banknote", roles: ["MANAGER"] },
  { title: "Redeem Settings", href: "/admin/redeem-settings", icon: "Coins", roles: ["MANAGER"] },
  { title: "Notifications", href: "/admin/notifications", icon: "Bell", roles: ["MANAGER"] },
  { title: "Phone Verification", href: "/admin/rewards", icon: "ShieldCheck", roles: ["MANAGER"] },
  { title: "Export & Settings", href: "/admin/export-requests", icon: "FileDown", roles: ["MANAGER"] },
];
