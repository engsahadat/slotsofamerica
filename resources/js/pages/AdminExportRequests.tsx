import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, FileDown, CheckCircle, XCircle, Clock, User, Calendar, Filter, FileSpreadsheet, FileText, Search, ArrowUpDown, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import TransactionExportPanel from "@/components/TransactionExportPanel";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import {
  buildExportFilename,
  downloadCsv,
  downloadPdf,
  fetchTransactionRows,
  type SavedExportFilters,
} from "@/lib/exportTransactions";

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

interface ExportRequest {
  id: number;
  manager_id: number;
  export_type: string;
  filters: any;
  reason: string | null;
  status: string;
  row_count: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  admin_note: string | null;
  approved_expires_at: string | null;
  created_at: string;
  manager?: { id: number; name: string; username: string; email: string } | null;
}

const TABS = ["all", "pending", "approved", "rejected"] as const;

const statusBadge: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted/30 text-muted-foreground border-border",
};

const TYPE_LABEL: Record<string, string> = {
  all: "All", deposit: "Deposit", withdraw: "Withdraw", redeem: "Redeem", transfer: "Transfer",
};
const STATUS_LABEL: Record<string, string> = {
  all: "All", pending: "Pending", completed: "Completed", rejected: "Rejected",
};

const FilterSummary = ({ filters }: { filters: any }) => {
  if (!filters || typeof filters !== "object") {
    return <code className="break-all text-xs">{JSON.stringify(filters)}</code>;
  }
  const f = filters as SavedExportFilters & { search?: string };
  const hasNew = "from" in f && "to" in f && "typeFilter" in f && "statusFilter" in f;
  if (!hasNew) {
    return <code className="break-all text-xs">{JSON.stringify(filters)}</code>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-foreground">
        <Calendar className="inline h-3 w-3 mr-1" />
        Date Range: {f.from} → {f.to}
      </span>
      <span className="px-2 py-0.5 rounded bg-muted/60 border border-border capitalize">
        Type: {TYPE_LABEL[f.typeFilter] || f.typeFilter}
      </span>
      <span className="px-2 py-0.5 rounded bg-muted/60 border border-border capitalize">
        Status: {STATUS_LABEL[f.statusFilter] || f.statusFilter}
      </span>
    </div>
  );
};

