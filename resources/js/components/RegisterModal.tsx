import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, EyeOff, Eye, Gamepad2, Loader2, User, CheckCircle2, AlertCircle } from "lucide-react";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { registerSchema, parseApiError } from "@/lib/validation";

interface RegisterModalProps {
  open: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

// Per-field validation helpers
function validateUsername(v: string) {
  if (!v) return null;
  if (v.length < 6) return "Must be at least 6 characters";
  if (v.length > 10) return "Cannot exceed 10 characters";
  if (!/^[a-zA-Z0-9]+$/.test(v)) return "Letters and numbers only";
  return "";
}
function validateEmail(v: string) {
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email";
  return "";
}
function validatePassword(v: string) {
  if (!v) return null;
  if (v.length < 8) return "Must be at least 8 characters";
  return "";
}
function validateConfirm(v: string, pw: string) {
  if (!v) return null;
  if (v !== pw) return "Passwords do not match";
  return "";
}

/** null = pristine, "" = valid, string = error */
type FieldStatus = string | null;

const FieldFeedback = ({ status }: { status: FieldStatus }) => {
  if (status === null) return null;
  if (status === "") {
    return (
      <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1 mt-1">
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        <span className="text-[10px] text-emerald-400">Looks good</span>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1 mt-1">
      <AlertCircle className="h-3 w-3 text-destructive" />
      <span className="text-[10px] text-destructive">{status}</span>
    </motion.div>
  );
};

function borderClass(status: FieldStatus) {
  if (status === null) return "border-input";
  if (status === "") return "border-emerald-500/60";
  return "border-destructive/60";
}

const RegisterModal = ({ open, onClose, onSwitchToLogin }: RegisterModalProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [ageConfirm, setAgeConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ username: false, email: false, password: false, confirm: false });
  const { signUp } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();

  const fieldStatus = useMemo(() => ({
    username: touched.username ? validateUsername(username) : null,
    email: touched.email ? validateEmail(email) : null,
    password: touched.password ? validatePassword(password) : null,
    confirm: touched.confirm ? validateConfirm(confirmPassword, password) : null,
  }), [username, email, password, confirmPassword, touched]);

  const isFormValid = useMemo(() => {
    return (
      validateUsername(username) === "" &&
      validateEmail(email) === "" &&
      validatePassword(password) === "" &&
      validateConfirm(confirmPassword, password) === "" &&
      acceptTerms &&
      ageConfirm
    );
  }, [username, email, password, confirmPassword, acceptTerms, ageConfirm]);

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((p) => ({ ...p, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all touched
    setTouched({ username: true, email: true, password: true, confirm: true });

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptTerms) {
      setError("Please accept the Terms and Conditions.");
      return;
    }
    if (!ageConfirm) {
      setError("You must be 21+ years old to register.");
      return;
    }

    const result = registerSchema.safeParse({ username, email, password });
    if (!result.success) {
      setError(result.error.errors[0]?.message || "Invalid input");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const { error: authError } = await signUp(result.data.email, result.data.password, result.data.username);
      if (authError) {
        setError(typeof authError === "string" ? authError : parseApiError(authError));
        setLoading(false);
        return;
      }
      onClose();
      navigate("/home");
    } catch (err) {
      setError(parseApiError(err));
    }
    setLoading(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-sm"
          >
            <div className="flex justify-center -mb-7 relative z-10">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt={settings.site_name} className="h-11 max-w-[150px] object-contain drop-shadow-lg" />
              ) : (
                <div className="flex h-13 w-13 items-center justify-center rounded-full gradient-bg shadow-lg ring-4 ring-card">
                  <Gamepad2 className="h-6 w-6 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card pt-10 pb-6 px-6 shadow-2xl max-h-[80vh] overflow-y-auto">
              <button
                onClick={onClose}
                className="absolute top-14 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <h2 className="text-center font-display text-lg font-black tracking-wider">
                REGISTER TO PLAY NOW
              </h2>

              {error && (
                <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                {/* Username */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                      onBlur={() => handleBlur("username")}
                      placeholder="Choose a username (6-10 characters)"
                      maxLength={10}
                      className={`w-full rounded-lg border ${borderClass(fieldStatus.username)} bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors`}
                    />
                    {fieldStatus.username === "" ? (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <FieldFeedback status={fieldStatus.username} />
                  {fieldStatus.username === null && (
                    <p className="text-[10px] text-muted-foreground">Letters and numbers only. Cannot be changed later.</p>
                  )}
                  {touched.username && username.length > 0 && (
                    <div className="w-full bg-muted/50 rounded-full h-1 mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${username.length >= 6 ? "bg-emerald-400" : "bg-primary/60"}`}
                        style={{ width: `${Math.min((username.length / 6) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">Email</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => handleBlur("email")}
                      placeholder="Your email address"
                      className={`w-full rounded-lg border ${borderClass(fieldStatus.email)} bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors`}
                    />
                    {fieldStatus.email === "" ? (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <FieldFeedback status={fieldStatus.email} />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => handleBlur("password")}
                      placeholder="Your password"
                      className={`w-full rounded-lg border ${borderClass(fieldStatus.password)} bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <FieldFeedback status={fieldStatus.password} />
                  {touched.password && password.length > 0 && (
                    <div className="w-full bg-muted/50 rounded-full h-1 mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${password.length >= 8 ? "bg-emerald-400" : password.length >= 4 ? "bg-amber-400" : "bg-destructive/70"}`}
                        style={{ width: `${Math.min((password.length / 8) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => handleBlur("confirm")}
                      placeholder="Confirm password"
                      className={`w-full rounded-lg border ${borderClass(fieldStatus.confirm)} bg-muted/50 px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors`}
                    />
                    {fieldStatus.confirm === "" ? (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirm ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <FieldFeedback status={fieldStatus.confirm} />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-input bg-muted/50 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      I accept the{" "}
                      <span className="text-primary hover:underline cursor-pointer">Terms and Conditions</span>
                      {" | "}
                      <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ageConfirm}
                      onChange={(e) => setAgeConfirm(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input bg-muted/50 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">I am 21+ years old</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !isFormValid}
                  className="w-full rounded-lg gradient-bg py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Register Now & Play
                </button>
              </form>

              <div className="mt-4 text-center space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  By clicking "Register Now", you agree to {settings.site_name || "Horizon Players"} Terms and Privacy Policy,
                  and consent to receive Emails and SMS for updates and marketing.
                </p>
                <p className="text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <button onClick={onSwitchToLogin} className="text-primary hover:underline font-medium">
                    Login
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RegisterModal;
