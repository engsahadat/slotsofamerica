import { useState } from "react";
import { Loader2, Download, FileText, FileSpreadsheet, Eye, RefreshCw, Send } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { downloadCsv, downloadPdf, fetchTransactionRows, type TxRow } from "@/lib/exportTransactions";

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

export type ExportFilters = {
  from: string;
  to: string;
  typeFilter: "all" | "deposit" | "withdraw" | "redeem" | "transfer";
  statusFilter: "all" | "pending" | "completed" | "rejected";
  filenameBase: string;
  includeDateInName: boolean;
};

type TxType = ExportFilters["typeFilter"];
type TxStatus = ExportFilters["statusFilter"];
type Preset = "today" | "1d" | "7d" | "30d" | "90d" | "custom";

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposit" },
  { value: "withdraw", label: "Withdraw" },
  { value: "redeem", label: "Redeem" },
  { value: "transfer", label: "Transfer" },
];

const STATUS_OPTIONS: { value: TxStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "1d", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
];

const todayIso = () => new Date().toISOString().split("T")[0];
const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};
// "2026-09-16" -> "9/16/2026" — short, locale-free display for the "Selected: … → …" summary.
const fmtShortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

type Props = {
  /** "download" = direct download (admin). "request" = submit export_requests row (manager). */
  mode?: "download" | "request";
};

