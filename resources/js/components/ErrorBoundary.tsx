import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Guards against an infinite reload loop if the "stale build" auto-reload below doesn't actually
// fix things (e.g. a real network outage) — cleared on every successful full page load, see main.tsx.
const CHUNK_RELOAD_KEY = "chunk-reload-attempted";

/** True for Vite's/browsers' various "the JS chunk this page wanted no longer exists" error
 * messages — happens after a deploy replaces `public/build`'s content-hashed filenames while a
 * user still has the old page open. A full reload re-fetches the current index.html and its
 * correct chunk URLs, which is the actual fix — no need to make the user click for it. */
function isStaleChunkError(error: Error | null): boolean {
  const msg = error?.message || "";
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /loading chunk [\w-]+ failed/i.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    if (isStaleChunkError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      if (isStaleChunkError(this.state.error)) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
            <div className="rounded-xl border border-border bg-card p-8 text-center max-w-md">
              <RefreshCw className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-lg font-display font-bold text-foreground mb-2">
                Updating…
              </h2>
              <p className="text-sm text-muted-foreground">
                This page was just updated. Reloading to get the latest version.
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
          <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center max-w-md">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-display font-bold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || "An unexpected error occurred. Please try refreshing the page."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="rounded-lg gradient-bg px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