const AdminExportRequests = () => {
  const { user, role } = useAuth();
  const { settings } = useSiteSettings();
  const isManager = role === "manager";
  const [tab, setTab] = useState<string>("all");
  const [requests, setRequests] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<{ id: number; format: "csv" | "pdf" } | null>(null);
  const [rejectModal, setRejectModal] = useState<ExportRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "expiry_desc" | "expiry_asc">("created_desc");

  // Manager default tab = approved (so they immediately see what they can download)
  useEffect(() => {
    if (isManager) setTab("approved");
  }, [isManager]);

  // Fetch the full list once (no server-side status filter) — tabs/counts are derived
  // client-side below so switching tabs is instant and "All" can show a real total.
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/export-requests");
      setRequests(data.requests || []);
    } catch (e: any) {
      toast({ title: "Failed to load", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const approve = async (req: ExportRequest) => {
    setProcessing(req.id);
    try {
      await api.post(`/admin/export-requests/${req.id}/approve`);
      toast({ title: "Approved", description: "Manager can now download for 24 hours." });
      fetchRequests();
    } catch (e: any) {
      toast({ title: "Failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const reject = async () => {
    if (!rejectModal) return;
    if (!rejectNote.trim()) {
      toast({ title: "Note required", description: "Please provide a reason.", variant: "destructive" });
      return;
    }
    setProcessing(rejectModal.id);
    try {
      await api.post(`/admin/export-requests/${rejectModal.id}/reject`, { note: rejectNote.trim() });
      toast({ title: "Rejected" });
      setRejectModal(null);
      setRejectNote("");
      fetchRequests();
    } catch (e: any) {
      toast({ title: "Failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const runSweep = async () => {
    try {
      const { data } = await api.post("/admin/export-requests/sweep-expired");
      toast({ title: "Sweep complete", description: `${data.count ?? 0} expired approval(s) updated.` });
      fetchRequests();
    } catch (e: any) {
      toast({ title: "Sweep failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    }
  };

  const handleDownload = async (req: ExportRequest, format: "csv" | "pdf") => {
    if (!req.filters || typeof req.filters !== "object" || !("from" in req.filters)) {
      toast({
        title: "Cannot download",
        description: "This request was created before filters were saved. Please submit a new request.",
        variant: "destructive",
      });
      return;
    }
    if (req.approved_expires_at && new Date(req.approved_expires_at).getTime() <= Date.now()) {
      toast({ title: "Approval expired", description: "Please submit a new request.", variant: "destructive" });
      fetchRequests();
      return;
    }

    setDownloading({ id: req.id, format });
    try {
      // Server-side validate / consume approval window
      try {
        await api.post(`/admin/export-requests/${req.id}/consume`);
      } catch (consumeErr: any) {
        toast({ title: "Approval expired", description: errMsg(consumeErr, "Please submit a new request."), variant: "destructive" });
        fetchRequests();
        return;
      }

      const f = req.filters as SavedExportFilters;
      const rows = await fetchTransactionRows(f, req.id);
      if (rows.length === 0) {
        toast({ title: "No transactions match", description: "The saved filters returned no rows." });
        return;
      }
      const filename = buildExportFilename(f, format);
      if (format === "csv") {
        downloadCsv(filename, rows);
      } else {
        const generatedBy = user?.name || user?.username || user?.email || "Manager";
        await downloadPdf(filename, rows, {
          branding: {
            siteName: settings.site_name,
            logoUrl: settings.logo_url,
            primaryColor: settings.colors?.primary || undefined,
          },
          title: "Transactions Export",
          dateRange: `${f.from} to ${f.to}`,
          typeFilter: TYPE_LABEL[f.typeFilter] || f.typeFilter,
          statusFilter: STATUS_LABEL[f.statusFilter] || f.statusFilter,
          generatedBy,
        });
      }
      toast({ title: "Export ready", description: `${rows.length} row(s) downloaded.` });
    } catch (e: any) {
      toast({ title: "Download failed", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const visibleTabs = TABS;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of requests) {
      if (r.status in c) c[r.status]++;
    }
    return c;
  }, [requests]);

  const tabRequests = useMemo(
    () => (tab === "all" ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab],
  );

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tabRequests;
    if (q) {
      list = list.filter((r) =>
        (r.manager?.name || "").toLowerCase().includes(q) ||
        (r.manager?.email || "").toLowerCase().includes(q) ||
        (r.manager?.username || "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "expiry_desc": {
          const ax = a.approved_expires_at ? new Date(a.approved_expires_at).getTime() : 0;
          const bx = b.approved_expires_at ? new Date(b.approved_expires_at).getTime() : 0;
          return bx - ax;
        }
        case "expiry_asc": {
          const ax = a.approved_expires_at ? new Date(a.approved_expires_at).getTime() : Number.POSITIVE_INFINITY;
          const bx = b.approved_expires_at ? new Date(b.approved_expires_at).getTime() : Number.POSITIVE_INFINITY;
          return ax - bx;
        }
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [tabRequests, search, sortBy]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-wide flex items-center gap-2">
            <FileDown className="h-6 w-6" /> {isManager ? "My Export Requests" : "Export Requests"}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            {isManager
              ? "Choose your filters and submit a request. Once an admin approves, download from the Approved tab (within 24 hours)."
              : "Review and approve manager-initiated transaction exports."}
          </p>
        </div>
        {!isManager && (
          <Button size="sm" variant="outline" onClick={runSweep}>
            <Clock className="h-4 w-4 mr-1" /> Sweep expired
          </Button>
        )}
      </div>

      {/* Top panel: admin = direct download; manager = request submission */}
      <TransactionExportPanel mode={isManager ? "request" : "download"} />

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all capitalize ${
              tab === t
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {t}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
              tab === t ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {counts[t] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isManager ? "Search your requests…" : "Search by manager name or email…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Newest created first</SelectItem>
            <SelectItem value="created_asc">Oldest created first</SelectItem>
            <SelectItem value="expiry_asc">Expiring soonest</SelectItem>
            <SelectItem value="expiry_desc">Expiring latest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          {tabRequests.length === 0
            ? tab === "all" ? "No export requests yet." : `No ${tab} export requests.`
            : "No requests match your search."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const expired = req.approved_expires_at
              ? new Date(req.approved_expires_at).getTime() <= Date.now()
              : false;
            const canDownload =
              isManager &&
              req.status === "approved" &&
              !expired &&
              req.filters &&
              typeof req.filters === "object" &&
              "from" in req.filters;

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${statusBadge[req.status]} capitalize`}>
                        {req.status === "pending" && <Clock className="inline h-3 w-3 mr-1" />}
                        {req.status === "approved" && <CheckCircle className="inline h-3 w-3 mr-1" />}
                        {req.status === "rejected" && <XCircle className="inline h-3 w-3 mr-1" />}
                        {req.status}
                      </span>
                      <span className="text-sm font-semibold capitalize">{req.export_type} export</span>
                      {req.row_count != null && (
                        <span className="text-xs text-muted-foreground">{req.row_count} rows</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      {!isManager && (
                        <span className="flex items-center gap-1 text-foreground font-medium">
                          <User className="h-3 w-3" /> {req.manager?.name || req.manager?.username || "Manager"}
                          {req.manager?.username && (
                            <span className="text-muted-foreground font-normal">@{req.manager.username}</span>
                          )}
                          {req.manager?.email && (
                            <span className="text-muted-foreground font-normal">• {req.manager.email}</span>
                          )}
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Requested {new Date(req.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Admin actions on pending */}
                    {!isManager && req.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => approve(req)}
                          disabled={processing === req.id}
                          className="gradient-bg"
                        >
                          {processing === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setRejectModal(req); setRejectNote(""); }}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}

                    {!isManager && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Delete this export request record?")) return;
                          try {
                            await api.delete(`/admin/export-requests/${req.id}`);
                            toast({ title: "Export request deleted" });
                            fetchRequests();
                          } catch (e: any) {
                            toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete Request"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Manager download actions on approved */}
                    {canDownload && (() => {
                      const csvBusy = downloading?.id === req.id && downloading.format === "csv";
                      const pdfBusy = downloading?.id === req.id && downloading.format === "pdf";
                      const anyBusy = downloading?.id === req.id;
                      return (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(req, "csv")}
                            disabled={anyBusy}
                          >
                            {csvBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <FileSpreadsheet className="h-4 w-4 mr-1" />
                            )}
                            {csvBusy ? "Preparing…" : "CSV"}
                          </Button>
                          <Button
                            size="sm"
                            className="gradient-bg"
                            onClick={() => handleDownload(req, "pdf")}
                            disabled={anyBusy}
                          >
                            {pdfBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <FileText className="h-4 w-4 mr-1" />
                            )}
                            {pdfBusy ? "Preparing…" : "PDF"}
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="text-xs bg-muted/30 rounded p-2 flex items-start gap-2">
                  <Filter className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                  <FilterSummary filters={req.filters} />
                </div>

                {req.reason && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Reason:</span> {req.reason}
                  </div>
                )}

                {req.admin_note && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Admin note:</span> {req.admin_note}
                  </div>
                )}

                {req.status === "approved" && req.approved_expires_at && (
                  <div className={`text-xs ${expired ? "text-destructive" : "text-green-400"}`}>
                    {expired ? "Download window expired at: " : "Download window expires: "}
                    {new Date(req.approved_expires_at).toLocaleString()}
                    {expired && " — submit a new request to download."}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={!!rejectModal} onOpenChange={(o) => !o && setRejectModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Export Request</DialogTitle>
            <DialogDescription>Provide a reason. The manager will be notified.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Reason for rejection"
            rows={4}
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={processing === rejectModal?.id}>
              {processing === rejectModal?.id && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminExportRequests;
