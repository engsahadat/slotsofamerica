import { useEffect, useMemo, useState, useCallback } from "react";
import { Database, RefreshCw, Search, Loader2 } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";

interface Summary {
  tables: number;
  protected: number;
  no_policies: number;
  rls_off: number;
  views: number;
}

interface SampleCounts {
  total_profiles: number;
  admins: number;
  managers: number;
  regular_users: number;
  flagged: number;
  audit_logs: number;
  tx_pending: number;
  tx_completed: number;
  tx_rejected: number;
  access_pending: number;
  pw_requests_pending: number;
  exports_pending: number;
}

type TableStatus = "protected" | "no_policies" | "rls_off" | "framework";

interface TableRow {
  table: string;
  status: TableStatus;
  sel: number;
  ins: number;
  upd: number;
  del: number;
  total: number;
}

interface DiagnosticsData {
  summary: Summary;
  sample_counts: SampleCounts;
  tables_report: TableRow[];
}

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

const STATUS_LABEL: Record<TableStatus, string> = {
  protected: "Protected",
  no_policies: "No Policies",
  rls_off: "RLS Off",
  framework: "Framework",
};

const STATUS_BADGE: Record<TableStatus, string> = {
  protected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  no_policies: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rls_off: "bg-destructive/10 text-destructive border-destructive/20",
  framework: "bg-muted/30 text-muted-foreground border-border",
};

const RISK_LEVELS: { value: string; label: string }[] = [
  { value: "all", label: "All risk levels" },
  { value: "protected", label: "Protected only" },
  { value: "no_policies", label: "No policies only" },
  { value: "rls_off", label: "RLS off only" },
  { value: "framework", label: "Framework only" },
];

const SAMPLE_COUNT_TILES: { key: keyof SampleCounts; label: string; tone: (v: number) => string }[] = [
  { key: "total_profiles", label: "Total Profiles", tone: () => "text-foreground" },
  { key: "admins", label: "Admins", tone: () => "text-primary" },
  { key: "managers", label: "Managers", tone: () => "text-primary" },
  { key: "regular_users", label: "Regular Users", tone: () => "text-foreground" },
  { key: "flagged", label: "Flagged", tone: (v) => (v > 0 ? "text-destructive" : "text-foreground") },
  { key: "audit_logs", label: "Audit Logs", tone: () => "text-foreground" },
  { key: "tx_pending", label: "Tx Pending", tone: (v) => (v > 0 ? "text-amber-400" : "text-foreground") },
  { key: "tx_completed", label: "Tx Completed", tone: () => "text-emerald-400" },
  { key: "tx_rejected", label: "Tx Rejected", tone: () => "text-foreground" },
  { key: "access_pending", label: "Access Pending", tone: (v) => (v > 0 ? "text-amber-400" : "text-foreground") },
  { key: "pw_requests_pending", label: "PW Reqs Pending", tone: (v) => (v > 0 ? "text-amber-400" : "text-foreground") },
  { key: "exports_pending", label: "Exports Pending", tone: (v) => (v > 0 ? "text-amber-400" : "text-foreground") },
];

const AdminRlsDiagnostics = () => {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");

  const fetchData = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const { data } = await api.get("/admin/rls-diagnostics");
      setData(data);
    } catch (e: any) {
      toast({ title: "Failed to load diagnostics", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.tables_report.filter((r) => {
      if (riskLevel !== "all" && r.status !== riskLevel) return false;
      if (q && !r.table.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, riskLevel]);

  const SUMMARY_TILES = data
    ? [
        { key: "tables", label: "Tables", value: data.summary.tables, tone: "text-foreground" },
        { key: "protected", label: "Protected", value: data.summary.protected, tone: "text-emerald-400" },
        { key: "no_policies", label: "No Policies", value: data.summary.no_policies, tone: data.summary.no_policies > 0 ? "text-amber-400" : "text-emerald-400" },
        { key: "rls_off", label: "RLS Off", value: data.summary.rls_off, tone: data.summary.rls_off > 0 ? "text-destructive" : "text-emerald-400" },
        { key: "views", label: "Views", value: data.summary.views, tone: "text-primary" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-wide flex items-center gap-2">
            <Database className="h-6 w-6" /> RLS Diagnostics
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Coverage report for every public table and view, plus row counts per role.
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {SUMMARY_TILES.map((t) => (
              <div key={t.key} className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                <p className={`mt-1 text-2xl font-bold ${t.tone}`}>{t.value}</p>
              </div>
            ))}
          </div>

          {/* Sample counts */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Sample counts</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {SAMPLE_COUNT_TILES.map((t) => {
                const value = data.sample_counts[t.key] ?? 0;
                return (
                  <div key={t.label} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                    <p className={`mt-1 text-xl font-bold ${t.tone(value)}`}>{value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search table name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary sm:w-[220px]"
            >
              {RISK_LEVELS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 sticky top-0">
                  <tr className="text-left text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Table</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Sel</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ins</th>
                    <th className="px-4 py-2.5 font-medium text-right">Upd</th>
                    <th className="px-4 py-2.5 font-medium text-right">Del</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No tables match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr key={r.table} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.table}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${STATUS_BADGE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.sel}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.ins}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.upd}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.del}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{r.total}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminRlsDiagnostics;
