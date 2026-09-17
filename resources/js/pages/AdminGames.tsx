import { useState, useEffect, Fragment, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, X, Gamepad2, Search, Pencil, Trash2, Loader2, Upload, ChevronLeft, ChevronRight, Globe, ExternalLink, Download, FileUp, ToggleLeft } from "lucide-react";

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49 192.5-49 30.7 0 107.9 2.6 165.2 70.3zm-234.5-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
    </svg>
  );
}

function GooglePlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l2.7 1.6 248-248v-5.8L47 0zm282.1 301.8l-83.6-83.6v-5.5l84-84 .7.4 99.1 56.3c28.2 16 28.2 42.2 0 58.2l-100.2 58.2zM44.3 484.7L291.6 237.4l60.7 60.7L104.8 511.5l-2.7 1.6c-13 6.8-28.5 5.4-57.8-28.4z"/>
    </svg>
  );
}

import { uploadFile } from "@/lib/uploadFile";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Game {
  id: string;
  name: string;
  username_suffix: string | null;
  description: string | null;
  download_url: string | null;
  web_url: string | null;
  ios_url: string | null;
  android_url: string | null;
  image_url: string | null;
  is_active: boolean;
}

const GAMES_PAGE_SIZE = 10;

const AdminGames = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  // Game CRUD modal
  const [gameModal, setGameModal] = useState<{ mode: "add" | "edit"; game?: Game } | null>(null);
  const [gameName, setGameName] = useState("");
  const [gameUsernameSuffix, setGameUsernameSuffix] = useState("");
  const [gameDescription, setGameDescription] = useState("");
  const [gameDownloadUrl, setGameDownloadUrl] = useState("");
  const [gameWebUrl, setGameWebUrl] = useState("");
  const [gameIosUrl, setGameIosUrl] = useState("");
  const [gameAndroidUrl, setGameAndroidUrl] = useState("");
  const [gameImageUrl, setGameImageUrl] = useState("");
  const [gameImageFile, setGameImageFile] = useState<File | null>(null);
  const [gameImagePreview, setGameImagePreview] = useState<string | null>(null);
  const [gameSaving, setGameSaving] = useState(false);
  const [gameErrors, setGameErrors] = useState<Record<string, string>>({});

  // Delete game confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Game | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkToggleConfirm, setBulkToggleConfirm] = useState<"activate" | "deactivate" | null>(null);
  const [bulkToggling, setBulkToggling] = useState(false);

  const fetchGames = useCallback(async () => {
    const res = await api.get("/admin/games");
    const gamesData = (res.data?.games || []) as Game[];

    const sorted = [...gamesData].sort((a, b) => a.name.localeCompare(b.name));
    setGames(sorted);
    setSelectedGame((prev) => prev ? sorted.find((g) => g.id === prev.id) || null : null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchGames(); }, [fetchGames]);

  const [page, setPage] = useState(1);

  const filtered = games.filter((g) => {
    const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? g.is_active : !g.is_active);
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / GAMES_PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * GAMES_PAGE_SIZE, page * GAMES_PAGE_SIZE);

  // ── Game CRUD ──
  const openAddGame = () => {
    setGameName(""); setGameUsernameSuffix(""); setGameDescription(""); setGameDownloadUrl("");
    setGameWebUrl(""); setGameIosUrl(""); setGameAndroidUrl("");
    setGameImageUrl(""); setGameImageFile(null); setGameImagePreview(null);
    setGameErrors({});
    setGameModal({ mode: "add" });
  };

  const openEditGame = (game: Game) => {
    setGameName(game.name); setGameUsernameSuffix(game.username_suffix || ""); setGameDescription(game.description || "");
    setGameDownloadUrl(game.download_url || ""); setGameWebUrl(game.web_url || "");
    setGameIosUrl(game.ios_url || ""); setGameAndroidUrl(game.android_url || "");
    setGameImageUrl(game.image_url || ""); setGameImageFile(null);
    setGameImagePreview(game.image_url || null);
    setGameErrors({});
    setGameModal({ mode: "edit", game });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please select an image file", variant: "destructive" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image must be under 5MB", variant: "destructive" }); return; }
    setGameImageFile(file);
    setGameImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    return uploadFile(file, "game-images");
  };

  const handleSaveGame = async () => {
    const errs: Record<string, string> = {};
    if (!gameName.trim()) errs.name = "Game name is required";
    if (gameUsernameSuffix.trim() && !/^[a-zA-Z0-9]{1,10}$/.test(gameUsernameSuffix.trim())) {
      errs.username_suffix = "Suffix must be 1-10 letters/numbers only (e.g. \"GV\", \"JW\")";
    }
    if (Object.keys(errs).length > 0) {
      setGameErrors(errs);
      return;
    }
    setGameErrors({});
    setGameSaving(true);
    try {
      let finalImageUrl = gameImageUrl.trim() || null;
      if (gameImageFile) finalImageUrl = await uploadImage(gameImageFile);

      const payload = {
        name: gameName.trim(),
        username_suffix: gameUsernameSuffix.trim().toUpperCase() || null,
        description: gameDescription.trim() || null,
        download_url: gameDownloadUrl.trim() || null,
        web_url: gameWebUrl.trim() || null,
        ios_url: gameIosUrl.trim() || null,
        android_url: gameAndroidUrl.trim() || null,
        image_url: finalImageUrl,
      };

      if (gameModal?.mode === "add") {
        await api.post("/admin/games", payload);
        toast({ title: "Game Added", description: `${gameName} has been added.` });
      } else if (gameModal?.mode === "edit" && gameModal.game) {
        await api.put(`/admin/games/${gameModal.game.id}`, payload);
        toast({ title: "Game Updated", description: `${gameName} has been updated.` });
      }
      setGameModal(null);
      fetchGames();
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const sErrors: Record<string, string> = {};
        Object.entries(err.response.data.errors).forEach(([k, v]: [string, any]) => {
          sErrors[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setGameErrors(sErrors);
      } else {
        toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
      }
    } finally {
      setGameSaving(false);
    }
  };

  const handleDeleteGame = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/games/${deleteConfirm.id}`);
      toast({ title: "Game Deleted", description: `${deleteConfirm.name} has been removed.` });
      setDeleteConfirm(null);
      fetchGames();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((g) => g.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      // No bulk-delete endpoint exists; delete each game individually via the existing route.
      await Promise.all(Array.from(selectedIds).map((id) => api.delete(`/admin/games/${id}`)));
      toast({ title: "Games Deleted", description: `${selectedIds.size} game(s) removed.` });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      fetchGames();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkToggle = async () => {
    if (selectedIds.size === 0 || !bulkToggleConfirm) return;
    setBulkToggling(true);
    try {
      const newStatus = bulkToggleConfirm === "activate";
      // No bulk-update endpoint exists; update each game individually via the existing route.
      await Promise.all(Array.from(selectedIds).map((id) => api.put(`/admin/games/${id}`, { is_active: newStatus })));
      toast({ title: newStatus ? "Games Activated" : "Games Deactivated", description: `${selectedIds.size} game(s) updated.` });
      setSelectedIds(new Set());
      setBulkToggleConfirm(null);
      fetchGames();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setBulkToggling(false);
    }
  };
  const [exporting, setExporting] = useState(false);

  const imageUrlToBase64 = async (url: string): Promise<string | null> => {
    try {
      // Images are served directly from this app's own /upload endpoint (same-origin), so a
      // plain fetch is all that's needed.
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return null;
      const blob = await res.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob!);
      });
    } catch { return null; }
  };

  const handleExportGames = async () => {
    if (games.length === 0) {
      toast({ title: "No games to export", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const exported = await Promise.all(
        games.map(async (game) => {
          let image_base64: string | null = null;
          if (game.image_url) {
            image_base64 = await imageUrlToBase64(game.image_url);
          }
          return {
            name: game.name,
            username_suffix: game.username_suffix,
            description: game.description,
            download_url: game.download_url,
            web_url: game.web_url,
            ios_url: game.ios_url,
            android_url: game.android_url,
            is_active: game.is_active,
            image_base64,
          };
        })
      );

      const json = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), games: exported }, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `games-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: `${exported.length} game(s) exported with images.` });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Import Games ──
  const [importing, setImporting] = useState(false);

  const base64ToFile = (base64: string, filename: string): File => {
    const [header, data] = base64.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  };

  const handleImportGames = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.games || !Array.isArray(data.games)) throw new Error("Invalid export file format");

      let imported = 0;
      let skipped = 0;

      for (const game of data.games) {
        if (!game.name?.trim()) { skipped++; continue; }

        // Check if game with same name already exists
        const existing = games.find((g) => g.name.toLowerCase() === game.name.trim().toLowerCase());
        if (existing) { skipped++; continue; }

        let image_url: string | null = null;
        if (game.image_base64) {
          try {
            const ext = game.image_base64.match(/data:image\/(.*?);/)?.[1] || "png";
            const imgFile = base64ToFile(game.image_base64, `import-${crypto.randomUUID()}.${ext}`);
            image_url = await uploadImage(imgFile);
          } catch { /* skip image if upload fails */ }
        }

        try {
          await api.post("/admin/games", {
            name: game.name.trim(),
            username_suffix: game.username_suffix || null,
            description: game.description || null,
            download_url: game.download_url || null,
            web_url: game.web_url || null,
            ios_url: game.ios_url || null,
            android_url: game.android_url || null,
            image_url,
            is_active: game.is_active ?? true,
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      await fetchGames();
      toast({
        title: "Import Complete",
        description: `${imported} game(s) imported${skipped > 0 ? `, ${skipped} skipped (duplicates or errors)` : ""}.`,
      });
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Game Management</h1>
          <p className="text-muted-foreground mt-1">Manage game platforms and their settings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportGames}
            disabled={exporting || games.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
          <label className={`inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Import
            <input type="file" accept=".json" onChange={handleImportGames} className="hidden" disabled={importing} />
          </label>
          <button
            onClick={openAddGame}
            className="inline-flex items-center gap-2 rounded-lg gradient-bg px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add Game
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text" placeholder="Search games..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-input bg-muted/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as "all" | "active" | "inactive"); setPage(1); }}
          className="rounded-lg border border-input bg-muted/50 py-2.5 px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
          <button
            onClick={() => setBulkToggleConfirm("activate")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <ToggleLeft className="h-3.5 w-3.5" />
            Activate
          </button>
          <button
            onClick={() => setBulkToggleConfirm("deactivate")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <ToggleLeft className="h-3.5 w-3.5" />
            Deactivate
          </button>
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Games table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pl-4 pr-1 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && paginated.every((g) => selectedIds.has(g.id))}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Game</th>
                <th className="px-6 py-3 font-medium text-center">Platforms</th>
                <th className="px-6 py-3 font-medium text-center">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    {search ? "No games match your search." : "No games yet. Add one above."}
                  </td>
                </tr>
              ) : (
                paginated.map((game) => (
                  <Fragment key={game.id}>
                    <tr className={`cursor-pointer hover:bg-muted/20 transition-colors ${selectedIds.has(game.id) ? "bg-primary/5" : ""}`} onClick={() => setSelectedGame(game)}>
                      <td className="pl-4 pr-1 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(game.id)}
                          onChange={() => toggleSelect(game.id)}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {game.image_url ? (
                            <img src={game.image_url} alt={game.name} className="h-9 w-9 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                              <Gamepad2 className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-foreground">{game.name}</span>
                            {game.username_suffix && (
                              <span className="ml-2 text-[10px] font-mono rounded-full bg-primary/10 text-primary px-1.5 py-0.5" title="Username suffix">
                                {game.username_suffix}
                              </span>
                            )}
                            {!game.is_active && (
                              <span className="ml-2 text-[10px] rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5">Inactive</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Globe className={`h-3.5 w-3.5 ${game.web_url ? "text-primary opacity-90" : "text-muted-foreground/25"}`} />
                          <AppleIcon className={`h-3.5 w-3.5 ${game.ios_url ? "text-foreground opacity-80" : "text-muted-foreground/25"}`} />
                          <GooglePlayIcon className={`h-3.5 w-3.5 ${game.android_url ? "text-green-400 opacity-90" : "text-muted-foreground/25"}`} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={async () => {
                            const newActive = !game.is_active;
                            try {
                              await api.put(`/admin/games/${game.id}`, { is_active: newActive });
                              toast({ title: newActive ? "Game Activated" : "Game Deactivated" });
                              fetchGames();
                            } catch (err: any) {
                              toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${game.is_active ? "bg-green-500" : "bg-muted-foreground/30"}`}
                          title={game.is_active ? "Click to deactivate" : "Click to activate"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${game.is_active ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditGame(game); }}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Edit game"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(game); }}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Delete game"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * GAMES_PAGE_SIZE + 1}{"\u2013"}{Math.min(page * GAMES_PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Game Detail Modal ── */}
      <Dialog open={!!selectedGame} onOpenChange={(open) => !open && setSelectedGame(null)}>
        <DialogContent className="sm:max-w-lg border-border bg-card max-h-[85vh] overflow-y-auto">
          {selectedGame && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedGame.image_url ? (
                    <img src={selectedGame.image_url} alt={selectedGame.name} className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                      <Gamepad2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div>
                    <span>{selectedGame.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${selectedGame.is_active ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"}`}>
                        {selectedGame.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="mt-5 space-y-4">
                {selectedGame.image_url && (
                  <div className="rounded-xl overflow-hidden border border-border">
                    <img src={selectedGame.image_url} alt={selectedGame.name} className="w-full h-36 object-cover" />
                  </div>
                )}

                {selectedGame.description && (
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                    <p className="text-sm text-foreground">{selectedGame.description}</p>
                  </div>
                )}

                {/* Platform Links */}
                {(selectedGame.web_url || selectedGame.ios_url || selectedGame.android_url || selectedGame.download_url) && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Platform Links</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedGame.web_url && (
                        <a href={selectedGame.web_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                          <Globe className="h-3.5 w-3.5 text-primary" />
                          <span>Play Online</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        </a>
                      )}
                      {selectedGame.ios_url && (
                        <a href={selectedGame.ios_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                          <AppleIcon className="h-3.5 w-3.5 text-foreground" />
                          <span>App Store</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        </a>
                      )}
                      {selectedGame.android_url && (
                        <a href={selectedGame.android_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                          <GooglePlayIcon className="h-3.5 w-3.5 text-foreground" />
                          <span>Google Play</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        </a>
                      )}
                      {!selectedGame.web_url && !selectedGame.ios_url && !selectedGame.android_url && selectedGame.download_url && (
                        <a href={selectedGame.download_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                          <Globe className="h-3.5 w-3.5 text-primary" />
                          <span>Download</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setSelectedGame(null); openEditGame(selectedGame); }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Game
                  </button>
                  <button
                    onClick={() => { setSelectedGame(null); setDeleteConfirm(selectedGame); }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Game
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Game Modal ── */}
      <Dialog open={!!gameModal} onOpenChange={(v) => !v && setGameModal(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">
              {gameModal?.mode === "add" ? "Add New Game" : "Edit Game"}
            </DialogTitle>
            <DialogDescription>
              {gameModal?.mode === "add" ? "Add a new game platform." : `Edit ${gameModal?.game?.name}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveGame(); }} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Game Name *</label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => { setGameName(e.target.value); if (gameErrors.name) setGameErrors(p => ({ ...p, name: "" })); }}
                placeholder="Fire Kirin"
                className={`w-full rounded-lg border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
                  gameErrors.name ? "border-destructive focus:border-destructive" : "border-input focus:border-primary"
                }`}
              />
              {gameErrors.name && <p className="text-xs text-destructive font-medium mt-1">{gameErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Username Suffix</label>
              <input
                type="text"
                value={gameUsernameSuffix}
                onChange={(e) => { setGameUsernameSuffix(e.target.value); if (gameErrors.username_suffix) setGameErrors(p => ({ ...p, username_suffix: "" })); }}
                placeholder="GV"
                maxLength={10}
                className={`w-full rounded-lg border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors font-mono uppercase ${
                  gameErrors.username_suffix ? "border-destructive focus:border-destructive" : "border-input focus:border-primary"
                }`}
              />
              {gameErrors.username_suffix ? (
                <p className="text-xs text-destructive font-medium mt-1">{gameErrors.username_suffix}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Appended to a player's site username to build their game login, e.g. "john123" + "GV" → "john123GV". Leave
                  blank to auto-derive one from the game name.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <textarea value={gameDescription} onChange={(e) => setGameDescription(e.target.value)} placeholder="Optional description" rows={3}
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Web Portal URL</label>
              <input type="url" value={gameWebUrl} onChange={(e) => setGameWebUrl(e.target.value)} placeholder="https://play.example.com"
                className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">iOS URL</label>
                <input type="url" value={gameIosUrl} onChange={(e) => setGameIosUrl(e.target.value)} placeholder="https://apps.apple.com/..."
                  className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Android URL</label>
                <input type="url" value={gameAndroidUrl} onChange={(e) => setGameAndroidUrl(e.target.value)} placeholder="https://play.google.com/..."
                  className="w-full rounded-lg border border-input bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Game Image</label>
              {gameImagePreview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={gameImagePreview} alt="Preview" className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => { setGameImageFile(null); setGameImagePreview(null); setGameImageUrl(""); }}
                    className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Click to upload image (max 5MB)</span>
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
              )}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" type="button" onClick={() => setGameModal(null)} disabled={gameSaving}>Cancel</Button>
              <Button type="submit" disabled={gameSaving || !gameName.trim()} className="gradient-bg text-primary-foreground hover:opacity-90">
                {gameSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {gameModal?.mode === "add" ? "Add Game" : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Game Confirm ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Delete Game</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteGame} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Bulk Delete Confirm ── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={(v) => !v && setBulkDeleteConfirm(false)}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Delete {selectedIds.size} Game(s)</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> selected game(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete {selectedIds.size} Game(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Bulk Toggle Confirm ── */}
      <Dialog open={bulkToggleConfirm !== null} onOpenChange={(v) => !v && setBulkToggleConfirm(null)}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">
              {bulkToggleConfirm === "activate" ? "Activate" : "Deactivate"} {selectedIds.size} Game(s)
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {bulkToggleConfirm === "activate" ? "activate" : "deactivate"} <strong>{selectedIds.size}</strong> selected game(s)?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setBulkToggleConfirm(null)} disabled={bulkToggling}>Cancel</Button>
            <Button onClick={handleBulkToggle} disabled={bulkToggling}>
              {bulkToggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {bulkToggleConfirm === "activate" ? "Activate" : "Deactivate"} {selectedIds.size} Game(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGames;
