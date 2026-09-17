import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, EyeOff, Eye, Gamepad2, Loader2, ArrowLeft, ShieldCheck, Lock, Headphones, AlertTriangle } from "lucide-react";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loginSchema, parseApiError } from "@/lib/validation";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSwitchToRegister?: () => void;
}

/** Map raw Supabase/auth errors to friendly messages */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials"))
    return "Incorrect email/username or password. Please try again.";
  if (lower.includes("email not confirmed"))
    return "Your email hasn't been verified yet. Check your inbox.";
  if (lower.includes("too many requests") || lower.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("user not found") || lower.includes("no account"))
    return "We couldn't find an account with that info.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "Connection issue. Please check your internet and retry.";
  return raw;
}

const TRUST_BADGES = [
  { icon: Lock, label: "SSL Secured" },
  { icon: ShieldCheck, label: "Account Protected" },
  { icon: Headphones, label: "Instant Support" },
];

const LoginModal = ({ open, onClose, onSwitchToRegister }: LoginModalProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { signIn, role, user } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const pendingRedirect = useRef(false);

  // Watch for role to be resolved after login, then redirect based on role
  useEffect(() => {
    if (pendingRedirect.current && user && role) {
      pendingRedirect.current = false;

      const name = user.name || user.username || user.email?.split("@")[0] || "Player";
      toast({
        title: `Welcome back, ${name} 👋`,
        description: "Your account is secure.",
      });

      // Brief fade-out effect before closing
      setLoginSuccess(true);
      setTimeout(() => {
        onClose();
        setLoginSuccess(false);
        setLoading(false);
        const target = role === "admin" || role === "manager" ? "/admin" : "/home";
        navigate(target);
      }, 400);
    }
  }, [role, user, navigate, onClose]);

  const handleCapsLock = (e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState("CapsLock"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email or username.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      pendingRedirect.current = true;
      const { error: authError } = await signIn(email.trim(), password);
      if (authError) {
        pendingRedirect.current = false;
        setError(friendlyError(parseApiError(authError)));
        setLoading(false);
        return;
      }
    } catch (err) {
      pendingRedirect.current = false;
      setError(friendlyError(parseApiError(err)));
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setError("");
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotSent(true);
      toast({ title: "Check your email", description: "If an account exists, a password reset link has been sent." });
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err?.message || "Something went wrong", variant: "destructive" });
    }
    setForgotLoading(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: loginSuccess ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: loginSuccess ? 0.35 : 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-sm"
          >
            {/* Logo topper */}
            <div className="flex justify-center -mb-7 relative z-10">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt={settings.site_name} className="h-11 max-w-[150px] object-contain drop-shadow-lg" />
              ) : (
                <div className="flex h-13 w-13 items-center justify-center rounded-full gradient-bg shadow-lg ring-4 ring-card">
                  <Gamepad2 className="h-6 w-6 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card pt-10 pb-6 px-6 shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.15)]">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-14 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              {forgotMode ? (
                /* ── Forgot Password View ── */
                <>
                  <button
                    onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to login
                  </button>

                   <h2 className="text-center font-display text-lg font-black tracking-wider">
                    RESET PASSWORD
                  </h2>
                  <p className="mt-1.5 text-center text-xs text-muted-foreground">
                    {forgotSent
                      ? "Check your email for a reset link."
                      : "Enter your email and we'll send you a link to reset your password."}
                  </p>

                  {error && (
                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {!forgotSent && (
                    <form onSubmit={handleForgotPassword} className="mt-4 space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Email</label>
                        <div className="relative">
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                          />
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full rounded-lg gradient-bg py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Send Reset Link
                      </button>
                    </form>
                  )}
                </>
              ) : (
                /* ── Login View ── */
                <>
                  <h2 className="text-center font-display text-lg font-black tracking-wider">
                    LOGIN TO PLAY NOW
                  </h2>
                  <p className="mt-1.5 text-center text-xs text-muted-foreground">
                    Win big with exciting sweepstakes, fish games &amp; slots online
                  </p>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Email or Username</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com or username"
                          className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                        <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={handleCapsLock}
                          onKeyUp={handleCapsLock}
                          placeholder="••••••••"
                          className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      {/* Caps Lock Warning */}
                      <AnimatePresence>
                        {capsLock && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-1.5 text-xs text-yellow-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Caps Lock is on
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input bg-muted/50 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground">Remember me</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => { setForgotMode(true); setError(""); setForgotSent(false); setForgotEmail(email.includes("@") ? email : ""); }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !email.trim() || !password}
                      className="w-full rounded-lg gradient-bg py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        "Login & Play"
                      )}
                    </button>
                  </form>

                  {/* Privacy reassurance */}
                  <p className="mt-2.5 text-center text-[10px] text-muted-foreground/70 leading-relaxed">
                    🔒 Your data is encrypted and never shared with third parties.
                  </p>

                  {/* Trust Badges */}
                  <div className="mt-4 flex items-center justify-center gap-4 border-t border-border pt-4">
                    {TRUST_BADGES.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      Don't have an account?{" "}
                      <button onClick={onSwitchToRegister} className="text-primary hover:underline font-medium">
                        Register Now
                      </button>
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoginModal;