export default function TransactionExportPanel({ mode = "download" }: Props) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [typeFilter, setTypeFilter] = useState<TxType>("all");
  const [statusFilter, setStatusFilter] = useState<TxStatus>("all");
  const [busy, setBusy] = useState<null | "csv" | "pdf" | "preview" | "request">(null);
  const [preview, setPreview] = useState<TxRow[] | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [filenameBase, setFilenameBase] = useState("transactions");
  const [includeDateInName, setIncludeDateInName] = useState(true);
  const [reason, setReason] = useState("");

  const sanitizeName = (s: string) =>
    s.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

  const buildFilename = (ext: "csv" | "pdf") => {
    const base = sanitizeName(filenameBase || "transactions") || "transactions";
    const suffix = includeDateInName ? `_${from}_to_${to}` : "";
    return `${base}${suffix}.${ext}`;
  };

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "today") {
      setFrom(todayIso());
      setTo(todayIso());
    } else if (p === "1d") {
      setFrom(daysAgoIso(1));
      setTo(todayIso());
    } else if (p === "7d") {
      setFrom(daysAgoIso(7));
      setTo(todayIso());
    } else if (p === "30d") {
      setFrom(daysAgoIso(30));
      setTo(todayIso());
    } else if (p === "90d") {
      setFrom(daysAgoIso(90));
      setTo(todayIso());
    }
    if (preview) setPreviewStale(true);
  };

  const fetchRows = (): Promise<TxRow[]> =>
    fetchTransactionRows({ from, to, typeFilter, statusFilter });

  const validateRange = () => {
    if (!from || !to) {
      toast({ title: "Pick a date range", variant: "destructive" });
      return false;
    }
    if (new Date(from) > new Date(to)) {
      toast({ title: "Invalid range", description: "From date must be before To date.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const markStale = () => {
    if (preview) setPreviewStale(true);
  };

  const handlePreview = async () => {
    if (!validateRange()) return;
    setBusy("preview");
    try {
      const rows = await fetchRows();
      setPreview(rows);
      setPreviewStale(false);
      if (rows.length === 0) {
        toast({ title: "No transactions match the selected filters" });
      }
    } catch (e: any) {
      toast({ title: "Preview failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleSubmitRequest = async () => {
    if (!validateRange()) return;
    setBusy("request");
    try {
      let rowCount: number | null = null;
      try {
        const rows = preview && !previewStale ? preview : await fetchRows();
        rowCount = rows.length;
        if (!preview || previewStale) {
          setPreview(rows);
          setPreviewStale(false);
        }
      } catch { /* non-fatal — admin can still review */ }

      const filters: ExportFilters = {
        from, to, typeFilter, statusFilter,
        filenameBase: filenameBase || "transactions",
        includeDateInName,
      };

      await api.post("/admin/export-requests", {
        export_type: "transactions",
        filters,
        reason: reason.trim() || null,
        row_count: rowCount,
      });
      toast({ title: "Request submitted", description: "An admin will review your export request." });
      setReason("");
    } catch (e: any) {
      toast({ title: "Request failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async (format: "csv" | "pdf") => {
    if (!validateRange()) return;

    setBusy(format);
    try {
      const rows = preview && !previewStale ? preview : await fetchRows();
      if (!preview || previewStale) {
        setPreview(rows);
        setPreviewStale(false);
      }
      if (rows.length === 0) {
        toast({ title: "No transactions match the selected filters" });
        return;
      }

      const typeLabel = TYPE_OPTIONS.find((o) => o.value === typeFilter)!.label;
      const statusLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)!.label;
      const filename = buildFilename(format);

      if (format === "csv") {
        downloadCsv(filename, rows);
      } else {
        const generatedBy = user?.name || user?.username || user?.email || "Admin";

        await downloadPdf(filename, rows, {
          branding: {
            siteName: settings.site_name,
            logoUrl: settings.logo_url,
            primaryColor: settings.colors?.primary || undefined,
          },
          title: "Transactions Export",
          dateRange: `${from} to ${to}`,
          typeFilter: typeLabel,
          statusFilter: statusLabel,
          generatedBy,
        });
      }

      toast({ title: "Export ready", description: `${rows.length} row(s) downloaded.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const statusBadge = (s: string) => {
    const v = (s || "").toLowerCase();
    const cls =
      v === "approved" || v === "completed"
        ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
        : v === "rejected"
        ? "bg-red-500/15 text-red-500 border-red-500/30"
        : v === "pending"
        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
    return <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${cls}`}>{s}</span>;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            {mode === "request" ? <Send className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {mode === "request" ? "Request Transaction Export" : "Export Transactions"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "request"
              ? "Choose a date range, transaction type, and status. Submit for admin approval — you'll be able to download once approved."
              : "Filter by date range, type, and status — then download as CSV or branded PDF."}
          </p>
        </div>
      </div>

      {/* Presets */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Quick range</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => applyPreset(p.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                preset === p.value
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Selected: <span className="font-semibold text-foreground">{fmtShortDate(from)} → {fmtShortDate(to)}</span>
        </p>
      </div>

      {/* Custom range — only surfaced once "Custom" is picked; the presets above cover the
          common cases, so showing raw date inputs unconditionally was just visual noise. */}
      {preset === "custom" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPreset("custom"); markStale(); }}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPreset("custom"); markStale(); }}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Type */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Transaction type</label>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setTypeFilter(o.value); markStale(); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                typeFilter === o.value
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Status</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setStatusFilter(o.value); markStale(); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                statusFilter === o.value
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview action */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        <Button onClick={handlePreview} disabled={busy !== null} variant="outline">
          {busy === "preview" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : preview ? (
            <RefreshCw className="h-4 w-4 mr-2" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          {preview ? "Refresh preview" : "Preview results"}
        </Button>
        {preview && (
          <span className="text-xs text-muted-foreground">
            {preview.length} row{preview.length === 1 ? "" : "s"} matched
            {previewStale && <span className="ml-2 text-amber-500">• filters changed — refresh</span>}
          </span>
        )}
      </div>

      {/* Preview table */}
      {preview && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Game</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No transactions match the selected filters.
                    </td>
                  </tr>
                ) : (
                  preview.slice(0, 100).map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2">{r.user_label}</td>
                      <td className="px-3 py-2 capitalize">{r.type}</td>
                      <td className="px-3 py-2">{r.game_label}</td>
                      <td className="px-3 py-2 text-right font-mono">${Number(r.amount).toFixed(2)}</td>
                      <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {preview.length > 100 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 border-t border-border">
              Showing first 100 of {preview.length}. Full set will be included in the export.
            </div>
          )}
        </div>
      )}

      {/* Filename customization (download mode only) */}
      {mode === "download" && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end pt-2 border-t border-border">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Filename
            </label>
            <div className="flex items-stretch rounded-lg border border-border bg-muted/50 overflow-hidden focus-within:border-primary">
              <input
                type="text"
                value={filenameBase}
                onChange={(e) => setFilenameBase(e.target.value)}
                placeholder="transactions"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              />
              <span className="px-3 py-2 text-xs text-muted-foreground bg-muted/70 border-l border-border whitespace-nowrap">
                {includeDateInName ? `_${from}_to_${to}` : ""}.csv / .pdf
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              Preview: <span className="font-mono text-foreground">{buildFilename("csv")}</span>
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={includeDateInName}
              onChange={(e) => setIncludeDateInName(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Include date range in filename
          </label>
        </div>
      )}

      {/* Reason (request mode only) */}
      {mode === "request" && (
        <div className="pt-2 border-t border-border">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Reason (optional)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you need this export? (visible to admin)"
            rows={3}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        {mode === "download" ? (
          <>
            <Button onClick={() => handleExport("csv")} disabled={busy !== null} variant="outline">
              {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Download CSV
            </Button>
            <Button onClick={() => handleExport("pdf")} disabled={busy !== null} className="gradient-bg">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          </>
        ) : (
          <Button onClick={handleSubmitRequest} disabled={busy !== null} className="gradient-bg">
            {busy === "request" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Export Request
          </Button>
        )}
      </div>
    </div>
  );
}
