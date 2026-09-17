export type UserRole = "ADMIN" | "MANAGER" | "USER";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
}

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles?: UserRole[];
}

export interface StatCard {
  title: string;
  value: string | number;
  change?: string;
  icon: string;
}
