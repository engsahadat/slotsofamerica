import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Gamepad2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import api from "@/services/api";

const AdminLogin = () => {
  const { settings } = useSiteSettings();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.role === "admin" || user.role === "manager") {
        navigate("/admin", { replace: true });
      }
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      if (res.data?.token && res.data?.user) {
        if (res.data.user.role !== "admin" && res.data.user.role !== "manager") {
          setError("This account does not have admin or manager privileges.");
          setLoading(false);
          return;
        }
        login(res.data.token, res.data.user);
        navigate("/admin", { replace: true });
      } else {
        setError("Invalid response from authentication server.");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.errors?.email?.[0] || "Invalid login credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-destructive/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-[hsl(30_80%_50%/0.05)] blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.site_name || "Horizon"} className="h-16 max-w-[200px] object-contain drop-shadow-lg" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-bg shadow-lg">
                <Gamepad2 className="h-8 w-8 text-primary-foreground" />
              </div>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-wider bg-gradient-to-r from-destructive to-[hsl(30_80%_50%)] bg-clip-text text-transparent">
            {settings.site_name || "HORIZON"}
          </h1>
          <p className="mt-1 text-sm tracking-widest text-muted-foreground">
            ADMIN PANEL
          </p>
        </div>

        <div className="rounded-2xl border border-destructive/20 bg-card p-8 shadow-xl shadow-destructive/5">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Admin Sign In
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Email or Username</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@horizon.gg"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-destructive to-[hsl(30_80%_50%)] py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
