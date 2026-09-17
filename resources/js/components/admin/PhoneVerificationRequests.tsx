import { useEffect, useState } from "react";
import { Phone, Loader2, Check, X, ShieldCheck } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PhoneRequest {
  id: number;
  user_id: number;
  contact: string;
  status: string;
  created_at: string;
  user?: { name: string | null; username: string | null } | null;
}

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

export default function PhoneVerificationRequests() {
  const [items, setItems] = useState<PhoneRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [rejectFor, setRejectFor] = useState<PhoneRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const fetchPending = async () => {
    try {
      const { data } = await api.get("/admin/verifications/phone-requests");
      setItems(data.requests || []);
    } catch {
      // non-fatal — leave the list as-is, panel still renders an empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleVerify = async (req: PhoneRequest) => {
    setWorking(req.id);
    try {
      await api.post(`/admin/verifications/phone-requests/${req.id}/approve`);
      setItems((prev) => prev.filter((i) => i.id !== req.id));
      toast({ title: "Phone verified" });
    } catch (e: any) {
      toast({ title: "Failed to verify", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  const handleReject = async () => {
    if (!rejectFor) return;
    if (!rejectNote.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setWorking(rejectFor.id);
    try {
      await api.post(`/admin/verifications/phone-requests/${rejectFor.id}/reject`, { note: rejectNote.trim() });
      setItems((prev) => prev.filter((i) => i.id !== rejectFor.id));
      toast({ title: "Request rejected" });
      setRejectFor(null);
      setRejectNote("");
    } catch (e: any) {
      toast({ title: "Failed to reject", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10">
            <Phone className="h-4 w-4 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Phone Verification Requests</h3>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : items.length === 0 ? "No pending requests" : `${items.length} pending`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <ShieldCheck className="h-8 w-8 opacity-40" />
          You're all caught up.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-bold">User</th>
                <th className="px-5 py-3 font-bold">Phone</th>
                <th className="px-5 py-3 font-bold">Requested</th>
                <th className="px-5 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((req) => {
                const name = req.user?.name || req.user?.username || `User #${req.user_id}`;
                const handle = req.user?.username ? `@${req.user.username}` : "";
                return (
                  <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">{name}</div>
                      {handle && <div className="text-xs text-muted-foreground">{handle}</div>}
                    </td>
                    <td className="px-5 py-3 font-mono text-foreground">{req.contact}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(req.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleVerify(req)}
                          disabled={working === req.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {working === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Verify
                        </button>
                        <button
                          onClick={() => { setRejectFor(req); setRejectNote(""); }}
                          disabled={working === req.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject phone verification</DialogTitle>
            <DialogDescription>
              Give the user a clear reason — they'll see this in their notifications.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={4}
            placeholder="e.g. Phone number did not match the one used during the chat verification."
            className="w-full rounded-lg border border-input bg-muted/30 p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectNote.trim() || working === rejectFor?.id}
            >
              {working === rejectFor?.id && <Loader2 className="h-4 w-4 animate-spin" />}
              Reject request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
