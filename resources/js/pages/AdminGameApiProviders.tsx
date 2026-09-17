import { useEffect, useMemo, useState } from "react";
import api from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, Plus, Play, RefreshCw, AlertTriangle, Trash2, CheckCircle2, XCircle, KeyRound, PauseCircle, ShieldAlert, Copy, Eye, Calendar as CalendarIcon, X, Download, Search, FlaskConical, ChevronDown, FileText, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ProviderHealth = {
  level: "connected" | "manual_mode" | "checking" | "unstable" | "needs_attention" | "missing_secret" | "untested";
  label: string;
  detail: string;
  totalCalls: number;
  failures: number;
  fallbacks: number;
  consecutiveFailures: number;
  lastError?: string;       // friendly, safe to show
  rawError?: string;        // raw provider/network text, hide behind disclosure
  lastCallAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastResponseTimeMs?: number;
};

// Convert scary low-level network/TLS text — or a real provider's own
// business-error text (wrong password, rate limit, unknown account, etc,
// which providers like gameroom777 return as HTTP 200 + a message rather
// than a proper 401/403) — into an admin-friendly sentence.
function friendlyErrorMessage(raw?: string | null): string {
  if (!raw) return "Connection test failed. The provider may be temporarily unavailable.";
  const msg = String(raw).toLowerCase();

  // --- Network / transport failures ---
  if (msg.includes("rustls") || msg.includes("close_notify") || msg.includes("unexpected eof") || msg.includes("peer closed") || msg.includes("connection closed")) {
    return "Provider did not respond — the connection was closed before completion.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Provider did not respond in time.";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo") || msg.includes("dns") || msg.includes("could not resolve")) {
    return "Provider host could not be resolved. Double-check the base URL.";
  }
  if (msg.includes("econnrefused") || msg.includes("connection refused")) {
    return "Provider refused the connection.";
  }
  if (msg.includes("econnreset")) {
    return "Provider reset the connection.";
  }
  if (msg.includes("tls") || msg.includes("ssl") || msg.includes("handshake") || msg.includes("certificate")) {
    return "Secure connection to the provider could not be established.";
  }

  // --- Credential / configuration problems ---
  if (msg.includes("agent password not set") || msg.includes("not set. add it")) {
    return "Agent password is not set for this provider.";
  }
  if (msg.includes("username or password error") || msg.includes("account or password")
    || (msg.includes("password") && msg.includes("error")) || msg.includes("invalid credentials") || msg.includes("incorrect password")) {
    return "Provider rejected the agent username or password. Update the password on this provider (Update password) and try again.";
  }
  if (msg.includes("account not exist") || msg.includes("account does not exist") || msg.includes("no such account")
    || msg.includes("user not found") || msg.includes("agent not found")) {
    return "Provider does not recognize this agent username. Confirm it with the provider.";
  }

  // --- Provider-side rate limiting / lockout ---
  if (msg.includes("too many login errors") || msg.includes("too many attempts") || msg.includes("try again in")
    || msg.includes("temporarily locked") || msg.includes("account locked") || msg.includes("rate limit")) {
    return "Provider is temporarily rate-limiting login attempts after repeated failures. Wait before retrying — retrying immediately will not help.";
  }

  // --- Player/account business errors ---
  if (msg.includes("already exist") || msg.includes("duplicate")) {
    return "Provider reports this player/account already exists.";
  }
  if (msg.includes("insufficient")) {
    return "Provider reports insufficient balance for this operation.";
  }

  // --- HTTP-status-driven failures ---
  if (msg.includes("401") || msg.includes("unauthorized")) {
    return "Provider rejected the credentials.";
  }
  if (msg.includes("403") || msg.includes("forbidden")) {
    return "Provider blocked the request. If the provider requires IP whitelisting, confirm the server IP is approved.";
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
    return "Provider is reporting an internal error.";
  }

  // --- Fallback: surface the provider's own message instead of a dead end ---
  // ExternalSignedProtocol formats errors as "<curated meaning> (code <N>)"
  // straight from the provider's own status code dictionary — already
  // admin-friendly, so use it directly.
  const codeMatch = String(raw).trim().match(/^(.+?)\s\(code\s\d+\)$/i);
  if (codeMatch) {
    return codeMatch[1].trim();
  }
  const inner = String(raw).match(/HTTP\s+\d+\s+([^.()]+)/i)?.[1]?.trim();
  if (inner && inner.length > 0 && inner.length < 120) {
    return `Provider says: "${inner}"`;
  }

  // Generic — never leak raw low-level text into the card
  return "Connection test failed. The provider may be temporarily unavailable or blocking requests.";
}

function isNetworkError(raw?: string | null): boolean {
  if (!raw) return false;
  const m = String(raw).toLowerCase();
  return /(rustls|tls|ssl|close_notify|unexpected eof|peer closed|connection closed|econnreset|timeout|timed out|enotfound|getaddrinfo|dns|econnrefused|connection refused|network|fetch failed)/.test(m);
}

