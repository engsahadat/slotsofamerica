import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Gamepad2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";

const Welcome = () => {
  const { settings } = useSiteSettings();
  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md text-center"
      >
        {/* Logo topper */}
        <div className="flex justify-center -mb-8 relative z-10">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.site_name} className="h-20 max-w-[220px] object-contain drop-shadow-lg" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-bg shadow-lg">
              <Gamepad2 className="h-10 w-10 text-primary-foreground" />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card pt-14 pb-10 px-8 shadow-2xl glow-card">
          {/* Success icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
          >
            <CheckCircle className="h-10 w-10 text-primary" />
          </motion.div>

          <h1 className="font-display text-2xl font-black tracking-wider gradient-text">
            WELCOME!
          </h1>
          <p className="mt-3 text-muted-foreground">
            Your account has been created successfully. You're all set to start playing!
          </p>

          <Link
            to="/home"
            className="mt-8 inline-flex items-center gap-2 rounded-xl gradient-bg px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>

          <p className="mt-6 text-xs text-muted-foreground">
            Explore games, join tournaments, and climb the leaderboard.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Welcome;
