import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/services/api";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { Gamepad2, Eye, EyeOff, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!email || !token) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await api.post("/auth/reset-password", { email, token, password });
      setSuccess(true);
      toast({ title: "Password updated successfully!" });
      setTimeout(() => navigate("/"), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || "This password reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.site_name} className="mx-auto mb-4 h-16 max-w-[200px] object-contain" />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-bg shadow-lg">
              <Gamepad2 className="h-8 w-8 text-primary-foreground" />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 glow-card">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">Password Updated!</h2>
              <p className="text-muted-foreground text-sm">Your password has been changed successfully. Redirecting to homepage...</p>
            </div>
          ) : (
            <>
              <h1 className="mb-2 text-center text-xl font-bold">Set New Password</h1>
              <p className="mb-6 text-center text-sm text-muted-foreground">
                Enter your new password below
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-input bg-muted/50 px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-input bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg gradient-bg py-3.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Password
                </button>
              </form>

              <button
                onClick={() => navigate("/")}
                className="mt-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                <ArrowLeft className="h-4 w-4" /> Back to home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
