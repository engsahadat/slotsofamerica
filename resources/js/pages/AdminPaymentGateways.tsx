import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Loader2, Search, ToggleLeft, ToggleRight, Upload, X, ImageIcon, Download, FileUp, Copy, ChevronDown, ChevronUp, GripVertical, Link, MessageCircle, ExternalLink } from "lucide-react";
import { uploadFile } from "@/lib/uploadFile";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Gateway {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  qr_code_url: string | null;
  minimum_amount: number;
  instructions: string | null;
  is_active: boolean;
  deep_link: string | null;
  // Eager-loaded by AdminPaymentGatewayApiController@index — used by Duplicate/Export so the
  // rotating "Manage Accounts" list travels with the gateway instead of being silently dropped.
  accounts?: GatewayAccount[];
}

interface GatewayAccount {
  id: string;
  gateway_id: string;
  account_name: string;
  account_number: string;
  deep_link: string | null;
  qr_code_url: string | null;
  is_active: boolean;
  priority_order: number;
}

const AdminPaymentGateways = () => {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal state
  const [modal, setModal] = useState<{ mode: "add" | "edit"; gateway?: Gateway } | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [buttonAction, setButtonAction] = useState<"none" | "open_app" | "chat_support">("none");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [minimumAmount, setMinimumAmount] = useState("10");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accErrors, setAccErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Gateway | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkToggleConfirm, setBulkToggleConfirm] = useState<"activate" | "deactivate" | null>(null);
  const [bulkToggling, setBulkToggling] = useState(false);

  // Import/Export
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Accounts management
  const [accountsGatewayId, setAccountsGatewayId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountModal, setAccountModal] = useState<{ mode: "add" | "edit"; account?: GatewayAccount } | null>(null);
  const [accName, setAccName] = useState("");
  const [accNumber, setAccNumber] = useState("");
  const [accDeepLink, setAccDeepLink] = useState("");
  const [accButtonAction, setAccButtonAction] = useState<"none" | "open_app" | "chat_support">("none");
  const [accQrFile, setAccQrFile] = useState<File | null>(null);
  const [accQrPreview, setAccQrPreview] = useState("");
  const [accPriority, setAccPriority] = useState("0");
  const [savingAccount, setSavingAccount] = useState(false);
  const accQrInputRef = useRef<HTMLInputElement>(null);

  const fetchGateways = useCallback(async () => {
    const res = await api.get("/admin/payment-gateways");
    const data = ((res.data?.gateways || []) as Gateway[]).slice().sort((a, b) => a.name.localeCompare(b.name));
    setGateways(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => { fetchGateways(); }, [fetchGateways]);

  const fetchAccounts = useCallback(async (gatewayId: string) => {
    setLoadingAccounts(true);
    // AdminPaymentGatewayApiController@index already eager-loads each gateway's `accounts`; there is
    // no separate GET endpoint for a single gateway's account list, so the full list is refetched
    // and the relevant gateway's accounts are read from it.
    const data = await fetchGateways();
    const gw = (data as any[]).find((g) => g.id === gatewayId);
    const accts = ((gw?.accounts || []) as GatewayAccount[]).slice().sort((a, b) => a.priority_order - b.priority_order);
    setAccounts(accts);
    setLoadingAccounts(false);
  }, [fetchGateways]);

  const filtered = gateways.filter((g) => {
    const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? g.is_active : !g.is_active);
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((g) => g.id)));
  };

  const deriveButtonAction = (dl: string | null): "none" | "open_app" | "chat_support" => {
    if (!dl) return "none";
    if (dl === "__chat_support__") return "chat_support";
    return "open_app";
  };

  const openAdd = () => {
    setName(""); setAddress(""); setDeepLink(""); setButtonAction("none"); setQrCodeUrl(""); setQrFile(null); setQrPreview("");
    setLogoFile(null); setLogoPreview(""); setLogoUrl("");
    setMinimumAmount("10"); setInstructions("");
    setErrors({});
    setModal({ mode: "add" });
  };

  const openEdit = (gw: Gateway) => {
    setName(gw.name); setAddress(gw.address); setDeepLink(gw.deep_link === "__chat_support__" ? "" : (gw.deep_link || ""));
    setButtonAction(deriveButtonAction(gw.deep_link));
    setQrCodeUrl(gw.qr_code_url || ""); setQrFile(null); setQrPreview(gw.qr_code_url || "");
    setLogoFile(null); setLogoPreview(gw.logo_url || ""); setLogoUrl(gw.logo_url || "");
    setMinimumAmount(String(gw.minimum_amount)); setInstructions(gw.instructions || "");
    setErrors({});
    setModal({ mode: "edit", gateway: gw });
  };

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) { toast({ title: "Please select an image file", variant: "destructive" }); return; }
    setQrFile(file); setQrPreview(URL.createObjectURL(file));
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) { toast({ title: "Please select an image file", variant: "destructive" }); return; }
    setLogoFile(file); setLogoPreview(URL.createObjectURL(file));
  };

  const removeQr = () => { setQrFile(null); setQrPreview(""); setQrCodeUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const removeLogo = () => { setLogoFile(null); setLogoPreview(""); setLogoUrl(""); if (logoInputRef.current) logoInputRef.current.value = ""; };

  const uploadImage = async (file: File, _folder: string): Promise<string> => {
    return uploadFile(file, "gateway-qr");
  };

  const handleSave = async () => {
    const fieldErrors: Record<string, string> = {};
    if (!name.trim()) fieldErrors.name = "Name is required";
    if (!address.trim()) fieldErrors.address = "Address / Username / Email is required";
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      let finalQrUrl: string | null = qrCodeUrl.trim() || null;
      let finalLogoUrl: string | null = logoUrl.trim() || null;
      if (qrFile) finalQrUrl = await uploadImage(qrFile, "");
      if (logoFile) finalLogoUrl = await uploadImage(logoFile, "logos/");

      const finalDeepLink = buttonAction === "chat_support" ? "__chat_support__" : (buttonAction === "open_app" ? (deepLink.trim() || null) : null);

      const payload = {
        name: name.trim(), address: address.trim(), qr_code_url: finalQrUrl, logo_url: finalLogoUrl,
        minimum_amount: parseFloat(minimumAmount) || 10, instructions: instructions.trim() || null,
        deep_link: finalDeepLink,
      };
      if (modal?.mode === "add") {
        await api.post("/admin/payment-gateways", payload);
        toast({ title: "Payment gateway added" });
      } else if (modal?.mode === "edit" && modal.gateway) {
        await api.put(`/admin/payment-gateways/${modal.gateway.id}`, payload);
        toast({ title: "Payment gateway updated" });
      }
      setModal(null); fetchGateways();
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const sErrors: Record<string, string> = {};
        Object.entries(err.response.data.errors).forEach(([k, v]: [string, any]) => {
          sErrors[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setErrors(sErrors);
      } else {
        toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/payment-gateways/${deleteConfirm.id}`);
      toast({ title: "Payment gateway deleted" }); setDeleteConfirm(null); fetchGateways();
    } catch (err: any) { toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" }); }
    finally { setDeleting(false); }
  };

  const toggleActive = async (gw: Gateway) => {
    try {
      await api.put(`/admin/payment-gateways/${gw.id}`, { is_active: !gw.is_active });
      fetchGateways();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (gw: Gateway) => {
    try {
      const res = await api.post("/admin/payment-gateways", {
        name: `${gw.name} (Copy)`, address: gw.address, logo_url: gw.logo_url,
        qr_code_url: gw.qr_code_url, minimum_amount: gw.minimum_amount,
        instructions: gw.instructions, is_active: gw.is_active, deep_link: gw.deep_link,
      });
      const newId = res.data?.gateway?.id;
      // Clone the rotating "Manage Accounts" list too, so the copy isn't silently reduced to a
      // single-account gateway.
      if (newId && gw.accounts?.length) {
        await Promise.all(gw.accounts.map((acc) => api.post(`/admin/payment-gateways/${newId}/accounts`, {
          account_name: acc.account_name, account_number: acc.account_number,
          deep_link: acc.deep_link, qr_code_url: acc.qr_code_url,
          priority_order: acc.priority_order, is_active: acc.is_active,
        })));
      }
      toast({ title: "Gateway duplicated successfully" }); fetchGateways();
    } catch (err: any) { toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" }); }
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // No bulk-delete endpoint exists; delete each gateway individually via the existing route.
      await Promise.all(Array.from(selectedIds).map((id) => api.delete(`/admin/payment-gateways/${id}`)));
      toast({ title: `${selectedIds.size} gateway(s) removed.` });
      setSelectedIds(new Set()); setBulkDeleteConfirm(false); fetchGateways();
    } catch (err: any) { toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" }); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkToggle = async () => {
    if (!bulkToggleConfirm) return;
    setBulkToggling(true);
    try {
      const newStatus = bulkToggleConfirm === "activate";
      // No bulk-update endpoint exists; update each gateway individually via the existing route.
      await Promise.all(Array.from(selectedIds).map((id) => api.put(`/admin/payment-gateways/${id}`, { is_active: newStatus })));
      toast({ title: `${selectedIds.size} gateway(s) updated.` });
      setSelectedIds(new Set()); setBulkToggleConfirm(null); fetchGateways();
    } catch (err: any) { toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" }); }
    finally { setBulkToggling(false); }
  };

  // Export/Import
  const imageUrlToBase64 = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = await Promise.all(
        gateways.map(async (gw) => ({
          name: gw.name, address: gw.address, minimum_amount: gw.minimum_amount,
          instructions: gw.instructions, is_active: gw.is_active, deep_link: gw.deep_link,
          logo_base64: gw.logo_url ? await imageUrlToBase64(gw.logo_url) : null,
          qr_base64: gw.qr_code_url ? await imageUrlToBase64(gw.qr_code_url) : null,
          // Carries the rotating "Manage Accounts" list so re-importing doesn't silently
          // collapse a multi-account gateway down to a single address.
          accounts: await Promise.all((gw.accounts || []).map(async (acc) => ({
            account_name: acc.account_name, account_number: acc.account_number,
            deep_link: acc.deep_link, priority_order: acc.priority_order, is_active: acc.is_active,
            qr_base64: acc.qr_code_url ? await imageUrlToBase64(acc.qr_code_url) : null,
          }))),
        }))
      );
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `payment-gateways-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${exportData.length} gateway(s) exported.` });
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setExporting(false); }
  };

  const base64ToFile = (base64: string, filename: string): File => {
    const [meta, data] = base64.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const items = JSON.parse(text) as any[];
      if (!Array.isArray(items)) throw new Error("Invalid format");
      let imported = 0;
      const existingNames = new Set(gateways.map((g) => g.name.toLowerCase()));
      for (const item of items) {
        if (!item.name || !item.address) continue;
        if (existingNames.has(item.name.toLowerCase())) continue;
        let lUrl: string | null = null; let qUrl: string | null = null;
        if (item.logo_base64) { const f = base64ToFile(item.logo_base64, `logo-${item.name}.png`); lUrl = await uploadImage(f, "logos/"); }
        if (item.qr_base64) { const f = base64ToFile(item.qr_base64, `qr-${item.name}.png`); qUrl = await uploadImage(f, ""); }
        const res = await api.post("/admin/payment-gateways", {
          name: item.name, address: item.address, minimum_amount: item.minimum_amount ?? 10,
          instructions: item.instructions || null, is_active: item.is_active ?? true,
          logo_url: lUrl, qr_code_url: qUrl, deep_link: item.deep_link || null,
        });
        const newId = res.data?.gateway?.id;
        if (newId && Array.isArray(item.accounts) && item.accounts.length) {
          for (const acc of item.accounts) {
            if (!acc.account_name || !acc.account_number) continue;
            let accQrUrl: string | null = null;
            if (acc.qr_base64) { const f = base64ToFile(acc.qr_base64, `qr-${item.name}-${acc.account_name}.png`); accQrUrl = await uploadImage(f, "account-qr/"); }
            await api.post(`/admin/payment-gateways/${newId}/accounts`, {
              account_name: acc.account_name, account_number: acc.account_number,
              deep_link: acc.deep_link || null, qr_code_url: accQrUrl,
              priority_order: acc.priority_order ?? 0, is_active: acc.is_active ?? true,
            });
          }
        }
        imported++;
      }
      toast({ title: `${imported} gateway(s) imported.` }); fetchGateways();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setImporting(false); if (importInputRef.current) importInputRef.current.value = ""; }
  };

  // Account management
  const openAccountsPanel = async (gatewayId: string) => {
    setAccountsGatewayId(gatewayId);
    await fetchAccounts(gatewayId);
  };

  const openAddAccount = () => {
    setAccName(""); setAccNumber(""); setAccDeepLink(""); setAccButtonAction("none"); setAccQrFile(null); setAccQrPreview(""); setAccPriority("0");
    setAccountModal({ mode: "add" });
  };

  const openEditAccount = (acc: GatewayAccount) => {
    setAccName(acc.account_name); setAccNumber(acc.account_number);
    setAccDeepLink(acc.deep_link === "__chat_support__" ? "" : (acc.deep_link || ""));
    setAccButtonAction(deriveButtonAction(acc.deep_link));
    setAccQrPreview(acc.qr_code_url || ""); setAccQrFile(null);
    setAccPriority(String(acc.priority_order));
    setAccountModal({ mode: "edit", account: acc });
  };

  const handleSaveAccount = async () => {
    const errs: Record<string, string> = {};
    if (!accName.trim()) errs.accName = "Account name is required";
    if (!accNumber.trim()) errs.accNumber = "Account number / address is required";
    if (Object.keys(errs).length > 0) {
      setAccErrors(errs);
      return;
    }
    setAccErrors({});
    if (!accountsGatewayId) return;
    setSavingAccount(true);
    try {
      let qrUrl: string | null = accQrPreview || null;
      if (accQrFile) qrUrl = await uploadImage(accQrFile, "account-qr/");

      const finalAccDeepLink = accButtonAction === "chat_support" ? "__chat_support__" : (accButtonAction === "open_app" ? (accDeepLink.trim() || null) : null);

      const payload = {
        gateway_id: accountsGatewayId, account_name: accName.trim(), account_number: accNumber.trim(),
        deep_link: finalAccDeepLink, qr_code_url: qrUrl, priority_order: parseInt(accPriority) || 0,
      };

      if (accountModal?.mode === "add") {
        await api.post(`/admin/payment-gateways/${accountsGatewayId}/accounts`, payload);
        toast({ title: "Account added" });
        setAccountModal(null); fetchAccounts(accountsGatewayId);
      } else if (accountModal?.account) {
        await api.put(`/admin/payment-gateways/${accountsGatewayId}/accounts/${accountModal.account.id}`, payload);
        toast({ title: "Account updated" });
        setAccountModal(null); fetchAccounts(accountsGatewayId);
      }
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const sErrors: Record<string, string> = {};
        Object.entries(err.response.data.errors).forEach(([k, v]: [string, any]) => {
          sErrors[k] = Array.isArray(v) ? v[0] : String(v);
        });
        setAccErrors(sErrors);
      } else {
        toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
      }
    } finally { setSavingAccount(false); }
  };

  const toggleAccountActive = async (acc: GatewayAccount) => {
    try {
      await api.put(`/admin/payment-gateways/${accountsGatewayId}/accounts/${acc.id}`, { is_active: !acc.is_active });
      if (accountsGatewayId) fetchAccounts(accountsGatewayId);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const deleteAccount = async (accId: string) => {
    try {
      await api.delete(`/admin/payment-gateways/${accountsGatewayId}/accounts/${accId}`);
      toast({ title: "Account deleted" });
      if (accountsGatewayId) fetchAccounts(accountsGatewayId);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const moveAccount = async (acc: GatewayAccount, direction: "up" | "down") => {
    const idx = accounts.findIndex((a) => a.id === acc.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= accounts.length) return;
    const other = accounts[swapIdx];
    try {
      await Promise.all([
        api.put(`/admin/payment-gateways/${accountsGatewayId}/accounts/${acc.id}`, { priority_order: other.priority_order }),
        api.put(`/admin/payment-gateways/${accountsGatewayId}/accounts/${other.id}`, { priority_order: acc.priority_order }),
      ]);
      if (accountsGatewayId) fetchAccounts(accountsGatewayId);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const accountsGateway = gateways.find((g) => g.id === accountsGatewayId);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-wide">Payment Gateways</h1>
          <p className="text-muted-foreground mt-1">Manage deposit payment methods and accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExport} disabled={exporting || gateways.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
          </button>
          <button onClick={() => importInputRef.current?.click()} disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Import
          </button>
          <input ref={importInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg gradient-bg px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Add Gateway
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search gateways..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-muted/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-lg border border-input bg-muted/50 py-2.5 px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
          <button onClick={() => setBulkToggleConfirm("activate")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
            <ToggleLeft className="h-3.5 w-3.5" /> Activate
          </button>
          <button onClick={() => setBulkToggleConfirm("deactivate")} className="inline-flex items-center gap-1.5 rounded-lg bg-muted border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors">
            <ToggleLeft className="h-3.5 w-3.5" /> Deactivate
          </button>
          <button onClick={() => setBulkDeleteConfirm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Delete Selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">Clear selection</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pl-4 pr-1 py-3 w-10">
                  <input type="checkbox" checked={filtered.length > 0 && filtered.every((g) => selectedIds.has(g.id))}
                    onChange={toggleSelectAll} className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
                </th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium text-center">Min</th>
                <th className="px-6 py-3 font-medium text-center">Button Action</th>
                <th className="px-6 py-3 font-medium text-center">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                  {search || statusFilter !== "all" ? "No gateways match your filters." : "No payment gateways yet. Add one above."}
                </td></tr>
              ) : (
                filtered.map((gw) => (
                  <tr key={gw.id} className={`hover:bg-muted/20 transition-colors ${selectedIds.has(gw.id) ? "bg-primary/5" : ""}`}>
                    <td className="pl-4 pr-1 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(gw.id)} onChange={() => toggleSelect(gw.id)}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        {gw.logo_url ? (
                          <img src={gw.logo_url} alt={gw.name} className="h-7 w-7 rounded-md object-contain bg-card p-0.5 border border-border" />
                        ) : (
                          <div className="h-7 w-7 rounded-md bg-muted border border-border flex items-center justify-center">
                            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">{gw.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs max-w-[200px] truncate">{gw.address}</td>
                    <td className="px-6 py-4 text-center text-foreground">${gw.minimum_amount}</td>
                    <td className="px-6 py-4 text-center">
                      {gw.deep_link === "__chat_support__" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <MessageCircle className="h-3 w-3" /> Chat Support
                        </span>
                      ) : gw.deep_link ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                          <ExternalLink className="h-3 w-3" /> Payment App
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => toggleActive(gw)} title={gw.is_active ? "Deactivate" : "Activate"}>
                        {gw.is_active ? <ToggleRight className="h-5 w-5 text-green-400" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => openAccountsPanel(gw.id)} size="sm" className="text-[11px] h-6 px-2 gradient-bg text-primary-foreground hover:opacity-90">
                          Manage Accounts
                        </Button>
                        <button onClick={() => handleDuplicate(gw)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Duplicate">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(gw)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirm(gw)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========= Add/Edit Gateway Modal ========= */}
      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modal?.mode === "add" ? "Add Payment Gateway" : "Edit Payment Gateway"}</DialogTitle>
            <DialogDescription>Configure the payment method details users will see.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Name *</label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: "" })); }}
                placeholder="e.g. Bitcoin, Cash App"
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                  errors.name ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {errors.name && <p className="text-xs text-destructive font-medium mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Address / Username / Email *</label>
              <input
                value={address}
                onChange={(e) => { setAddress(e.target.value); if (errors.address) setErrors(p => ({ ...p, address: "" })); }}
                placeholder="Wallet address, $cashtag, email..."
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                  errors.address ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {errors.address && <p className="text-xs text-destructive font-medium mt-1">{errors.address}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Button Action</label>
              <select value={buttonAction} onChange={(e) => setButtonAction(e.target.value as any)}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors cursor-pointer">
                <option value="none">None — No button shown</option>
                <option value="open_app">Open Payment App — Deep link URL</option>
                <option value="chat_support">Open Chat Support — Pancake live chat</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {buttonAction === "none" && "Users will only see copy buttons for the account details."}
                {buttonAction === "open_app" && "Users see an \"Open Payment App\" button with your deep link."}
                {buttonAction === "chat_support" && "Users see an \"Open Chat Support\" button that opens the live chat."}
              </p>
            </div>
            {buttonAction === "open_app" && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Deep Link URL</label>
                <input value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="cashapp://, venmo://, chime://..."
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground" />
              </div>
            )}
            {/* Logo Upload */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method Logo</label>
              {logoPreview ? (
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl border border-border bg-card p-1.5 flex items-center justify-center overflow-hidden">
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                  </div>
                  <button onClick={removeLogo} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"><X className="h-3 w-3" /> Remove</button>
                </div>
              ) : (
                <button type="button" onClick={() => logoInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Upload Logo
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFileChange} className="hidden" />
            </div>
            {/* QR Code */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">QR Code Image</label>
              {qrPreview ? (
                <div className="flex items-start gap-3">
                  <img src={qrPreview} alt="QR" className="h-24 w-24 rounded-lg border border-border bg-card p-1 object-contain" />
                  <button onClick={removeQr} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" /> Upload QR Code
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleQrFileChange} className="hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Minimum Amount ($)</label>
              <input type="number" value={minimumAmount} onChange={(e) => setMinimumAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Instructions</label>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Payment instructions..."
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors resize-none" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========= Accounts Management Modal ========= */}
      <Dialog open={!!accountsGatewayId} onOpenChange={() => setAccountsGatewayId(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage Accounts — {accountsGateway?.name}</DialogTitle>
            <DialogDescription>Add multiple accounts for this payment method. Users will see accounts in priority order and can request the next one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <button onClick={openAddAccount} className="inline-flex items-center gap-2 rounded-lg gradient-bg px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              <Plus className="h-3.5 w-3.5" /> Add Account
            </button>

            {loadingAccounts ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No accounts yet. The gateway's default address will be used.</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc, idx) => (
                  <div key={acc.id} className={`rounded-lg border ${acc.is_active ? "border-border" : "border-border/50 opacity-60"} bg-muted/20 p-3 flex items-center gap-3`}>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveAccount(acc, "up")} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveAccount(acc, "down")} disabled={idx === accounts.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{acc.account_name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{acc.account_number}</p>
                      {acc.deep_link && acc.deep_link !== "__chat_support__" && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Link className="h-3 w-3 text-primary" />
                          <span className="text-[10px] text-primary truncate">{acc.deep_link}</span>
                        </div>
                      )}
                      {acc.deep_link === "__chat_support__" && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MessageCircle className="h-3 w-3 text-primary" />
                          <span className="text-[10px] text-primary">Chat Support</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => toggleAccountActive(acc)} title={acc.is_active ? "Disable" : "Enable"}>
                        {acc.is_active ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => openEditAccount(acc)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteAccount(acc.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========= Add/Edit Account Modal ========= */}
      <Dialog open={!!accountModal} onOpenChange={() => setAccountModal(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{accountModal?.mode === "add" ? "Add Account" : "Edit Account"}</DialogTitle>
            <DialogDescription>Configure account details for this payment method.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Account Name *</label>
              <input
                value={accName}
                onChange={(e) => { setAccName(e.target.value); if (accErrors.accName) setAccErrors(p => ({ ...p, accName: "" })); }}
                placeholder="e.g. Chime Account 1"
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                  accErrors.accName ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {accErrors.accName && <p className="text-xs text-destructive font-medium mt-1">{accErrors.accName}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Account Number / Address *</label>
              <input
                value={accNumber}
                onChange={(e) => { setAccNumber(e.target.value); if (accErrors.accNumber) setAccErrors(p => ({ ...p, accNumber: "" })); }}
                placeholder="$cashtag, email, wallet address..."
                className={`w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                  accErrors.accNumber ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
              />
              {accErrors.accNumber && <p className="text-xs text-destructive font-medium mt-1">{accErrors.accNumber}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Button Action</label>
              <select value={accButtonAction} onChange={(e) => setAccButtonAction(e.target.value as any)}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors cursor-pointer">
                <option value="none">None — No button</option>
                <option value="open_app">Open Payment App</option>
                <option value="chat_support">Open Chat Support</option>
              </select>
            </div>
            {accButtonAction === "open_app" && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Deep Link URL</label>
                <input value={accDeepLink} onChange={(e) => setAccDeepLink(e.target.value)} placeholder="cashapp://, venmo://..."
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground" />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">QR Code</label>
              {accQrPreview ? (
                <div className="flex items-start gap-3">
                  <img src={accQrPreview} alt="QR" className="h-20 w-20 rounded-lg border border-border bg-card p-1 object-contain" />
                  <button onClick={() => { setAccQrFile(null); setAccQrPreview(""); }} className="text-xs text-destructive hover:underline"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => accQrInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" /> Upload QR
                </button>
              )}
              <input ref={accQrInputRef} type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0]; if (f) { setAccQrFile(f); setAccQrPreview(URL.createObjectURL(f)); }
              }} className="hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Priority Order</label>
              <input type="number" value={accPriority} onChange={(e) => setAccPriority(e.target.value)} placeholder="0"
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors" />
              <p className="text-[10px] text-muted-foreground mt-1">Lower numbers are shown first.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setAccountModal(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleSaveAccount} disabled={savingAccount} className="flex-1">{savingAccount ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========= Delete Confirm ========= */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Delete Gateway</DialogTitle>
            <DialogDescription>Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">{deleting ? "Deleting..." : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={(v) => !v && setBulkDeleteConfirm(false)}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Gateway(s)</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Toggle Confirm */}
      <Dialog open={bulkToggleConfirm !== null} onOpenChange={(v) => !v && setBulkToggleConfirm(null)}>
        <DialogContent className="sm:max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>{bulkToggleConfirm === "activate" ? "Activate" : "Deactivate"} {selectedIds.size} Gateway(s)</DialogTitle>
            <DialogDescription>Are you sure?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setBulkToggleConfirm(null)} disabled={bulkToggling}>Cancel</Button>
            <Button onClick={handleBulkToggle} disabled={bulkToggling}>
              {bulkToggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPaymentGateways;
