import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Unlock, Loader2, Gamepad2, Globe, Clock, CheckCircle, XCircle, Copy, Check, KeyRound } from "lucide-react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import PasswordChangeModal from "@/components/PasswordChangeModal";
import React from "react";

export interface GameAccessRequest {
  id: string;
  status: string;
  admin_note?: string | null;
  username?: string;
  game_password?: string | null;
  game_account_id?: string | null;
  web_login_url?: string | null;
}

interface GameCardProps {
  game: {
    id: string;
    name: string;
    image_url: string | null;
    download_url: string | null;
    web_url?: string | null;
    ios_url?: string | null;
    android_url?: string | null;
  };
  accessRequest: GameAccessRequest | null;
  index: number;
  onRequestSent: () => void;
  /** If true, hide request access / credentials (e.g. landing page for non-logged-in users) */
  viewOnly?: boolean;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const },
  }),
};

const AppleIcon = React.forwardRef<SVGSVGElement, { className?: string }>(({ className, ...props }, ref) => (
  <svg ref={ref} className={className} viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49 192.5-49 30.7 0 107.9 2.6 165.2 70.3zm-234.5-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
  </svg>
));
AppleIcon.displayName = "AppleIcon";

const GooglePlayIcon = React.forwardRef<SVGSVGElement, { className?: string }>(({ className, ...props }, ref) => (
  <svg ref={ref} className={className} viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l2.7 1.6 248-248v-5.8L47 0zm282.1 301.8l-83.6-83.6v-5.5l84-84 .7.4 99.1 56.3c28.2 16 28.2 42.2 0 58.2l-100.2 58.2zM44.3 484.7L291.6 237.4l60.7 60.7L104.8 511.5l-2.7 1.6c-13 6.8-28.5 5.4-57.8-28.4z" />
  </svg>
));
GooglePlayIcon.displayName = "GooglePlayIcon";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: `${label} Copied!`, description: `${label} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/40 border border-border px-3.5 py-2.5">
      <div className="flex-1 min-w-0 pr-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-xs font-mono font-bold text-foreground truncate mt-0.5">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending Approval",
    icon: Clock,
    badgeClass: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    dotClass: "bg-yellow-400",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle,
    badgeClass: "bg-green-500/10 border-green-500/20 text-green-400",
    dotClass: "bg-green-400 animate-pulse",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    badgeClass: "bg-destructive/10 border-destructive/20 text-destructive",
    dotClass: "bg-destructive",
  },
} as const;

export default function GameCard({ game, accessRequest, index, onRequestSent, viewOnly }: GameCardProps) {
  const [requesting, setRequesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [localReq, setLocalReq] = useState<GameAccessRequest | null>(accessRequest);
  const [showPwModal, setShowPwModal] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    setLocalReq(accessRequest);
  }, [accessRequest]);

  const currentReq = localReq;
  const status = currentReq?.status as keyof typeof STATUS_CONFIG | undefined;
  const statusCfg = status ? STATUS_CONFIG[status] : null;
  const isApproved = status === "approved";

  // Request Access / Register API handler
  const handleRequestAccess = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      // Call registration API. `username` is deliberately omitted — the backend now always
      // generates a game-specific username (e.g. "firekirin_user4821"), unrelated to the site
      // login username, instead of reusing whatever we'd send here.
      const res = await api.post(`/games/${game.id}/register`, {
        game_id: game.id,
        email: user?.email || "",
      });

      const data = res.data;
      const returnedReq = data?.request;
      const isReqApproved = data?.success || data?.status === "approved" || returnedReq?.status === "approved";

      const updatedRequest: GameAccessRequest = {
        id: returnedReq?.id || currentReq?.id || "gen-id",
        status: isReqApproved ? "approved" : returnedReq?.status || "pending",
        admin_note: returnedReq?.admin_note || null,
        username: data?.username || returnedReq?.username || user?.username,
        game_password: data?.password || data?.game_password || returnedReq?.game_password,
        game_account_id: returnedReq?.game_account_id || data?.game_account_id || null,
        web_login_url: returnedReq?.web_login_url || data?.web_login_url || game.web_url,
      };

      setLocalReq(updatedRequest);

      toast({
        title: isReqApproved ? "Access Granted!" : "Request Sent!",
        description: isReqApproved
          ? "Your game credentials are ready below."
          : "Your access request has been sent to support. You will be notified once approved.",
      });

      onRequestSent();
    } catch (err: any) {
      toast({
        title: "Registration Failed",
        description: err.response?.data?.message || err.message || "Failed to request access",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  // Play Online Login API handler
  const handlePlayOnline = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const res = await api.post(`/games/${game.id}/login`, {
        game_id: game.id,
        username: currentReq?.username,
        password: currentReq?.game_password,
      });

      const redirectUrl = res.data?.redirect_url || res.data?.url || currentReq?.web_login_url || game.web_url;

      if (redirectUrl) {
        if (currentReq?.username) {
          try {
            await navigator.clipboard.writeText(currentReq.username);
            toast({
              title: "Username Copied & Logging In!",
              description: `Redirecting to game login. Username (${currentReq.username}) copied!`,
            });
          } catch {
            // ignore clipboard failure
          }
        }
        window.open(redirectUrl, "_blank");
      } else {
        toast({
          title: "Error",
          description: "No web login URL returned from API.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      // Fallback to web_login_url or web_url if available
      const fallbackUrl = currentReq?.web_login_url || game.web_url;
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank");
      } else {
        toast({
          title: "Login Failed",
          description: err.response?.data?.message || err.message || "Failed to log in to game",
          variant: "destructive",
        });
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const hasPlatformLinks = game.ios_url || game.android_url;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      custom={index * 0.3}
      className="group rounded-2xl border border-border bg-card overflow-hidden glow-card hover:border-primary/40 transition-all duration-300 flex flex-col"
    >
      {/* Game Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="h-14 w-14 min-w-[3.5rem] overflow-hidden rounded-xl bg-muted/30 shadow-lg shadow-primary/10 transition-all duration-300">
          {game.image_url ? (
            <img src={game.image_url} alt={game.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-muted/50">
              <Gamepad2 className="h-6 w-6 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold tracking-wider text-foreground break-words line-clamp-2">{game.name}</p>
          {!viewOnly && statusCfg ? (
            <span className={`inline-flex items-center gap-1 mt-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
              {statusCfg.label}
            </span>
          ) : !viewOnly ? (
            <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-muted/50 border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Locked
            </span>
          ) : null}
        </div>
      </div>

      {/* Rejection reason */}
      {!viewOnly && status === "rejected" && currentReq?.admin_note && (
        <div className="mx-4 mb-3 rounded-xl bg-destructive/5 border border-destructive/20 p-3">
          <p className="text-[10px] text-destructive font-medium uppercase tracking-wider mb-1">Rejection Reason</p>
          <p className="text-xs text-muted-foreground">{currentReq.admin_note}</p>
        </div>
      )}

      {/* Pending message */}
      {!viewOnly && status === "pending" && (
        <div className="mx-4 mb-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-3">
          <p className="text-xs text-muted-foreground">Your request is being reviewed by our team. You'll be notified once approved.</p>
        </div>
      )}

      {/* Credentials Box — Show when Approved */}
      {!viewOnly && isApproved && (currentReq?.username || currentReq?.game_password) && (
        <div className="mx-4 mb-3 space-y-2">
          {currentReq.username && <CopyField label="Username" value={currentReq.username} />}
          {currentReq.game_password && <CopyField label="Password" value={currentReq.game_password} />}

          {/* Info message matching Reference 2 */}
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-[11px] text-primary font-medium flex items-center gap-2">
            <span>💡 Copy the Username & Password above, then paste them on the login page.</span>
          </div>

          {/* Request Password Reset Button */}
          <button
            onClick={() => setShowPwModal(true)}
            type="button"
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Request Password Reset
          </button>

          {currentReq.game_account_id && (
            <PasswordChangeModal
              open={showPwModal}
              onClose={() => setShowPwModal(false)}
              gameAccountId={currentReq.game_account_id}
              gameName={game.name}
            />
          )}
        </div>
      )}

      {/* Action Buttons Section */}
      <div className="px-4 pb-4 mt-auto space-y-2">
        {/* Request Access Button (Shown when Locked / Rejected) */}
        {!viewOnly && (!currentReq || status === "rejected" || (status !== "approved" && status !== "pending")) ? (
          <button
            onClick={handleRequestAccess}
            disabled={requesting}
            type="button"
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {requesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            {requesting ? "Requesting..." : status === "rejected" ? "Request Again" : "Request Access"}
          </button>
        ) : !viewOnly && status === "pending" ? (
          <button
            disabled
            type="button"
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs font-bold text-yellow-400 cursor-not-allowed opacity-70"
          >
            <Clock className="h-3.5 w-3.5" />
            Awaiting Approval
          </button>
        ) : null}

        {/* Play Online & Platform Buttons */}
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePlayOnline}
              disabled={loggingIn}
              type="button"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl gradient-bg px-3 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {loggingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {loggingIn ? "Logging in..." : "Play Online"}
            </button>

            {hasPlatformLinks && (
              <div className="flex gap-2">
                {game.ios_url ? (
                  <a
                    href={game.ios_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <AppleIcon className="h-3.5 w-3.5" /> iOS
                  </a>
                ) : null}
                {game.android_url ? (
                  <a
                    href={game.android_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <GooglePlayIcon className="h-3.5 w-3.5" /> Android
                  </a>
                ) : null}
              </div>
            )}
          </div>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
