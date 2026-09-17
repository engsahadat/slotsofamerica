import { useEffect, useState, useRef } from "react";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  Database, Download, Upload, Trash2, RotateCcw, FileDown, Loader2,
  Shield, Clock, HardDrive, Image as ImageIcon, FolderUp, CheckCircle2, AlertCircle,
  Users, ChevronDown, Settings2, Info, Zap,
} from "lucide-react";

type BackupJob = {
  id: number;
  type: string;
  format: string;
  scope: string;
  status: string;
  size_bytes: number | null;
  storage_path: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  meta: { restored_tables?: { table: string; rows: number }[]; skipped?: string[]; files?: number; truncated?: boolean } | null;
};

type DownloadLog = {
  id: number;
  backup_id: number;
  admin_id: number;
  ip: string | null;
  created_at: string;
  admin?: { id: number; name: string; username: string } | null;
};

type RecoveryConfig = {
  id: number;
  site_url: string | null;
  frontend_url: string | null;
  support_email: string | null;
  notes: string | null;
  updated_at: string;
};

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-blue-500/15 text-blue-600",
    success: "bg-emerald-500/15 text-emerald-600",
    failed: "bg-destructive/15 text-destructive",
    expired: "bg-muted text-muted-foreground",
  };
  return <Badge className={map[status] ?? ""} variant="secondary">{status}</Badge>;
}

/** Fetches an authenticated endpoint as a blob and triggers a browser download —
 * carries the JWT via the shared axios instance's interceptor, unlike a plain
 * `window.open()`/unauthenticated `fetch()`. */
