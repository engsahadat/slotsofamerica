import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Gamepad2, Home, ArrowLeft } from "lucide-react";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";

const NotFound = () => {
  const location = useLocation();
  const { settings } = useSiteSettings();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Logo */}
      <div className="mb-10 flex items-center gap-3">
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt={settings.site_name}
            className="h-16 max-w-[200px] object-contain"
          />
        ) : (
          <>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-bg shadow-lg">
              <Gamepad2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-wider gradient-text">
              {settings.site_name || "HORIZON"}
            </h1>
          </>
        )}
      </div>

      {/* 404 Content */}
      <div className="relative text-center">
        {/* Big 404 */}
        <p className="font-display text-[9rem] font-black leading-none tracking-tight gradient-text opacity-20 select-none sm:text-[12rem]">
          404
        </p>

        <div className="-mt-8 space-y-3">
          <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Page Not Found
          </h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl gradient-bg px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