function computeHealth(p: Provider, logs: ApiLog[]): ProviderHealth {
  if (!p.is_active) {
    return {
      level: "manual_mode",
      label: "Manual Mode Active",
      detail: "Provider automation is off — all requests stay in manual processing.",
      totalCalls: 0, failures: 0, fallbacks: 0, consecutiveFailures: 0,
    };
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = logs.filter(l => l.provider_name === p.name && new Date(l.created_at).getTime() >= cutoff);
  const total = recent.length;
  const failures = recent.filter(l => !l.success).length;
  const lastCallAt = recent[0]?.created_at;
  const lastSuccess = recent.find(l => l.success);
  const lastFailure = recent.find(l => !l.success);

  const secretMissing = recent.some(l => {
    const msg = (l.error_message || "") + " " + JSON.stringify(l.response_payload || {});
    return msg.includes("Agent password not set")
      || msg.includes(`Secret '${p.secret_name}' not set`)
      || msg.includes("not set. Add it in Cloud Settings");
  });
  if (secretMissing) {
    return {
      level: "missing_secret",
      label: "Needs Attention",
      detail: "Agent password is not set. Open the provider and set it.",
      totalCalls: total, failures, fallbacks: 0, consecutiveFailures: 0, lastCallAt,
    };
  }

  // Count consecutive failures from the newest log (treat fallback as a failure).
  let consecutive = 0;
  for (const l of recent) {
    const r = l.response_payload as any;
    const isFallback = r && typeof r === "object" && r.fallback === true;
    if (!l.success || isFallback) consecutive++;
    else break;
  }

  if (total === 0) {
    // No log within the last 24h — but the provider row itself carries a persisted
    // last-known result from further back (every check, including this "Test Connection"
    // button, updates it — see AdminGameApiProviderController::testConnection). Trust
    // that instead of flashing back to "never checked": a provider verified working days
    // ago is still "Connected", it just hasn't been re-checked recently, which is a very
    // different (and much less alarming) thing than "untested".
    if (p.last_health_status && p.last_health_checked_at) {
      const level = (["connected", "manual_mode", "missing_secret", "unstable", "needs_attention"] as const)
        .includes(p.last_health_status as any) ? (p.last_health_status as ProviderHealth["level"]) : "unstable";
      const checkedAt = new Date(p.last_health_checked_at).toLocaleString();
      const label = level === "connected" ? "Connected"
        : level === "manual_mode" ? "Manual Mode Active"
        : level === "missing_secret" ? "Needs Attention"
        : level === "needs_attention" ? "Needs Attention"
        : "Unstable";
      const detail = level === "connected"
        ? `Provider was responding normally as of the last check (${checkedAt}).`
        : `${p.last_health_message || "Last check did not succeed."} (checked ${checkedAt})`;

      return {
        level, label, detail,
        totalCalls: 0, failures: 0, fallbacks: 0, consecutiveFailures: p.consecutive_failures ?? 0,
        lastCallAt: p.last_health_checked_at,
        lastSuccessAt: p.last_success_at ?? undefined,
        lastFailureAt: p.last_failure_at ?? undefined,
        lastResponseTimeMs: p.last_health_latency_ms ?? undefined,
        lastError: level !== "connected" ? friendlyErrorMessage(p.last_error_summary || p.last_health_message) : undefined,
        rawError: level !== "connected" ? (p.last_error_summary ?? p.last_health_message ?? undefined) : undefined,
      };
    }

    return {
      level: "untested",
      label: "Checking",
      detail: "No recent checks. Run Test Connection to verify provider availability.",
      totalCalls: 0, failures: 0, fallbacks: 0, consecutiveFailures: 0,
    };
  }

  if (consecutive >= 3) {
    const raw = lastFailure?.error_message || "";
    return {
      level: "needs_attention",
      label: "Needs Attention",
      detail: "Provider connection could not be verified. Manual mode is still active.",
      totalCalls: total, failures, fallbacks: 0, consecutiveFailures: consecutive,
      lastError: friendlyErrorMessage(raw), rawError: raw || undefined,
      lastCallAt, lastSuccessAt: lastSuccess?.created_at, lastFailureAt: lastFailure?.created_at,
      lastResponseTimeMs: recent[0]?.duration_ms ?? undefined,
    };
  }
  if (consecutive >= 1) {
    const raw = lastFailure?.error_message || "";
    return {
      level: "unstable",
      label: "Unstable",
      detail: "A recent check did not succeed. Manual mode is still active.",
      totalCalls: total, failures, fallbacks: 0, consecutiveFailures: consecutive,
      lastError: friendlyErrorMessage(raw), rawError: raw || undefined,
      lastCallAt, lastSuccessAt: lastSuccess?.created_at, lastFailureAt: lastFailure?.created_at,
      lastResponseTimeMs: recent[0]?.duration_ms ?? undefined,
    };
  }
  return {
    level: "connected",
    label: "Connected",
    detail: `Provider is responding normally (${total - failures}/${total} successful in last 24h).`,
    totalCalls: total, failures: 0, fallbacks: 0, consecutiveFailures: 0,
    lastCallAt, lastSuccessAt: lastSuccess?.created_at,
    lastResponseTimeMs: recent[0]?.duration_ms ?? undefined,
  };
}

const HEALTH_STYLES: Record<ProviderHealth["level"], { className: string; Icon: typeof CheckCircle2 }> = {
  connected:       { className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  manual_mode:     { className: "bg-muted text-muted-foreground border-border", Icon: PauseCircle },
  missing_secret:  { className: "bg-amber-500/10 text-amber-400 border-amber-500/30", Icon: KeyRound },
  unstable:        { className: "bg-orange-500/10 text-orange-400 border-orange-500/30", Icon: ShieldAlert },
  needs_attention: { className: "bg-amber-500/10 text-amber-500 border-amber-500/40", Icon: AlertTriangle },
  checking:        { className: "bg-muted/50 text-muted-foreground border-border", Icon: Loader2 },
  untested:        { className: "bg-muted/50 text-muted-foreground border-border", Icon: AlertTriangle },
};

function HealthBadge({ health }: { health: ProviderHealth }) {
  const { className, Icon } = HEALTH_STYLES[health.level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`} title={health.detail}>
      <Icon className={`h-3 w-3 ${health.level === "checking" ? "animate-spin" : ""}`} />
      {health.label}
    </span>
  );
}

interface Provider {
  id: number;
  name: string;
  /** 'agent_login' = username+password → bearer token (e.g. gameroom777).
   *  'external_signed' = agent_id+timestamp+secret_key HMAC signing, no
   *  login step (e.g. gamevault999; see API-Documentation.pdf).
   *  'orion_stars_signed' = Orion Stars OS Terminal API v1.2 — agentLogin
   *  returns a rotating agentKey, then md5(agentName+time+agentKey) signs
   *  every subsequent call.
   *  'fast_api_signed' = FastAPI's two-tier model — agent account+password
   *  logs in for a per-session appid+appsecret, which then signs every call.
   *  'river_pay_simple' = plain login+password query params, no signing;
   *  createAccount mints its own opaque "code" identifier. */
  protocol?: "agent_login" | "external_signed" | "orion_stars_signed" | "fast_api_signed" | "river_pay_simple";
  display_name: string;
  base_url: string;
  agent_username: string;
  secret_name: string | null;
  is_active: boolean;
  automate_create_account: boolean;
  automate_deposit: boolean;
  automate_withdraw: boolean;
  notes: string | null;
  request_content_type: string;
  request_method?: string;
  custom_headers?: any;
  proxy_url?: string | null;
  requires_ip_whitelist?: boolean;
  health_check_path: string;
  whitelist_ip_note: string | null;
  docs_url: string | null;
  created_at: string;
  updated_at?: string;
  last_health_status?: string | null;
  last_health_message?: string | null;
  last_health_latency_ms?: number | null;
  last_health_checked_at?: string | null;
  consecutive_failures?: number | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error_code?: string | null;
  last_error_summary?: string | null;
  has_password?: boolean;
}

interface Game { id: number; name: string }
interface Assignment { id: number; game_id: number; provider_id: number }

interface ApiLog {
  id: number;
  provider_name: string | null;
  action: string;
  endpoint: string | null;
  http_status: number | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  request_payload: unknown;
  response_payload: unknown;
}

interface E2eStep {
  step: string;
  success: boolean;
  message: string;
  latency_ms?: number | null;
}
interface E2eResult {
  success: boolean;
  overall_status?: "passed" | "account_creation_working" | "login_blocked" | "failed" | "skipped";
  message: string;
  username?: string | null;
  password?: string | null;
  player_id?: string | number | null;
  balance?: number | null;
  steps: E2eStep[];
  ran_at: string;
}


const EMPTY_PROVIDER = {
  name: "", protocol: "agent_login" as "agent_login" | "external_signed" | "orion_stars_signed" | "fast_api_signed" | "river_pay_simple", display_name: "", base_url: "", agent_username: "",
  secret_name: "", is_active: false,
  automate_create_account: false, automate_deposit: false, automate_withdraw: false, notes: "",
  request_content_type: "multipart/form-data",
  request_method: "POST",
  custom_headers_text: "",
  proxy_url: "",
  requires_ip_whitelist: false,
  health_check_path: "/api/agent/login",
  whitelist_ip_note: "",
  docs_url: "",
};

export default function AdminGameApiProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_PROVIDER });
  const [confirmAutomation, setConfirmAutomation] = useState<{ provider: Provider; field: keyof Provider } | null>(null);
  const [automationConfirmText, setAutomationConfirmText] = useState("");
  useEffect(() => { setAutomationConfirmText(""); }, [confirmAutomation?.provider.id, confirmAutomation?.field]);
  const [safeTestProvider, setSafeTestProvider] = useState<Provider | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [healthCheckingId, setHealthCheckingId] = useState<number | null>(null);
  const [e2eRunningId, setE2eRunningId] = useState<number | null>(null);
  const [e2eResults, setE2eResults] = useState<Record<number, E2eResult>>({});
  const [drawerLog, setDrawerLog] = useState<ApiLog | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => { setShowRaw(false); }, [drawerLog?.id]);

  // Result of the last "Try Alternative Formats" run, keyed by provider id.
  interface FormatProbe { fmt: string; ok: boolean; message?: string; latency?: number | null; rawError?: string | null; httpStatus?: number | null }
  interface FormatTestResult {
    provider: Provider;
    probes: FormatProbe[];
    winner: string | null;
    proxyUsed: boolean;
    finishedAt: string;
    allTlsClosed: boolean;
  }
  const [formatTestResult, setFormatTestResult] = useState<FormatTestResult | null>(null);

  // Admin-managed provider passwords (stored in DB, not Cloud Secrets)
  const [passwordSet, setPasswordSet] = useState<Record<number, boolean>>({});
  const [pwDialogProvider, setPwDialogProvider] = useState<Provider | null>(null);
  const [pwDialogValue, setPwDialogValue] = useState("");
  const [pwDialogSaving, setPwDialogSaving] = useState(false);

  async function saveProviderPassword() {
    if (!pwDialogProvider) return;
    // Trim — a pasted password with a stray leading/trailing space or
    // newline is indistinguishable from "wrong password" once it reaches
    // the provider, and is a common source of confusing test failures.
    const v = pwDialogValue.trim();
    if (!v || v.length < 1) { toast.error("Password cannot be empty"); return; }
    setPwDialogSaving(true);
    try {
      await api.post(`/admin/game-api-providers/${pwDialogProvider.id}/password`, { password: v });
      toast.success("Agent password saved");
      setPasswordSet(prev => ({ ...prev, [pwDialogProvider.id]: true }));
      setPwDialogValue("");
      setPwDialogProvider(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setPwDialogSaving(false);
    }
  }


  // Replay presets (saved client-side)
  type ReplayPreset = {
    id: string;
    name: string;
    savedAt: string;
    provider_name: string | null;
    action: string;
    endpoint: string | null;
    request_payload: unknown;
    response_payload: unknown;
    curl: string;
  };
  const PRESETS_KEY = "game_api_replay_presets_v1";
  const [presets, setPresets] = useState<ReplayPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); } catch { return []; }
  });
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  function persistPresets(next: ReplayPreset[]) {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch { /* ignore quota */ }
  }
  function saveCurrentPreset() {
    if (!drawerLog) return;
    const name = presetName.trim() || `${drawerLog.action} · ${new Date().toLocaleString()}`;
    const preset: ReplayPreset = {
      id: crypto.randomUUID(),
      name,
      savedAt: new Date().toISOString(),
      provider_name: drawerLog.provider_name,
      action: drawerLog.action,
      endpoint: drawerLog.endpoint,
      request_payload: drawerLog.request_payload,
      response_payload: drawerLog.response_payload,
      curl: buildReplaySnippet(drawerLog),
    };
    persistPresets([preset, ...presets].slice(0, 50));
    toast.success("Preset saved");
    setPresetName("");
    setSavingPreset(false);
  }
  function deletePreset(id: string) {
    persistPresets(presets.filter(p => p.id !== id));
  }
  function exportPreset(p: ReplayPreset) {
    const text = JSON.stringify(p, null, 2);
    navigator.clipboard.writeText(text).then(
      () => toast.success("Preset JSON copied"),
      () => toast.error("Copy failed"),
    );
  }
  const [logsModalProvider, setLogsModalProvider] = useState<Provider | null>(null);
  const [providerLogs, setProviderLogs] = useState<ApiLog[]>([]);
  const [providerLogsLoading, setProviderLogsLoading] = useState(false);
  const [providerLogsLoadingMore, setProviderLogsLoadingMore] = useState(false);
  const [providerLogsHasMore, setProviderLogsHasMore] = useState(false);
  const [providerLogsSearch, setProviderLogsSearch] = useState("");
  const [providerLogsLevels, setProviderLogsLevels] = useState<Set<string>>(new Set());
  const [providerLogsAction, setProviderLogsAction] = useState<string>("all");
  const [providerLogsRange, setProviderLogsRange] = useState<string>("all");

  // Logs filters
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<Date | undefined>(undefined);
  const [filterTo, setFilterTo] = useState<Date | undefined>(undefined);
  const [filterSearch, setFilterSearch] = useState<string>("");

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => l.action && set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return logs.filter(l => {
      if (filterProvider !== "all" && l.provider_name !== filterProvider) return false;
      if (filterAction !== "all" && l.action !== filterAction) return false;
      if (filterStatus === "success" && !l.success) return false;
      if (filterStatus === "error" && l.success) return false;
      if (filterFrom) {
        const d = new Date(l.created_at);
        const from = new Date(filterFrom); from.setHours(0, 0, 0, 0);
        if (d < from) return false;
      }
      if (filterTo) {
        const d = new Date(l.created_at);
        const to = new Date(filterTo); to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      if (q) {
        const hay = [
          l.endpoint || "",
          l.action || "",
          l.error_message || "",
          l.provider_name || "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, filterProvider, filterAction, filterStatus, filterFrom, filterTo, filterSearch]);

  const filtersActive = filterProvider !== "all" || filterAction !== "all" || filterStatus !== "all" || !!filterFrom || !!filterTo || filterSearch.trim() !== "";
  function clearFilters() {
    setFilterProvider("all"); setFilterAction("all"); setFilterStatus("all");
    setFilterFrom(undefined); setFilterTo(undefined);
    setFilterSearch("");
  }

  const PROVIDER_LOGS_PAGE_SIZE = 50;

  async function openProviderLogs(p: Provider) {
    setLogsModalProvider(p);
    setProviderLogsLoading(true);
    setProviderLogs([]);
    setProviderLogsHasMore(false);
    try {
      const res = await api.get(`/admin/game-api-providers/${p.id}/logs`);
      const rows = (res.data?.logs || []) as ApiLog[];
      setProviderLogs(rows);
      setProviderLogsHasMore(!!res.data?.has_more);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setProviderLogsLoading(false);
    }
  }

  async function loadMoreProviderLogs() {
    if (!logsModalProvider || providerLogsLoadingMore || !providerLogsHasMore) return;
    setProviderLogsLoadingMore(true);
    const oldest = providerLogs[providerLogs.length - 1]?.created_at;
    try {
      const res = await api.get(`/admin/game-api-providers/${logsModalProvider.id}/logs`, {
        params: oldest ? { before: oldest } : {},
      });
      const rows = (res.data?.logs || []) as ApiLog[];
      setProviderLogs(prev => [...prev, ...rows]);
      setProviderLogsHasMore(!!res.data?.has_more);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setProviderLogsLoadingMore(false);
    }
  }

  function classifyLog(l: ApiLog): { level: "ok" | "fail" | "fallback" | "missing_secret"; tag?: string } {
    const msg = (l.error_message || "") + " " + JSON.stringify(l.response_payload || {});
    if (msg.includes("Agent password not set") || (msg.includes("not set") && msg.includes("Cloud Settings"))) {
      return { level: "missing_secret", tag: "Password missing" };
    }
    const r = l.response_payload as any;
    if (r && typeof r === "object" && r.fallback === true) return { level: "fallback", tag: "Fallback" };
    if (!l.success) return { level: "fail", tag: "Failed" };
    return { level: "ok" };
  }


  function copyText(value: unknown, label: string) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  // Manual override state
  const [overrideRequestId, setOverrideRequestId] = useState("");
  const [overrideAction, setOverrideAction] = useState<"create" | "sync">("create");
  const [overrideRunning, setOverrideRunning] = useState(false);
  const [overrideResult, setOverrideResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  async function runManualOverride() {
    const id = overrideRequestId.trim();
    if (!id) { toast.error("Enter an unlock request ID"); return; }
    setOverrideRunning(true);
    setOverrideResult(null);
    try {
      const res = await api.post("/admin/game-api-providers/override", { request_id: id, action: overrideAction });
      const data = res.data;
      setOverrideResult({
        success: !!data?.success,
        message: data?.message || (data?.success ? (overrideAction === "create" ? "Account created" : "Sync complete") : "Failed"),
        details: data,
      });
      if (data?.success) {
        if (overrideAction === "create") toast.success(`Account ready: ${data.username} / ${data.password}`);
        else toast.success("Player synced");
      } else {
        toast.error(data?.message || (overrideAction === "create" ? "Create failed" : "Sync failed"));
      }
      loadAll();
    } catch (err: any) {
      const message = err.response?.data?.message || err.message;
      setOverrideResult({ success: false, message });
      toast.error(message);
    } finally {
      setOverrideRunning(false);
    }
  }


  async function loadAll() {
    setLoading(true);
    try {
      const res = await api.get("/admin/game-api-providers");
      const p = (res.data?.providers || []) as Provider[];
      setProviders(p);
      setGames(res.data?.games || []);
      setAssignments(res.data?.assignments || []);
      setLogs(res.data?.logs || []);
      setPasswordSet(Object.fromEntries(p.map(pr => [pr.id, !!pr.has_password])));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function saveProvider() {
    if (!draft.name || !draft.base_url || !draft.agent_username) {
      toast.error("Name, base URL and agent username are required"); return;
    }
    if (draft.name.includes(" ")) {
      toast.error("Internal name cannot contain spaces"); return;
    }
    if (!/^https?:\/\/.+/i.test(draft.base_url.trim())) {
      toast.error("Base URL must start with http:// or https://"); return;
    }

    // Parse custom_headers_text into JSON
    let customHeaders: Record<string, string> = {};
    if (draft.custom_headers_text && draft.custom_headers_text.trim()) {
      try {
        const parsed = JSON.parse(draft.custom_headers_text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          customHeaders = parsed;
        } else {
          toast.error("Custom headers must be a JSON object"); return;
        }
      } catch {
        toast.error("Custom headers is not valid JSON"); return;
      }
    }

    const { custom_headers_text: _omit, ...rest } = draft as any;
    const payload = { ...rest, custom_headers: customHeaders };

    try {
      if (creating) {
        await api.post("/admin/game-api-providers", payload);
        toast.success("Provider created");
      } else if (editing) {
        await api.put(`/admin/game-api-providers/${editing.id}`, payload);
        toast.success("Provider updated");
      }
      setCreating(false); setEditing(null); setDraft({ ...EMPTY_PROVIDER });
      loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  }

  async function toggleField(p: Provider, field: keyof Provider, value: boolean) {
    const moneyField = field === "automate_deposit" || field === "automate_withdraw";
    if (moneyField && value) { setConfirmAutomation({ provider: p, field }); return; }
    await applyToggle(p, field, value);
  }

  async function applyToggle(p: Provider, field: keyof Provider, value: boolean) {
    try {
      await api.post(`/admin/game-api-providers/${p.id}/toggle`, { field, value });
      toast.success("Updated"); loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  }

  async function deleteProvider(p: Provider) {
    if (!confirm(`Delete provider '${p.name}'? This will also remove its game assignments.`)) return;
    try {
      await api.delete(`/admin/game-api-providers/${p.id}`);
      toast.success("Deleted"); loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  }

  async function setGameProvider(gameId: number, providerId: number | null) {
    try {
      await api.post("/admin/game-provider-assignments", { game_id: gameId, provider_id: providerId });
      toast.success("Assignment saved"); loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  }

  async function invokeProviderTest(p: Provider): Promise<{ data: any; error: any }> {
    // Must comfortably exceed the backend's own worst case: HealthChecker retries
    // agent_login-style providers up to twice at Http::timeout(15) each (~30s+ with the
    // between-attempt pause), and even a single-call protocol (external_signed, Orion
    // Stars, ...) can take close to its own 15s budget before the response even starts
    // travelling back. A client timeout shorter than that doesn't protect anything — it
    // just abandons a check that was about to succeed and reports a false "timed out",
    // while the real result still lands moments later on the next page load.
    const timeoutMs = 35000;
    return await Promise.race([
      api.post(`/admin/game-api-providers/${p.id}/test`).then(r => ({ data: r.data, error: null })).catch(e => ({ data: null, error: { message: e.response?.data?.message || e.message } })),
      new Promise<{ data: any; error: any }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "Connection timed out after 35s" } }), timeoutMs)
      ),
    ]);
  }

  async function testConnection(p: Provider) {
    setTestingId(p.id);
    try {
      let attempt = await invokeProviderTest(p);
      const failMsg = attempt.error?.message || attempt.data?.message || "";
      // Retry once — only for transient network/TLS errors. Never retry credential or business errors.
      if (!attempt.data?.success && isNetworkError(failMsg)) {
        attempt = await invokeProviderTest(p);
      }
      const { data, error } = attempt;
      // Refresh logs so the badge reflects the new test result.
      try {
        const freshLogs = await api.get("/admin/game-api-providers");
        if (freshLogs.data?.logs) setLogs(freshLogs.data.logs as ApiLog[]);
      } catch { /* ignore */ }

      if (data?.success) {
        toast.success("Provider connection verified successfully.");
      } else {
        toast.error("Connection could not be verified. Manual mode remains active.");
        // surface friendly hint as a separate description-style toast
        const raw = error?.message || data?.message;
        if (raw) toast.message(friendlyErrorMessage(raw));
      }
    } finally { setTestingId(null); }
  }


  async function runHealthCheck(p: Provider) {
    setHealthCheckingId(p.id);
    try {
      const res = await api.post(`/admin/game-api-providers/${p.id}/health`).catch(e => ({ data: null, error: e })) as any;
      const data = res?.data;
      const error = res?.error;
      // Refresh providers + logs so persisted status + new log row show immediately.
      const fresh = await api.get("/admin/game-api-providers");
      if (fresh.data?.providers) setProviders(fresh.data.providers as Provider[]);
      if (fresh.data?.logs) setLogs(fresh.data.logs as ApiLog[]);

      if (error) toast.error(error.response?.data?.message || error.message);
      else if (data?.success) toast.success(`Healthy — ${data.results?.[0]?.latency_ms ?? 0}ms`);
      else toast.error(data?.results?.[0]?.message || "Health check failed");
    } finally { setHealthCheckingId(null); }
  }

  async function tryAlternativeFormats(p: Provider) {
    setTestingId(p.id);
    const formats = ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"] as const;
    const probes: FormatProbe[] = [];
    let winner: string | null = null;
    const proxyUsed = !!(p.proxy_url && p.proxy_url.trim());
    try {
      // Test all three formats so admins get a complete checklist, but save the first that succeeds.
      for (const fmt of formats) {
        const res = await api.post(`/admin/game-api-providers/${p.id}/health`, {
          content_type_override: fmt, dry_run: true,
        }).catch(e => ({ data: null, error: e }));
        const data = (res as any).data;
        const error = (res as any).error;
        const r = data?.results?.[0];
        const ok = !!r?.success;
        probes.push({
          fmt,
          ok,
          message: r?.message ?? error?.response?.data?.message ?? error?.message ?? "No response",
          latency: r?.latency_ms ?? null,
          httpStatus: (r as any)?.http_status ?? null,
        });
        if (ok && !winner) winner = fmt;
      }

      const allTlsClosed =
        probes.every((x) => !x.ok) &&
        probes.some((x) => /closed the connection|closed before|tls|peer closed|unexpected eof|close_notify/i.test(x.message ?? ""));

      setFormatTestResult({
        provider: p,
        probes,
        winner,
        proxyUsed,
        finishedAt: new Date().toISOString(),
        allTlsClosed,
      });

      if (winner) {
        await api.put(`/admin/game-api-providers/${p.id}`, { request_content_type: winner });
        toast.success(`Working format: ${winner}. Saved as default.`);
        await runHealthCheck(p);
      } else {
        // All formats failed — keep manual fallback, keep automation off, mark provider as needing attention.
        await api.put(`/admin/game-api-providers/${p.id}`, {
          automate_create_account: false,
          automate_deposit: false,
          automate_withdraw: false,
          last_health_status: "needs_attention",
          last_health_message: "All request formats failed. Provider-side configuration required.",
        });
        // Refresh providers so the UI reflects disabled automation + status.
        const fresh = await api.get("/admin/game-api-providers");
        if (fresh.data?.providers) setProviders(fresh.data.providers as Provider[]);
        toast.error("All request formats failed. Manual fallback remains active.");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      setTestingId(null);
    }
  }

  async function runE2eTest(p: Provider) {
    setE2eRunningId(p.id);
    try {
      const res = await api.post(`/admin/game-api-providers/${p.id}/e2e-test`);
      const data = res.data;
      const result: E2eResult = {
        success: !!data?.success,
        overall_status: data?.overall_status ?? (data?.success ? "passed" : "failed"),
        message: data?.message || "",
        username: data?.username ?? null,
        password: data?.password ?? null,
        player_id: data?.player_id ?? null,
        balance: data?.balance ?? null,
        steps: Array.isArray(data?.steps) ? data.steps : [],
        ran_at: data?.ran_at || new Date().toISOString(),
      };
      setE2eResults((prev) => ({ ...prev, [p.id]: result }));
      const fresh = await api.get("/admin/game-api-providers");
      if (fresh.data?.logs) setLogs(fresh.data.logs as ApiLog[]);
      if (result.overall_status === "passed") toast.success(`E2E passed — ${result.username}`);
      else if (result.overall_status === "account_creation_working")
        toast.info("Account creation works — health check needs review. Manual fallback stays active.");
      else if (result.overall_status === "login_blocked")
        toast.warning("Login endpoint inconclusive. Do not mark provider as down — confirm login URL/format with provider.");
      else toast.error(result.message || "E2E test failed");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally { setE2eRunningId(null); }
  }



  const healthByProvider = providers.map(p => ({ provider: p, health: computeHealth(p, logs) }));
  const issues = healthByProvider.filter(h => h.health.level === "needs_attention" || h.health.level === "missing_secret");

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Game Panel API</h1>
        <p className="text-muted-foreground">Configure provider integrations. Manual flow remains the default fallback.</p>
      </div>

      {issues.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="font-semibold text-amber-400">{issues.length} provider{issues.length > 1 ? "s" : ""} need attention</div>
              <ul className="space-y-1 text-sm">
                {issues.map(({ provider, health }) => (
                  <li key={provider.id} className="flex items-center gap-2">
                    <HealthBadge health={health} />
                    <span className="font-medium">{provider.display_name}</span>
                    <span className="text-muted-foreground">— {health.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="triage" className="gap-2">
            Needs Attention
            {(() => {
              const n = healthByProvider.filter(h => ["needs_attention", "missing_secret", "unstable"].includes(h.health.level)).length;
              return n > 0 ? (
                <span className="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-5 px-1.5">{n}</span>
              ) : null;
            })()}
          </TabsTrigger>
          <TabsTrigger value="assignments">Game Assignments</TabsTrigger>
          <TabsTrigger value="override">Manual Override</TabsTrigger>
          <TabsTrigger value="logs">API Logs</TabsTrigger>
          <TabsTrigger value="setup">Setup Checklist</TabsTrigger>
        </TabsList>

        {/* PROVIDERS */}
        <TabsContent value="providers" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setCreating(true); setEditing(null); setDraft({ ...EMPTY_PROVIDER }); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Provider
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
          ) : providers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No providers yet. Add your first gaming panel provider to get started.
            </CardContent></Card>
          ) : providers.map((p) => {
            const health = computeHealth(p, logs);
            return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      {p.display_name}
                      <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {p.protocol === "external_signed" ? "External Signed"
                          : p.protocol === "orion_stars_signed" ? "Orion Stars"
                          : p.protocol === "fast_api_signed" ? "Fast API"
                          : p.protocol === "river_pay_simple" ? "River Pay"
                          : "Agent Login"}
                      </Badge>
                      <HealthBadge health={health} />
                    </CardTitle>
                    <CardDescription>{p.name} — {p.base_url}</CardDescription>
                    <p className="text-xs text-muted-foreground mt-1">{health.detail}</p>

                    {/* Connection summary block */}
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Last checked: </span>
                        <span className="font-medium">
                          {p.last_health_checked_at ? new Date(p.last_health_checked_at).toLocaleString() : (health.lastCallAt ? new Date(health.lastCallAt).toLocaleString() : "Never")}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last successful: </span>
                        <span className="font-medium">{health.lastSuccessAt ? new Date(health.lastSuccessAt).toLocaleString() : "—"}</span>
                      </div>
                      {typeof health.lastResponseTimeMs === "number" && (
                        <div>
                          <span className="text-muted-foreground">Last response time: </span>
                          <span className="font-medium">{health.lastResponseTimeMs}ms</span>
                        </div>
                      )}
                      {health.consecutiveFailures > 0 && (
                        <div>
                          <span className="text-muted-foreground">Consecutive failed checks: </span>
                          <span className="font-medium text-amber-500">{health.consecutiveFailures}</span>
                        </div>
                      )}
                    </div>

                    {/* Manual fallback reassurance */}
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 px-2 py-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span><b>Manual fallback: Active</b> — if the API is unavailable, requests stay pending for manual processing.</span>
                    </div>

                    {/* Friendly error + technical details disclosure */}
                    {(health.level === "unstable" || health.level === "needs_attention") && (
                      <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs space-y-1">
                        <div className="text-amber-400">
                          {health.lastError || "Connection test failed. The provider may be temporarily unavailable or blocking requests."}
                        </div>
                        <div className="text-muted-foreground">
                          If this continues failing, confirm the provider API URL, request format, and whitelist the server IP.
                        </div>
                        {(health.rawError || p.last_health_message) && (
                          <details className="mt-1.5 group">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1 select-none">
                              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                              View Technical Details
                            </summary>
                            <div className="mt-2 space-y-1 text-[11px] font-mono text-muted-foreground break-all">
                              {p.last_health_status && <div>status: {p.last_health_status}</div>}
                              {typeof p.last_health_latency_ms === "number" && <div>response_time_ms: {p.last_health_latency_ms}</div>}
                              {health.consecutiveFailures > 0 && <div>retry_count: {health.consecutiveFailures}</div>}
                              {(health.rawError || p.last_health_message) && (
                                <div className="whitespace-pre-wrap">raw: {health.rawError || p.last_health_message}</div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => testConnection(p)} disabled={testingId === p.id}>
                      {testingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      <span className="ml-1">{testingId === p.id ? "Testing…" : "Test Connection"}</span>
                    </Button>
                    {!["external_signed", "orion_stars_signed", "fast_api_signed", "river_pay_simple"].includes(p.protocol ?? "agent_login") && (
                      <Button variant="outline" size="sm" onClick={() => tryAlternativeFormats(p)} disabled={testingId === p.id || !p.is_active}>
                        <FlaskConical className="h-4 w-4" />
                        <span className="ml-1">Try Alternative Formats</span>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setSafeTestProvider(p)} disabled={e2eRunningId === p.id || !p.is_active}>
                      {e2eRunningId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      <span className="ml-1">{e2eRunningId === p.id ? "Running…" : "Run Safe Test"}</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditing(p); setCreating(false); setDraft({
                      name: p.name, protocol: p.protocol ?? "agent_login", display_name: p.display_name, base_url: p.base_url,
                      agent_username: p.agent_username, secret_name: p.secret_name ?? "", is_active: p.is_active,
                      automate_create_account: p.automate_create_account, automate_deposit: p.automate_deposit,
                      automate_withdraw: p.automate_withdraw, notes: p.notes ?? "",
                      request_content_type: p.request_content_type ?? "multipart/form-data",
                      request_method: (p as any).request_method ?? "POST",
                      custom_headers_text: (() => { try { const ch = (p as any).custom_headers; return ch && Object.keys(ch).length ? JSON.stringify(ch, null, 2) : ""; } catch { return ""; } })(),
                      proxy_url: (p as any).proxy_url ?? "",
                      requires_ip_whitelist: !!(p as any).requires_ip_whitelist,
                      health_check_path: p.health_check_path ?? "/api/agent/login",
                      whitelist_ip_note: p.whitelist_ip_note ?? "",
                      docs_url: p.docs_url ?? "",
                    }); }}>Edit Provider</Button>
                    <Button variant="outline" size="sm" onClick={() => openProviderLogs(p)}>
                      <Eye className="h-4 w-4" /><span className="ml-1">View Logs</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteProvider(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Agent username:</span> <code>{p.agent_username}</code></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Agent password:</span>
                    {passwordSet[p.id] ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Stored</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-400 border-amber-500/40">Not set</Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setPwDialogProvider(p); setPwDialogValue(""); }}>
                      <KeyRound className="h-3.5 w-3.5" />
                      <span className="ml-1">{passwordSet[p.id] ? "Update password" : "Set agent password"}</span>
                    </Button>
                  </div>
                  {p.secret_name && (
                    <div className="text-xs text-muted-foreground">Legacy env-var fallback: <code>{p.secret_name}</code></div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ToggleRow label="Active (allow API calls)" checked={p.is_active} onChange={(v) => toggleField(p, "is_active", v)} />
                  <ToggleRow label="Auto-create accounts" checked={p.automate_create_account} onChange={(v) => toggleField(p, "automate_create_account", v)} />
                  <ToggleRow label="Auto-process deposits 💰" checked={p.automate_deposit} warning hint="Enable only after live provider testing. This can affect real balances." onChange={(v) => toggleField(p, "automate_deposit", v)} />
                  <ToggleRow label="Auto-process withdrawals 💰" checked={p.automate_withdraw} warning hint="Enable only after live provider testing. This can affect real balances." onChange={(v) => toggleField(p, "automate_withdraw", v)} />
                  <div className="flex items-center justify-between p-2 rounded border opacity-60">
                    <span className="text-sm">Auto password reset</span>
                    <Badge variant="outline">Not supported by API</Badge>
                  </div>
                </div>

                {e2eResults[p.id] && (() => {
                  const r = e2eResults[p.id];
                  const os = r.overall_status ?? (r.success ? "passed" : "failed");
                  const palette =
                    os === "passed" ? { border: "border-emerald-500/40 bg-emerald-500/5", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, headline: "E2E passed" } :
                    os === "account_creation_working" ? { border: "border-amber-500/40 bg-amber-500/5", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, headline: "Account creation working — health check needs review" } :
                    os === "login_blocked" ? { border: "border-amber-500/40 bg-amber-500/5", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, headline: "Login endpoint inconclusive — provider may still be usable" } :
                    { border: "border-destructive/40 bg-destructive/5", icon: <XCircle className="h-4 w-4 text-destructive" />, headline: "E2E failed" };
                  return (
                  <div className={`rounded-md border p-3 space-y-2 ${palette.border}`}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {palette.icon}
                      <span>{palette.headline}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        · {new Date(r.ran_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.message}</p>
                    {(os === "login_blocked" || os === "account_creation_working") && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Manual fallback remains active. Do not mark this provider as fully down.
                      </p>
                    )}
                    {r.username && (
                      <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-1">
                        <div><span className="text-muted-foreground">Test username: </span><code>{r.username}</code></div>
                        {r.player_id !== null && r.player_id !== undefined && (
                          <div><span className="text-muted-foreground">Player ID: </span><code>{String(r.player_id)}</code></div>
                        )}
                        {r.password && (
                          <div><span className="text-muted-foreground">Password: </span><code>{r.password}</code></div>
                        )}
                        {r.balance !== null && r.balance !== undefined && (
                          <div><span className="text-muted-foreground">Balance: </span><code>{r.balance}</code></div>
                        )}
                      </div>
                    )}
                    <ul className="space-y-1 text-xs">
                      {r.steps.map((s, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          {s.success
                            ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                            : <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />}
                          <span className="flex-1">
                            <span className="font-medium">{s.step}</span>
                            <span className="text-muted-foreground"> — {s.message}</span>
                            {typeof s.latency_ms === "number" && (
                              <span className="text-muted-foreground"> ({s.latency_ms}ms)</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>

        {/* TRIAGE — Needs Attention */}
        <TabsContent value="triage" className="space-y-4 mt-4">
          {(() => {
            const triageLevels = ["unstable", "needs_attention", "missing_secret"] as const;
            const issues = healthByProvider.filter(h => triageLevels.includes(h.health.level as any));
            if (loading) {
              return <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>;
            }
            if (issues.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                    <div className="font-semibold">All providers healthy</div>
                    <p className="text-sm text-muted-foreground">No unstable connections or missing credentials in the last 24h.</p>
                  </CardContent>
                </Card>
              );
            }
            return (
              <>
                <p className="text-sm text-muted-foreground">
                  {issues.length} provider{issues.length > 1 ? "s" : ""} need attention. Manual fallback remains active for all of them.
                </p>
                {issues.map(({ provider: p, health }) => {
                  const recent = logs.filter(l => l.provider_name === p.name).slice(0, 5);
                  const actionHint =
                    health.level === "missing_secret" ? `Open the provider and click "Set agent password", then re-test.` :
                    health.level === "unstable" ? "One recent check did not succeed. Re-test to confirm." :
                    "Multiple connection attempts failed. Verify credentials and base URL, then re-test.";
                  return (
                    <Card key={p.id} className="border-l-4" style={{ borderLeftColor: health.level === "needs_attention" ? "rgb(245 158 11)" : health.level === "missing_secret" ? "rgb(251 191 36)" : "rgb(251 146 60)" }}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <CardTitle className="flex items-center gap-2 flex-wrap">
                              {p.display_name}
                              <HealthBadge health={health} />
                            </CardTitle>
                            <CardDescription>{p.name}</CardDescription>
                            <p className="text-xs text-muted-foreground mt-1">{health.detail}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => testConnection(p)} disabled={testingId === p.id}>
                            {testingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            <span className="ml-1">Re-test</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-md bg-muted/40 border p-3 text-sm">
                          <div className="font-semibold mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Recommended action</div>
                          <p className="text-muted-foreground">{actionHint}</p>
                        </div>
                        {recent.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Recent calls</div>
                            <div className="space-y-1">
                              {recent.map(l => (
                                <div key={l.id} className="flex items-center justify-between text-xs gap-2 p-2 rounded border">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {l.success ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                                    <code className="truncate">{l.action}</code>
                                  </div>
                                  <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            );
          })()}
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Game → Provider</CardTitle>
              <CardDescription>Each game can use one provider. Games without a provider stay 100% manual.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>Provider</TableHead></TableRow></TableHeader>
                <TableBody>
                  {games.map((g) => {
                    const a = assignments.find((x) => x.game_id === g.id);
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>
                          <Select value={a?.provider_id ? String(a.provider_id) : "none"} onValueChange={(v) => setGameProvider(g.id, v === "none" ? null : Number(v))}>
                            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Manual only —</SelectItem>
                              {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.display_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MANUAL OVERRIDE */}
        <TabsContent value="override" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                Manual Override
              </CardTitle>
              <CardDescription>
                Re-run an API action for a specific game unlock request. Useful when an automatic call
                failed and fell back to manual, or when you want to refresh a player's panel state.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="override-id">Game unlock request ID</Label>
                <Input
                  id="override-id"
                  placeholder="e.g. 42"
                  value={overrideRequestId}
                  onChange={(e) => setOverrideRequestId(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Find IDs on /admin/game-access (copy from the row).
                </p>
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={overrideAction} onValueChange={(v) => setOverrideAction(v as "create" | "sync")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Re-run account creation</SelectItem>
                    <SelectItem value="sync">Re-sync account from provider</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {overrideAction === "create"
                    ? "Re-runs auto account creation. Safe to retry: if the player already exists the provider will return an error and the manual flow stays untouched."
                    : "Fetches live balance/state for the player from the provider."}
                </p>
              </div>

              <Button onClick={runManualOverride} disabled={overrideRunning || !overrideRequestId.trim()}>
                {overrideRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run override
              </Button>

              {overrideResult && (
                <div className={`rounded-lg border p-3 text-sm ${
                  overrideResult.success
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}>
                  <div className="font-semibold mb-1">{overrideResult.success ? "Success" : "Failed"}</div>
                  <div>{overrideResult.message}</div>
                  {overrideResult.details && (
                    <pre className="text-xs mt-2 bg-background/50 p-2 rounded overflow-auto max-h-48">
                      {JSON.stringify(overrideResult.details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent API Calls</CardTitle>
                <CardDescription>
                  Last 100 entries. Passwords and tokens are stripped.
                  {filtersActive && <> · Showing <span className="font-semibold text-foreground">{filteredLogs.length}</span> of {logs.length}</>}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportLogs(filteredLogs, filtersActive)}
                  disabled={filteredLogs.length === 0}
                  title={filteredLogs.length === 0 ? "No logs to export" : `Export ${filteredLogs.length} log(s) as JSON`}
                >
                  <Download className="h-4 w-4 mr-1" /> JSON ({filteredLogs.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportLogsCsv(filteredLogs.map(l => ({ ...l, request_payload: redactPayload(l.request_payload), response_payload: redactPayload(l.response_payload) })), "filtered")}
                  disabled={filteredLogs.length === 0}
                  title={filteredLogs.length === 0 ? "No logs to export" : `Download ${filteredLogs.length} log(s) as CSV (sanitized)`}
                >
                  <FileText className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Search endpoint, action, or error text…"
                  className="pl-8 pr-8"
                />
                {filterSearch && (
                  <button
                    type="button"
                    onClick={() => setFilterSearch("")}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Provider</Label>
                  <Select value={filterProvider} onValueChange={setFilterProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All providers</SelectItem>
                      {providers.map(p => <SelectItem key={p.id} value={p.name}>{p.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Action</Label>
                  <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      {actionOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filterFrom && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filterFrom ? format(filterFrom, "PP") : "Any"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={filterFrom} onSelect={setFilterFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filterTo && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filterTo ? format(filterTo, "PP") : "Any"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={filterTo} onSelect={setFilterTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {filtersActive && (
                <div className="mb-3">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5 mr-1" /> Clear filters
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead><TableHead>Provider</TableHead><TableHead>Action</TableHead>
                    <TableHead>Status</TableHead><TableHead>Latency</TableHead><TableHead>Error</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{logs.length === 0 ? "No API calls yet" : "No logs match the filters"}</TableCell></TableRow>}
                  {filteredLogs.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell>{l.provider_name}</TableCell>
                      <TableCell><code className="text-xs">{l.action}</code></TableCell>
                      <TableCell><Badge variant={l.success ? "default" : "destructive"}>{l.http_status ?? "—"}</Badge></TableCell>
                      <TableCell>{l.duration_ms ?? "—"}ms</TableCell>
                      <TableCell className="text-xs text-destructive truncate max-w-xs">{l.error_message}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setDrawerLog(l)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETUP CHECKLIST */}
        <TabsContent value="setup" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider Setup</CardTitle>
              <CardDescription>
                Set each provider's agent password from this page, run the connection test, then activate. Steps are marked complete automatically based on stored credentials and recent logs.
              </CardDescription>
            </CardHeader>

          </Card>

          <BulkSecretNameCard
            providers={providers}
            onApplied={loadAll}
          />

          <SecretNamesQuickRef providers={providers} />

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
          ) : providers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No providers yet. Add one from the Providers tab first.
            </CardContent></Card>
          ) : providers.map((p) => {
            const health = computeHealth(p, logs);
            const recent = logs.filter(l => l.provider_name === p.name);
            // Latest test_connection log (logs are ordered DESC by created_at)
            const lastTest = recent.find(l => l.action === "test");

            // Classify the latest test against the *current* secret_name
            const lastTestMsg = lastTest
              ? ((lastTest.error_message || "") + " " + JSON.stringify(lastTest.response_payload || {}))
              : "";
            const lastTestMissingSecret = !!lastTest && (
              lastTestMsg.includes("Agent password not set") ||
              (p.secret_name && lastTestMsg.includes(`Secret '${p.secret_name}' not set`)) ||
              lastTestMsg.includes("not set. Add it in Cloud Settings")
            );

            // Stale = test was run before the provider's current config was saved
            const providerUpdatedAt = p.updated_at ? new Date(p.updated_at).getTime() : 0;
            const lastTestAt = lastTest ? new Date(lastTest.created_at).getTime() : 0;
            const lastTestStale = !!lastTest && providerUpdatedAt > lastTestAt;

            // Step 1: agent password stored in DB (admin-managed)
            const step1Done = !!passwordSet[p.id];
            // Step 2: latest test ran *after* config and didn't report missing password
            const step2Done = step1Done && !!lastTest && !lastTestStale && !lastTestMissingSecret && !!lastTest.success;
            // Step 3: provider toggled active
            const step3Done = p.is_active;

            const lastTestRel = lastTest ? new Date(lastTest.created_at).toLocaleString() : null;
            const lastTestStatusText = lastTest
              ? (lastTest.success
                  ? `OK (${lastTest.duration_ms ?? "?"}ms) · ${lastTestRel}`
                  : `${lastTestMissingSecret ? "Missing secret" : (lastTest.error_message || "failed")} · ${lastTestRel}`)
              : "Never tested";

            const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) => (
              <div className="flex gap-3 items-start p-3 rounded-md border bg-card/40">
                <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-muted text-muted-foreground border border-border"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{title}</div>
                  {!done && children}
                </div>
              </div>
            );

            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        {p.display_name}
                        <HealthBadge health={health} />
                      </CardTitle>
                      <CardDescription>{p.name} — {p.base_url || "no base URL"}</CardDescription>
                      <div className="text-xs text-muted-foreground mt-1">
                        Latest test: <span className={lastTest?.success && !lastTestStale ? "text-emerald-400" : lastTestMissingSecret ? "text-amber-400" : !lastTest ? "" : "text-destructive"}>{lastTestStatusText}</span>
                        {lastTestStale && <span className="ml-2 text-amber-400">· stale (config changed since)</span>}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[step1Done, step2Done, step3Done].filter(Boolean).length}/3 steps
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Step n={1} done={step1Done} title={`Set the agent password${step1Done ? " (stored)" : ""}`}>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Button size="sm" onClick={() => { setPwDialogProvider(p); setPwDialogValue(""); }}>
                        <KeyRound className="h-4 w-4" />
                        <span className="ml-1">{step1Done ? "Update password" : "Set agent password"}</span>
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Stored encrypted in the database — only the admin panel and backend services can read it.
                      </span>
                    </div>
                    {lastTestMissingSecret && (
                      <div className="text-xs text-amber-400 flex items-center gap-1.5"><KeyRound className="h-3 w-3" /> Latest test reported the password is missing.</div>
                    )}
                  </Step>

                  <Step n={2} done={step2Done} title="Run the connection test">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" onClick={() => testConnection(p)} disabled={testingId === p.id || !step1Done}>
                        {testingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        <span className="ml-1">{lastTest ? "Re-run test" : "Run test"}</span>
                      </Button>
                      {lastTest && !lastTest.success && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => testConnection(p)}
                          disabled={testingId === p.id || !step1Done}
                          title="Re-run the connection test after fixing the issue"
                        >
                          {testingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          <span className="ml-1">Retry failed test</span>
                        </Button>
                      )}
                      {lastTest && (
                        <span className={`text-xs ${lastTest.success && !lastTestStale ? "text-emerald-400" : "text-destructive"}`}>
                          {lastTest.success
                            ? (lastTestStale ? `Last test passed but is stale (${lastTestRel})` : `OK (${lastTest.duration_ms ?? "?"}ms)`)
                            : (lastTestMissingSecret ? "Password missing — fix step 1, then retry" : (lastTest.error_message || "failed"))}
                        </span>
                      )}
                    </div>
                    {!step1Done && <p className="text-xs text-muted-foreground">Set the agent password in step 1 first.</p>}
                    {lastTest && !lastTest.success && (
                      <FailedTestDetails log={lastTest} />
                    )}
                  </Step>

                  <Step n={3} done={step3Done} title="Activate the provider so automation can run">
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active} onCheckedChange={(v) => toggleField(p, "is_active", v)} disabled={!step2Done} />
                      <span className="text-xs text-muted-foreground">{step2Done ? "Toggle on once the test passes." : "Pass a fresh test in step 2 first."}</span>
                    </div>
                  </Step>

                  {step1Done && step2Done && step3Done && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> All set. Automation toggles in the Providers tab are now safe to enable.
                    </div>
                  )}

                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Provider recent logs modal */}
      <Dialog open={!!logsModalProvider} onOpenChange={(o) => { if (!o) { setLogsModalProvider(null); setProviderLogs([]); setProviderLogsSearch(""); setProviderLogsLevels(new Set()); setProviderLogsAction("all"); setProviderLogsRange("all"); setProviderLogsHasMore(false); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Recent logs — {logsModalProvider?.display_name}</DialogTitle>
            <DialogDescription>
              Last 50 API calls for <code>{logsModalProvider?.name}</code>. Failures, fallbacks, and missing-secret entries are highlighted.
            </DialogDescription>
          </DialogHeader>
          {providerLogs.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={providerLogsSearch}
                  onChange={(e) => setProviderLogsSearch(e.target.value)}
                  placeholder="Search endpoint, action, status code, or error text…"
                  className="pl-9"
                />
                {providerLogsSearch && (
                  <button
                    onClick={() => setProviderLogsSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={providerLogsAction} onValueChange={setProviderLogsAction}>
                <SelectTrigger className="sm:w-[170px]"><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="agent_login">Health checks</SelectItem>
                  {Array.from(new Set(providerLogs.map(l => l.action).filter(Boolean) as string[]))
                    .filter(a => a !== "agent_login")
                    .sort()
                    .map(a => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={providerLogsRange} onValueChange={setProviderLogsRange}>
                <SelectTrigger className="sm:w-[150px]"><SelectValue placeholder="Time range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="15m">Last 15 min</SelectItem>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {providerLogsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : providerLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No logs found for this provider yet.</div>
            ) : (() => {
              const q = providerLogsSearch.trim().toLowerCase();
              const activeLevels = providerLogsLevels;
              const rangeMs: Record<string, number> = { "15m": 15 * 60_000, "1h": 60 * 60_000, "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000 };
              const cutoff = providerLogsRange !== "all" ? Date.now() - (rangeMs[providerLogsRange] || 0) : 0;
              const visibleLogs = providerLogs.filter(l => {
                if (activeLevels.size > 0 && !activeLevels.has(classifyLog(l).level)) return false;
                if (providerLogsAction !== "all" && l.action !== providerLogsAction) return false;
                if (cutoff && new Date(l.created_at).getTime() < cutoff) return false;
                if (!q) return true;
                return (
                  (l.endpoint || "").toLowerCase().includes(q) ||
                  (l.action || "").toLowerCase().includes(q) ||
                  String(l.http_status ?? "").includes(q) ||
                  (l.error_message || "").toLowerCase().includes(q)
                );
              });
              const counts = providerLogs.reduce((acc, l) => {
                const c = classifyLog(l).level;
                acc[c] = (acc[c] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              const toggleLevel = (lvl: string) => {
                setProviderLogsLevels(prev => {
                  const next = new Set(prev);
                  if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
                  return next;
                });
              };
              const filtersActive = q.length > 0 || activeLevels.size > 0 || providerLogsAction !== "all" || providerLogsRange !== "all";
              const LevelToggle = ({ lvl, label, className }: { lvl: string; label: string; className: string }) => {
                const active = activeLevels.has(lvl);
                return (
                  <button
                    type="button"
                    onClick={() => toggleLevel(lvl)}
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors hover:opacity-90",
                      className,
                      active && "ring-2 ring-offset-1 ring-offset-background ring-current"
                    )}
                    aria-pressed={active}
                    title={active ? `Remove ${label} filter` : `Show only ${label}`}
                  >
                    {label}: {counts[lvl] || 0}
                  </button>
                );
              };
              return (
                <>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs items-center">
                    <LevelToggle lvl="ok" label="OK" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30" />
                    <LevelToggle lvl="fail" label="Failed" className="bg-destructive/10 text-destructive border-destructive/30" />
                    <LevelToggle lvl="fallback" label="Fallback" className="bg-orange-500/10 text-orange-400 border-orange-500/30" />
                    <LevelToggle lvl="missing_secret" label="Secret missing" className="bg-amber-500/10 text-amber-400 border-amber-500/30" />
                    {activeLevels.size > 0 && (
                      <button
                        onClick={() => setProviderLogsLevels(new Set())}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Clear
                      </button>
                    )}
                    <div className={cn("flex items-center gap-2", filtersActive ? "ml-auto" : "ml-auto")}>
                      {filtersActive && (
                        <span className="text-muted-foreground">Showing {visibleLogs.length} of {providerLogs.length}</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => exportLogsCsv(visibleLogs, logsModalProvider?.name || "logs")}
                        disabled={visibleLogs.length === 0}
                        title={visibleLogs.length === 0 ? "No logs to export" : `Export ${visibleLogs.length} log(s) as CSV`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Export CSV ({visibleLogs.length})
                      </Button>
                    </div>
                  </div>
                  {visibleLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No logs match the current filters.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {visibleLogs.map((l) => {
                        const cls = classifyLog(l);
                        const rowStyle =
                          cls.level === "missing_secret" ? "border-amber-500/40 bg-amber-500/5" :
                          cls.level === "fallback" ? "border-orange-500/40 bg-orange-500/5" :
                          cls.level === "fail" ? "border-destructive/40 bg-destructive/5" :
                          "border-border";
                        const Icon =
                          cls.level === "missing_secret" ? KeyRound :
                          cls.level === "fallback" ? ShieldAlert :
                          cls.level === "fail" ? XCircle :
                          CheckCircle2;
                        const iconColor =
                          cls.level === "missing_secret" ? "text-amber-400" :
                          cls.level === "fallback" ? "text-orange-400" :
                          cls.level === "fail" ? "text-destructive" :
                          "text-emerald-400";
                        return (
                          <div
                            key={l.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setDrawerLog(l)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDrawerLog(l);
                              }
                            }}
                            className={`w-full text-left rounded-md border p-2.5 hover:bg-muted/40 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${rowStyle}`}
                          >
                            <div className="flex items-start gap-2">
                              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap text-xs">
                                  <code className="font-semibold">{l.action}</code>
                                  {cls.tag && (
                                    <Badge variant="outline" className={`${rowStyle} text-[10px] py-0 px-1.5 h-4`}>{cls.tag}</Badge>
                                  )}
                                  <span className="text-muted-foreground">HTTP {l.http_status ?? "—"}</span>
                                  <span className="text-muted-foreground">{l.duration_ms ?? "—"}ms</span>
                                  <span className="text-muted-foreground ml-auto">{new Date(l.created_at).toLocaleString()}</span>
                                </div>
                                {l.endpoint && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">{l.endpoint}</div>
                                )}
                                {l.error_message && (
                                  <div className="text-xs text-muted-foreground mt-1 truncate">{l.error_message}</div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs shrink-0"
                                onClick={(e) => { e.stopPropagation(); setDrawerLog(l); }}
                                title="Open replay snippet drawer"
                              >
                                <Play className="h-3.5 w-3.5 mr-1" /> Replay
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-4 flex flex-col items-center gap-1">
                    {providerLogsHasMore ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreProviderLogs}
                        disabled={providerLogsLoadingMore}
                      >
                        {providerLogsLoadingMore ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading…</>
                        ) : (
                          <>Load more (next {PROVIDER_LOGS_PAGE_SIZE})</>
                        )}
                      </Button>
                    ) : (
                      providerLogs.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">No more logs.</span>
                      )
                    )}
                    <span className="text-[11px] text-muted-foreground">Loaded {providerLogs.length} log{providerLogs.length === 1 ? "" : "s"}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>


      {/* Log details drawer */}
      <Sheet open={!!drawerLog} onOpenChange={(o) => { if (!o) setDrawerLog(null); }}>
        <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
          {drawerLog && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <code className="text-sm">{drawerLog.action}</code>
                  <Badge variant={drawerLog.success ? "default" : "destructive"}>
                    {drawerLog.http_status ?? "—"}
                  </Badge>
                </SheetTitle>
                <SheetDescription>
                  {drawerLog.provider_name} · {new Date(drawerLog.created_at).toLocaleString()} · {drawerLog.duration_ms ?? "—"}ms
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Log ID</div>
                    <button
                      onClick={() => copyText(drawerLog.id, "Log ID")}
                      className="font-mono text-left hover:underline truncate w-full"
                    >{drawerLog.id}</button>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Endpoint</div>
                    <button
                      onClick={() => copyText(drawerLog.endpoint ?? "", "Endpoint")}
                      className="font-mono text-left hover:underline truncate w-full"
                    >{drawerLog.endpoint ?? "—"}</button>
                  </div>
                </div>

                {drawerLog.error_message && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">Error</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(friendlyErrorMessage(drawerLog.error_message), "Sanitized error")}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy sanitized error
                      </Button>
                    </div>
                    <div className="text-foreground/90">{friendlyErrorMessage(drawerLog.error_message)}</div>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground inline-flex items-center gap-1 select-none">
                        <ChevronDown className="h-3 w-3" /> View raw error
                      </summary>
                      <div className="mt-1 break-words font-mono text-[11px]">{drawerLog.error_message}</div>
                    </details>
                  </div>
                )}


                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 px-3 py-2">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {showRaw ? <Eye className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
                      {showRaw ? "Showing raw payloads" : "Sensitive fields masked"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Toggle to reveal tokens, passwords, secrets, auth headers, etc.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{showRaw ? "Raw" : "Redacted"}</span>
                    <Switch checked={showRaw} onCheckedChange={setShowRaw} />
                  </div>
                </div>

                <JsonBlock title="Request payload" value={showRaw ? drawerLog.request_payload : redactPayload(drawerLog.request_payload)} onCopy={copyText} />
                <JsonBlock title="Response payload" value={showRaw ? drawerLog.response_payload : redactPayload(drawerLog.response_payload)} onCopy={copyText} />

                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Replay snippet</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyText(buildReplaySnippet(drawerLog), "Replay snippet")}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy curl
                    </Button>
                  </div>
                  <pre className="text-[11px] bg-background p-2 rounded overflow-auto max-h-48">
                    {buildReplaySnippet(drawerLog)}
                  </pre>
                  <p className="text-[11px] text-muted-foreground">
                    Sanitized template — paste into your terminal and add the agent token / secret to replay against the provider.
                  </p>
                </div>

                {/* Replay presets */}
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Replay presets</div>
                      <div className="text-[11px] text-muted-foreground">Save this request/response + curl for repeated debugging.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowPresets(s => !s)}>
                        {showPresets ? "Hide saved" : `Saved (${presets.length})`}
                      </Button>
                      <Button variant="default" size="sm" onClick={() => setSavingPreset(s => !s)}>
                        {savingPreset ? "Cancel" : "Save preset"}
                      </Button>
                    </div>
                  </div>
                  {savingPreset && (
                    <div className="flex gap-2 items-center">
                      <Input
                        autoFocus
                        placeholder={`${drawerLog.action} · ${drawerLog.provider_name ?? ""}`}
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveCurrentPreset(); }}
                      />
                      <Button size="sm" onClick={saveCurrentPreset}>Save</Button>
                    </div>
                  )}
                  {showPresets && (
                    <div className="space-y-1 max-h-60 overflow-auto">
                      {presets.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-3 text-center">No presets saved yet.</div>
                      ) : presets.map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded border bg-background text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{p.name}</div>
                            <div className="text-muted-foreground truncate">
                              {p.provider_name ?? "—"} · <code>{p.action}</code> · {new Date(p.savedAt).toLocaleString()}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => copyText(p.curl, "curl snippet")} title="Copy curl">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportPreset(p)} title="Copy full preset JSON">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deletePreset(p.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => copyText(drawerLog, "Full log")}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy full log
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create/edit dialog */}
      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Add Provider" : "Edit Provider"}</DialogTitle>
            <DialogDescription>Connection settings the system uses to talk to the provider. Agent password is stored separately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Internal name (no spaces)" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="cashmachine777" />
            <div className="space-y-1">
              <Label className="text-xs">Protocol</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={draft.protocol}
                onChange={(e) => setDraft({ ...draft, protocol: e.target.value as "agent_login" | "external_signed" | "orion_stars_signed" | "fast_api_signed" | "river_pay_simple" })}
              >
                <option value="agent_login">Agent Login (username + password → token)</option>
                <option value="external_signed">External Signed (agent_id + timestamp + secret_key)</option>
                <option value="orion_stars_signed">Orion Stars (agent login + rotating key, OS Terminal API v1.2)</option>
                <option value="fast_api_signed">Fast API (agent login → appid + appsecret, then signed calls)</option>
                <option value="river_pay_simple">River Pay (plain login + password, no signing)</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                {draft.protocol === "external_signed"
                  ? "No login step — every call is HMAC-signed. \"Agent username\" below is used as the agent_id, and the password you set is the secret_key."
                  : draft.protocol === "orion_stars_signed"
                  ? "Logs in with the agent username/password below to get a rotating agentKey, then signs every subsequent call with md5(agentName+time+agentKey) — the exact Orion Stars OS Terminal API v1.2 spec."
                  : draft.protocol === "fast_api_signed"
                  ? "Logs in with the agent account/password below to get a per-session appid + appsecret, then signs every subsequent call with it."
                  : draft.protocol === "river_pay_simple"
                  ? "No signing — the agent username/password below are sent as plain query params. River Pay assigns its own account \"code\" on creation."
                  : "Logs in with the agent username/password below to get a bearer token, then calls player endpoints with it."}
              </p>
            </div>
            <Field label="Display name" value={draft.display_name} onChange={(v) => setDraft({ ...draft, display_name: v })} placeholder="Cash Machine 777" />
            <Field label="API base URL" value={draft.base_url} onChange={(v) => setDraft({ ...draft, base_url: v })} placeholder="https://agentserver.cashmachine777.com" />
            <Field label="Health check path" value={draft.health_check_path} onChange={(v) => setDraft({ ...draft, health_check_path: v })} placeholder="/api/agent/login" />
            {!draft.health_check_path?.trim() && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Health check path is not configured. Base URL test may not confirm API availability.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Request method</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={draft.request_method}
                  onChange={(e) => setDraft({ ...draft, request_method: e.target.value })}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Content type</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={draft.request_content_type}
                  onChange={(e) => setDraft({ ...draft, request_content_type: e.target.value })}
                >
                  <option value="multipart/form-data">multipart/form-data</option>
                  <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
                  <option value="application/json">application/json</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Custom headers (JSON object, optional)</Label>
              <textarea
                className="w-full min-h-[70px] rounded-md border bg-background px-2 py-1.5 text-sm font-mono"
                value={draft.custom_headers_text}
                onChange={(e) => setDraft({ ...draft, custom_headers_text: e.target.value })}
                placeholder='{ "X-Api-Key": "..." }'
              />
              <p className="text-[11px] text-muted-foreground">Never put agent passwords or tokens here — store secrets via the Setup tab.</p>
            </div>
            <Field label={draft.protocol === "external_signed" ? "Agent ID" : "Agent username"} value={draft.agent_username} onChange={(v) => setDraft({ ...draft, agent_username: v })} />
            <Field label="Secret env var name (optional legacy fallback)" value={draft.secret_name} onChange={(v) => setDraft({ ...draft, secret_name: v })} placeholder="Leave blank — set the password from the Setup tab instead" />
            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <Label className="text-xs">Requires IP whitelist</Label>
                <p className="text-[11px] text-muted-foreground">Turn on if the provider only accepts requests from approved IPs.</p>
              </div>
              <Switch checked={!!draft.requires_ip_whitelist} onCheckedChange={(v) => setDraft({ ...draft, requires_ip_whitelist: v })} />
            </div>
            <Field label="Static proxy URL (optional)" value={draft.proxy_url} onChange={(v) => setDraft({ ...draft, proxy_url: v })} placeholder="https://proxy.example.com" />
            <p className="text-[11px] text-muted-foreground">If the provider requires IP whitelist, use a VPS/static proxy and whitelist that IP with the provider.</p>
            <Field label="Static server IP / whitelist note" value={draft.whitelist_ip_note} onChange={(v) => setDraft({ ...draft, whitelist_ip_note: v })} placeholder="e.g. Whitelist 1.2.3.4 with the provider" />
            <Field label="Provider API documentation URL / note" value={draft.docs_url} onChange={(v) => setDraft({ ...draft, docs_url: v })} placeholder="https://docs.example.com/agent-api" />
            <div className="space-y-1">
              <Label className="text-xs">Internal notes (optional)</Label>
              <textarea
                className="w-full min-h-[60px] rounded-md border bg-background px-2 py-1.5 text-sm"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Any context other admins should know about this provider..."
              />
            </div>

            <details className="rounded-md border bg-muted/30 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-sm">Connection Troubleshooting</summary>
              <ul className="mt-2 space-y-1 list-disc list-inside text-muted-foreground">
                <li>Confirm API base URL is correct</li>
                <li>Confirm health check endpoint</li>
                <li>Confirm request method and content type</li>
                <li>Confirm agent credentials are set</li>
                <li>Confirm server IP is whitelisted with the provider</li>
                <li>Try a static proxy if the provider blocks cloud servers</li>
              </ul>
              <div className="mt-3 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Copyable message to send the provider:</Label>
                <textarea
                  readOnly
                  className="w-full h-20 rounded-md border bg-background px-2 py-1.5 text-xs"
                  value="Please confirm the correct API base URL, request format, headers, and whether our backend IP must be whitelisted."
                />
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { navigator.clipboard.writeText("Please confirm the correct API base URL, request format, headers, and whether our backend IP must be whitelisted."); toast.success("Copied"); }}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy message
                </Button>
              </div>
            </details>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={saveProvider}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Money automation confirm — typed-confirmation required */}
      <Dialog open={!!confirmAutomation} onOpenChange={(o) => { if (!o) setConfirmAutomation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Enable money automation?</DialogTitle>
            <DialogDescription>
              This will let the provider API directly affect real player balances for{" "}
              {confirmAutomation?.field === "automate_deposit" ? "deposits" : "withdrawals"}.
              Enable only after live provider testing has succeeded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              Type <code className="font-mono bg-muted px-1 rounded">ENABLE MONEY AUTOMATION</code> to confirm
            </Label>
            <Input
              autoFocus
              value={automationConfirmText}
              onChange={(e) => setAutomationConfirmText(e.target.value)}
              placeholder="ENABLE MONEY AUTOMATION"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAutomation(null)}>Cancel</Button>
            <Button
              disabled={automationConfirmText.trim() !== "ENABLE MONEY AUTOMATION"}
              onClick={async () => {
                if (confirmAutomation) {
                  await applyToggle(confirmAutomation.provider, confirmAutomation.field, true);
                  setConfirmAutomation(null);
                }
              }}
            >
              I understand, enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alternative Formats result */}
      <Dialog open={!!formatTestResult} onOpenChange={(o) => { if (!o) setFormatTestResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formatTestResult?.winner
                ? <><ShieldCheck className="h-5 w-5 text-emerald-500" /> Working format found</>
                : <><AlertTriangle className="h-5 w-5 text-amber-500" /> Admin action required</>}
            </DialogTitle>
            <DialogDescription>
              {formatTestResult?.winner
                ? `Saved "${formatTestResult.winner}" as the default request format for ${formatTestResult.provider.display_name}.`
                : formatTestResult?.allTlsClosed
                  ? "All request formats were tested but the provider closed the connection before responding. This usually requires provider-side action: correct API URL, IP whitelist, or server TLS fix."
                  : "All request formats were tested but none succeeded. Manual fallback remains active."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <div className="font-semibold text-xs uppercase text-muted-foreground">Format checklist</div>
              {formatTestResult?.probes.map((pr) => (
                <div key={pr.fmt} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {pr.ok
                      ? <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      : <span className="h-2 w-2 rounded-full bg-destructive" />}
                    <span className="font-mono text-xs">{pr.fmt}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {pr.ok ? `ok${pr.latency != null ? ` • ${pr.latency}ms` : ""}` : "failed"}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">Proxy used</div>
                <div className="font-medium">{formatTestResult?.proxyUsed ? "Yes" : "No"}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">Last response time</div>
                <div className="font-medium">
                  {(() => {
                    const ls = formatTestResult?.probes.filter((x) => x.latency != null).map((x) => x.latency!) ?? [];
                    return ls.length ? `${Math.max(...ls)}ms` : "—";
                  })()}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 px-3 py-2 text-xs inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Manual fallback active — user requests stay pending for manual processing.
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-semibold mb-1">Final recommendation</div>
              {formatTestResult?.winner ? (
                <div className="text-muted-foreground">
                  Run a Safe Test next to confirm end-to-end behavior. Money automation remains disabled until you enable it explicitly.
                </div>
              ) : (
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Confirm the API base URL and health check path with the provider.</li>
                  <li>Ask the provider to whitelist the server IP.</li>
                  <li>If the provider only allows whitelisted IPs, configure a Static Proxy URL.</li>
                  <li>Provider remains on <b>Needs Attention</b>; automation flags stay off.</li>
                </ul>
              )}
            </div>

            {!formatTestResult?.winner && (
              <details className="rounded-md border bg-muted/30 p-2 text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">Technical Details</summary>
                <div className="mt-2 space-y-1 font-mono text-muted-foreground break-all">
                  {formatTestResult?.probes.map((pr) => (
                    <div key={pr.fmt}>
                      <div>{pr.fmt}{pr.httpStatus ? ` • HTTP ${pr.httpStatus}` : ""}</div>
                      <div className="whitespace-pre-wrap">↳ {pr.message}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <DialogFooter>
            {!formatTestResult?.winner && (
              <Button variant="outline" onClick={() => {
                navigator.clipboard.writeText("Please confirm the correct API base URL, request format, headers, and whether our backend IP must be whitelisted.");
                toast.success("Copied provider message");
              }}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy provider message
              </Button>
            )}
            <Button onClick={() => setFormatTestResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Safe E2E test confirmation */}
      <Dialog open={!!safeTestProvider} onOpenChange={(o) => { if (!o) setSafeTestProvider(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-amber-500" /> Run Safe Test?</DialogTitle>
            <DialogDescription>
              This test may create a test account or call provider endpoints on{" "}
              <b>{safeTestProvider?.display_name}</b>. It will not process real money unless money automation is enabled on this provider.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSafeTestProvider(null)}>Cancel</Button>
            <Button onClick={async () => { const p = safeTestProvider; setSafeTestProvider(null); if (p) await runE2eTest(p); }}>
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set agent password */}
      <Dialog open={!!pwDialogProvider} onOpenChange={(o) => { if (!o) { setPwDialogProvider(null); setPwDialogValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> {pwDialogProvider?.protocol === "external_signed" ? "Set secret key" : "Set agent password"}</DialogTitle>
            <DialogDescription>
              {pwDialogProvider ? (
                pwDialogProvider.protocol === "external_signed"
                  ? <>Enter the secret_key for <b>{pwDialogProvider.display_name}</b> (used to sign every request). It's encrypted at rest and only used by backend automation.</>
                  : <>Enter the agent account password for <b>{pwDialogProvider.display_name}</b>. It's encrypted at rest and only used by backend automation.</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{pwDialogProvider?.protocol === "external_signed" ? "Secret key" : "Agent password"}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={pwDialogValue}
              onChange={(e) => setPwDialogValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveProviderPassword(); }}
              placeholder="••••••••"
            />
            {pwDialogProvider && passwordSet[pwDialogProvider.id] && (
              <p className="text-xs text-muted-foreground">Saving will replace the currently stored password.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwDialogProvider(null); setPwDialogValue(""); }}>Cancel</Button>
            <Button onClick={saveProviderPassword} disabled={pwDialogSaving || !pwDialogValue}>
              {pwDialogSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-1">Save password</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function ToggleRow({ label, checked, onChange, hint, warning }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; warning?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 p-2 rounded border ${warning ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
      <div className="min-w-0">
        <div className="text-sm flex items-center gap-1.5">
          {warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          <span>{label}</span>
        </div>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|auth|bearer|access[_-]?token|refresh[_-]?token|session|cookie|signature|sign|hash|salt|private[_-]?key|client[_-]?secret|agent[_-]?token|otp|pin|cvv|card|account[_-]?number|ssn)/i;

function maskValue(v: unknown): string {
  if (v == null) return "***";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.length <= 4) return "***";
  if (s.length <= 8) return `${s.slice(0, 1)}***`;
  return `${s.slice(0, 2)}***${s.slice(-2)} (${s.length} chars)`;
}

function redactPayload(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactPayload);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = `🔒 ${maskValue(v)}`;
      } else {
        out[k] = redactPayload(v);
      }
    }
    return out;
  }
  return value;
}

function JsonBlock({ title, value, onCopy }: { title: string; value: unknown; onCopy: (v: unknown, label: string) => void }) {
  const text = value == null ? "—" : JSON.stringify(value, null, 2);
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <Button variant="outline" size="sm" onClick={() => onCopy(value ?? {}, title)} disabled={value == null}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copy JSON
        </Button>
      </div>
      <pre className="text-[11px] bg-background p-2 rounded overflow-auto max-h-72 whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

function buildReplaySnippet(log: ApiLog): string {
  const url = log.endpoint || "<endpoint>";
  const body = log.request_payload ? JSON.stringify(log.request_payload) : "{}";
  return [
    `# ${log.action} @ ${log.provider_name ?? "provider"}`,
    `curl -sS -X POST '<BASE_URL>${url}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Authorization: Bearer <AGENT_TOKEN>' \\`,
    `  -d '${body.replace(/'/g, "'\\''")}'`,
  ].join("\n");
}

function exportLogs(logs: ApiLog[], filtered: boolean) {
  const payload = {
    exported_at: new Date().toISOString(),
    source: "/admin/game-api-providers",
    filtered,
    count: logs.length,
    logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `game-api-logs-${filtered ? "filtered-" : ""}${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${logs.length} log${logs.length === 1 ? "" : "s"}`);
}

function exportLogsCsv(logs: ApiLog[], providerName: string) {
  if (logs.length === 0) {
    toast.error("No logs to export");
    return;
  }
  const headers = [
    "created_at",
    "provider_name",
    "action",
    "endpoint",
    "http_status",
    "success",
    "duration_ms",
    "error_message",
    "request_payload",
    "response_payload",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  };
  const rows = logs.map(l => [
    l.created_at,
    l.provider_name ?? "",
    l.action,
    l.endpoint ?? "",
    l.http_status ?? "",
    l.success,
    l.duration_ms ?? "",
    l.error_message ?? "",
    l.request_payload ?? "",
    l.response_payload ?? "",
  ].map(escape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (providerName || "logs").replace(/[^A-Za-z0-9_-]+/g, "_");
  a.href = url;
  a.download = `game-api-logs-${safeName}-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${logs.length} log${logs.length === 1 ? "" : "s"} as CSV`);
}

function suggestSecretName(providerName: string): string {
  const cleaned = (providerName || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const base = cleaned || "PROVIDER";
  return `${base}_AGENT_PASSWORD`;
}

function BulkSecretNameCard({ providers, onApplied }: { providers: Provider[]; onApplied: () => void }) {
  const missing = useMemo(
    () => providers.filter(p => !p.secret_name || p.secret_name.trim() === ""),
    [providers],
  );
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d: Record<number, string> = {};
    const s: Record<number, boolean> = {};
    missing.forEach(p => { d[p.id] = suggestSecretName(p.name); s[p.id] = true; });
    setDrafts(d);
    setSelected(s);
  }, [open, missing]);

  if (missing.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-4 flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          All providers have a secret env-var name configured.
        </CardContent>
      </Card>
    );
  }

  async function applyAll() {
    const targets = missing.filter(p => selected[p.id] && (drafts[p.id] || "").trim().length > 0);
    if (targets.length === 0) { toast.error("Select at least one provider with a name"); return; }
    setApplying(true);
    let ok = 0, fail = 0;
    for (const p of targets) {
      const v = drafts[p.id].trim();
      try {
        await api.put(`/admin/game-api-providers/${p.id}`, { secret_name: v });
        ok++;
      } catch {
        fail++;
      }
    }
    setApplying(false);
    if (ok) toast.success(`Saved secret name for ${ok} provider${ok === 1 ? "" : "s"}`);
    if (fail) toast.error(`${fail} update${fail === 1 ? "" : "s"} failed`);
    setOpen(false);
    onApplied();
  }

  const selectedCount = missing.filter(p => selected[p.id]).length;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-amber-400" />
              {missing.length} provider{missing.length === 1 ? "" : "s"} missing a secret env-var name
            </CardTitle>
            <CardDescription>
              Auto-suggest <code className="font-mono">PROVIDER_NAME_AGENT_PASSWORD</code> and save in one batch. You can edit each suggestion before applying.
            </CardDescription>
          </div>
          {!open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <KeyRound className="h-4 w-4 mr-1" /> Bulk-fill secret names
            </Button>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {missing.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-md border bg-card/40">
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={(e) => setSelected(s => ({ ...s, [p.id]: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.name}</div>
                </div>
                <Input
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                  placeholder={suggestSecretName(p.name)}
                  className="font-mono text-xs max-w-[280px]"
                  disabled={!selected[p.id]}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={applying}>Cancel</Button>
            <Button size="sm" onClick={applyAll} disabled={applying || selectedCount === 0}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Apply to {selectedCount} provider{selectedCount === 1 ? "" : "s"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional. The primary way to provide credentials is the "Set agent password" button on each provider.
          </p>

        </CardContent>
      )}
    </Card>
  );
}

function SecretNamesQuickRef({ providers }: { providers: Provider[] }) {
  if (providers.length === 0) return null;

  const rows = providers.map(p => ({
    id: p.id,
    display_name: p.display_name,
    name: p.name,
    secret_name: p.secret_name?.trim() || "",
    suggestion: suggestSecretName(p.name),
  }));

  function copy(value: string, label: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  function copyAll() {
    const text = rows
      .map(r => `${r.display_name} (${r.name}): ${r.secret_name || r.suggestion}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("All secret names copied"),
      () => toast.error("Copy failed"),
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Legacy env-var secret names (optional)
            </CardTitle>
            <CardDescription>
              Only needed if you prefer a .env-based fallback over the in-app password. The in-app "Set agent password" button is the recommended path.
            </CardDescription>

          </div>
          <Button variant="outline" size="sm" onClick={copyAll}>
            <Copy className="h-4 w-4 mr-1" /> Copy all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Secret env-var name</TableHead>
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const value = r.secret_name || r.suggestion;
              const isSuggested = !r.secret_name;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.display_name}</div>
                    <div className="text-xs text-muted-foreground">{r.name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded">{value}</code>
                      {isSuggested && (
                        <span className="text-xs text-amber-400">suggested — not saved yet</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copy(value, r.display_name + " secret name")}
                      title="Copy secret name"
                    >
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FailedTestDetails({ log }: { log: ApiLog }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const status = log.http_status != null ? `HTTP ${log.http_status}` : "no HTTP status";
  const dur = log.duration_ms != null ? `${log.duration_ms}ms` : "?";

  function copy(value: unknown, label: string) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  const reqDisplay = showRaw ? log.request_payload : redactPayload(log.request_payload);
  const resDisplay = showRaw ? log.response_payload : redactPayload(log.response_payload);

  return (
    <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs"
      >
        <span className="flex items-center gap-2 text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          Failed test details · {status} · {dur}
        </span>
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Endpoint: <code className="font-mono">{log.endpoint || "(none)"}</code>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showRaw} onCheckedChange={setShowRaw} id={`raw-${log.id}`} />
              <Label htmlFor={`raw-${log.id}`} className="text-xs text-muted-foreground">
                {showRaw ? "Raw" : "Masked"}
              </Label>
            </div>
          </div>
          {log.error_message && (
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Error message</div>
              <pre className="bg-background/60 border rounded p-2 whitespace-pre-wrap break-words font-mono">{log.error_message}</pre>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Request</span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy(reqDisplay, "Request")}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="bg-background/60 border rounded p-2 max-h-60 overflow-auto font-mono text-[11px]">
                {JSON.stringify(reqDisplay ?? null, null, 2)}
              </pre>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Response</span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy(resDisplay, "Response")}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="bg-background/60 border rounded p-2 max-h-60 overflow-auto font-mono text-[11px]">
                {JSON.stringify(resDisplay ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
