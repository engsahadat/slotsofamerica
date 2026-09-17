import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadSiteSettings } from "./lib/preloadSettings";

// This page loaded successfully, so any previous "stale chunk, auto-reload once" guard
// (see ErrorBoundary.tsx) no longer applies — clear it so a future deploy can trigger the
// same self-healing reload again instead of silently giving up after the first one ever.
sessionStorage.removeItem("chunk-reload-attempted");

preloadSiteSettings().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
