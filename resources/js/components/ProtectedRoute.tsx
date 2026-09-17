import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "manager" | "user";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const role = user?.role;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // "admin" requiredRole allows both admin and manager
  if (requiredRole === "admin" && role !== "admin" && role !== "manager") {
    return <Navigate to="/home" replace />;
  }

  // Manager-only allowed pages
  if (requiredRole === "admin" && role === "manager") {
    const managerAllowedPrefixes = [
      "/admin",
      "/admin/dashboard",
      "/admin/users",
      "/admin/games",
      "/admin/game-access",
      "/admin/transactions",
      "/admin/password-requests",
      "/admin/payment-gateways",
      "/admin/withdraw-methods",
      "/admin/redeem-settings",
      "/admin/notifications",
      "/admin/export-requests",
      "/admin/rewards",
    ];
    const path = location.pathname.replace(/\/+$/, "") || "/admin";
    const allowed = managerAllowedPrefixes.some(
      (p) => path === p || path.startsWith(p + "/")
    );
    if (!allowed) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  if (requiredRole === "user" && role !== "user") {
    return <Navigate to={role === "admin" || role === "manager" ? "/admin" : "/home"} replace />;
  }

  return <>{children}</>;
}