async function downloadBlobFrom(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

export default function AdminBackups() {
  const { role } = useAuth();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [downloads, setDownloads] = useState<DownloadLog[]>([]);
  const [config, setConfig] = useState<RecoveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupJob | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const restoreUploadRef = useRef<HTMLInputElement>(null);
  const storageImportRef = useRef<HTMLInputElement>(null);

  if (role && role !== "admin") return <Navigate to="/admin/dashboard" replace />;

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/backups");
      setJobs(res.data?.backups ?? []);
      setDownloads(res.data?.downloads ?? []);
      setConfig(res.data?.recovery_config ?? null);
    } catch (e: any) {
      toast({ title: "Failed to load backups", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const isRunning = jobs.some((j) => j.status === "running" && j.type === "full");

  async function startFullBackup() {
    if (isRunning) {
      toast({ title: "A backup is already in progress" });
      return;
    }
    setBusy("create");
    try {
      const res = await api.post("/admin/backups");
      if (!res.data?.success) throw new Error(res.data?.message ?? "Backup failed");
      toast({
        title: res.data.already_running ? "Backup already running" : "Backup created",
        description: res.data.already_running ? "Please wait for it to finish." : "Your backup is ready to download.",
      });
      load();
    } catch (e: any) {
      toast({ title: "Backup failed to start", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function downloadLatest() {
    if (!lastSuccess) {
      toast({ title: "No backup available yet", description: "Click Create Backup to generate one.", variant: "destructive" });
      return;
    }
    await downloadBackup(lastSuccess.id);
  }

  async function downloadBackup(id: number) {
    setBusy(`dl-${id}`);
    try {
      await downloadBlobFrom(`/admin/backups/${id}/download`, `backup-${id}.zip`);
    } catch (e: any) {
      toast({ title: "Download failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function deleteBackup(id: number) {
    if (!confirm("Delete this backup permanently?")) return;
    setBusy(`del-${id}`);
    try {
      const res = await api.delete(`/admin/backups/${id}`);
      if (!res.data?.success) throw new Error(res.data?.message ?? "Failed");
      toast({ title: "Backup deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function emergencyExport() {
    setBusy("emergency");
    try {
      await downloadBlobFrom("/admin/backups/customers/export?format=csv&scope=emergency", `customers-emergency-${Date.now()}.csv`);
    } catch (e: any) {
      toast({ title: "Export failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function exportStorage() {
    setBusy("storage-export");
    try {
      const res = await api.post("/admin/backups/storage/export");
      if (!res.data?.success) throw new Error(res.data?.message ?? "Failed");
      toast({
        title: "Storage exported",
        description: `${res.data.files} files (${formatBytes(res.data.size_bytes)})${res.data.truncated ? " — truncated (over size cap)" : ""}`,
      });
      await downloadBlobFrom(`/admin/backups/${res.data.backup_id}/download`, `storage-export-${Date.now()}.zip`);
      load();
    } catch (e: any) {
      toast({ title: "Storage export failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function importStorage(file: File) {
    setBusy("storage-import");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/admin/backups/storage/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (!res.data?.success) throw new Error(res.data?.message ?? "Import failed");
      toast({ title: "Storage imported", description: `Restored ${res.data.restored} files${res.data.errors?.length ? `, ${res.data.errors.length} errors` : ""}` });
      load();
    } catch (e: any) {
      toast({ title: "Storage import failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function testRestore(id: number) {
    setBusy(`test-${id}`);
    try {
      const res = await api.post(`/admin/backups/${id}/restore`, { dry_run: true });
      if (!res.data?.success) throw new Error(res.data?.message ?? "Failed");
      const i = res.data.integrity;
      toast({
        title: "Integrity check passed",
        description: `${i.database_tables_in_zip} tables, ${i.database_rows_total} rows, ${i.storage_files_in_zip} files${i.missing_required_tables?.length ? ` — missing tables: ${i.missing_required_tables.join(", ")}` : ""}`,
      });
    } catch (e: any) {
      toast({ title: "Integrity check failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function downloadEnvSnapshot() {
    setBusy("env");
    try {
      await downloadBlobFrom("/admin/backups/env-snapshot", `recovery-config-${Date.now()}.json`);
    } catch (e: any) {
      toast({ title: "Failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function saveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy("config");
    const patch = {
      site_url: String(fd.get("site_url") ?? "").trim() || null,
      support_email: String(fd.get("support_email") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    try {
      await api.post("/admin/recovery-config", patch);
      toast({ title: "Saved" });
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  function openRestoreFromJob(job: BackupJob) {
    setRestoreTarget(job);
    setRestoreFile(null);
    setRestoreConfirm("");
    setRestoreOpen(true);
  }

  function openRestoreFromUpload() {
    setRestoreTarget(null);
    setRestoreFile(null);
    setRestoreConfirm("");
    setRestoreOpen(true);
    setTimeout(() => restoreUploadRef.current?.click(), 50);
  }

  async function confirmRestore() {
    if (restoreConfirm !== "RESTORE") {
      toast({ title: "Type RESTORE to confirm", variant: "destructive" });
      return;
    }
    setBusy("restore");
    try {
      let res;
      if (restoreTarget) {
        res = await api.post(`/admin/backups/${restoreTarget.id}/restore`, { dry_run: false });
      } else if (restoreFile) {
        const fd = new FormData();
        fd.append("file", restoreFile);
        fd.append("dry_run", "0");
        res = await api.post("/admin/backups/restore-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        throw new Error("Select a backup or upload a file");
      }
      if (!res.data?.success) throw new Error(res.data?.message ?? "Restore failed");
      toast({ title: "Restore complete", description: `Restored ${res.data.restored_tables?.length ?? 0} tables` });
      setRestoreOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Restore failed", description: errMsg(e, "Unknown error"), variant: "destructive" });
    } finally { setBusy(null); }
  }

  const successfulFulls = jobs.filter((j) => j.type === "full" && j.status === "success");
  const lastSuccess = successfulFulls[0] ?? null;
  const totalSize = successfulFulls.reduce((acc, j) => acc + (j.size_bytes ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Backup &amp; Recovery</h1>
          <p className="text-sm text-muted-foreground">
            One ZIP holds everything. Download it, keep a copy safe, upload it back to restore.
          </p>
        </div>
      </header>

      {busy === "create" && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Creating backup…</AlertTitle>
          <AlertDescription>This may take a moment for larger datasets. Please don't close this tab.</AlertDescription>
        </Alert>
      )}

      {/* Status panel */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Clock className="h-4 w-4" />Last successful backup</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-40" />
              : <div className="text-lg font-semibold">{lastSuccess ? new Date(lastSuccess.created_at).toLocaleString() : "Never"}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Database className="h-4 w-4" />Stored backups</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-20" /> : <div className="text-lg font-semibold">{successfulFulls.length} <span className="text-sm font-normal text-muted-foreground">/ 2 kept</span></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><HardDrive className="h-4 w-4" />Storage used</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-lg font-semibold">{formatBytes(totalSize)}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Primary action cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Full backup */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <CardTitle className="mt-2">Full Platform Backup</CardTitle>
            <CardDescription>
              Download the latest backup instantly, or create a fresh one now.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-2">
            <Button
              className="w-full"
              onClick={downloadLatest}
              disabled={!lastSuccess || busy?.startsWith("dl-")}
            >
              {busy?.startsWith("dl-") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Download Latest Backup
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={startFullBackup}
              disabled={busy === "create" || isRunning}
            >
              {busy === "create" || isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {isRunning ? "Backup in progress…" : "Create New Backup"}
            </Button>
          </CardContent>
        </Card>

        {/* Restore */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Upload className="h-5 w-5" />
            </div>
            <CardTitle className="mt-2">Restore Platform</CardTitle>
            <CardDescription>
              Upload a backup ZIP file to restore your platform data.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button variant="outline" className="w-full" onClick={openRestoreFromUpload} disabled={!!busy}>
              <Upload className="h-4 w-4" />
              Restore From Backup
            </Button>
          </CardContent>
        </Card>

        {/* Customer export */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <CardTitle className="mt-2">Emergency Customer Export</CardTitle>
            <CardDescription>
              Download customer contact list only for emergency communication.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button variant="outline" className="w-full" onClick={emergencyExport} disabled={busy === "emergency"}>
              {busy === "emergency" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download Customer List
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Recommended</AlertTitle>
        <AlertDescription>
          Download the ZIP backup regularly and keep a copy on your local computer or cloud drive.
          Only the latest 2 full backups are kept on the server — older files are automatically removed by the retention policy.
        </AlertDescription>
      </Alert>

      {/* Advanced options */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Advanced Options</CardTitle>
                  <CardDescription>Storage-only export/import, environment snapshot</CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="flex flex-wrap gap-3 pt-0">
              <Button variant="outline" onClick={exportStorage} disabled={busy === "storage-export"}>
                {busy === "storage-export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                Export Storage
              </Button>
              <Button variant="outline" onClick={() => storageImportRef.current?.click()} disabled={busy === "storage-import"}>
                {busy === "storage-import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
                Import Storage
              </Button>
              <input
                ref={storageImportRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importStorage(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={downloadEnvSnapshot} disabled={busy === "env"}>
                {busy === "env" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Download Env Snapshot
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
          <CardDescription>
            Only the latest 2 full backups are stored. Older rows remain as records but their files have been removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
                {!loading && jobs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No backups yet.</TableCell></TableRow>
                )}
                {!loading && jobs.map((j) => {
                  const isExpired = j.status === "expired";
                  const isDownloadable = j.type === "full" && j.status === "success";
                  return (
                    <TableRow key={j.id}>
                      <TableCell className="whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{j.type}</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell>
                        {isExpired
                          ? <span className="text-xs text-muted-foreground">File expired / removed by retention policy</span>
                          : formatBytes(j.size_bytes)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isDownloadable && (
                            <>
                              <Button size="sm" variant="ghost" title="Download" onClick={() => downloadBackup(j.id)} disabled={busy === `dl-${j.id}`}>
                                {busy === `dl-${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" title="Test integrity" onClick={() => testRestore(j.id)} disabled={busy === `test-${j.id}`}>
                                {busy === `test-${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" title="Restore" onClick={() => openRestoreFromJob(j)} disabled={!!busy}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteBackup(j.id)} disabled={busy === `del-${j.id}`}>
                            {busy === `del-${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Restore report */}
      {(() => {
        const lastRestore = jobs.find((j) => j.type === "restore" && j.status === "success");
        if (!lastRestore) return null;
        const m = lastRestore.meta ?? {};
        const restoredTables = m.restored_tables ?? [];
        const skipped = m.skipped ?? [];
        const totalRows = restoredTables.reduce((a, t) => a + t.rows, 0);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Last Restore Report
              </CardTitle>
              <CardDescription>
                Restored on {new Date(lastRestore.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>Tables restored: <span className="font-mono">{restoredTables.length}</span></div>
              <div>Tables skipped: <span className="font-mono">{skipped.length}</span></div>
              <div className="md:col-span-2 text-muted-foreground">Total rows restored: {totalRows}</div>
              {skipped.length > 0 && (
                <div className="md:col-span-2 flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Skipped (protected or unrecognized tables): {skipped.join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Recovery config */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery Config</CardTitle>
          <CardDescription>Used when restoring or moving to a new domain.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !config ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <form onSubmit={saveConfig} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Site URL</Label>
                <Input name="site_url" defaultValue={config.site_url ?? ""} placeholder="https://example.com" />
              </div>
              <div className="space-y-1">
                <Label>Support Email</Label>
                <Input name="support_email" type="email" defaultValue={config.support_email ?? ""} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input name="notes" defaultValue={config.notes ?? ""} placeholder="Operational notes" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy === "config"}>
                  {busy === "config" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Download audit log */}
      <Card>
        <CardHeader>
          <CardTitle>Download Audit Log</CardTitle>
          <CardDescription>Last 50 backup downloads.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Backup ID</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {downloads.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No downloads yet.</TableCell></TableRow>
                )}
                {downloads.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{new Date(d.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">#{d.backup_id}</TableCell>
                    <TableCell className="text-xs">{d.admin?.username ?? d.admin?.name ?? `#${d.admin_id}`}</TableCell>
                    <TableCell>{d.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore From Backup</DialogTitle>
            <DialogDescription>
              Restoring will overwrite current platform data. Please download a backup first.
              Type <strong>RESTORE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {restoreTarget ? (
              <div className="rounded border p-3 text-sm">
                Restoring backup from <strong>{new Date(restoreTarget.created_at).toLocaleString()}</strong> ({formatBytes(restoreTarget.size_bytes)}).
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Upload Backup ZIP</Label>
                <Input
                  ref={restoreUploadRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
                {restoreFile && (
                  <p className="text-xs text-muted-foreground">{restoreFile.name} ({formatBytes(restoreFile.size)})</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label>Confirmation</Label>
              <Input
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder="Type RESTORE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={busy === "restore"}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmRestore}
              disabled={busy === "restore" || restoreConfirm !== "RESTORE" || (!restoreTarget && !restoreFile)}
            >
              {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
