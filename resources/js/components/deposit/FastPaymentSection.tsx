import { useState } from "react";
import { DollarSign, Apple, Wallet, Zap, Loader2 } from "lucide-react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";

// Mirrors App\Services\FastPaymentService::SUPPORTED_AMOUNTS exactly — display only.
// The backend re-validates against its own copy of this list regardless of what's sent here.
export const FAST_PAYMENT_AMOUNTS = [
  4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 11.99, 12.99, 13.99, 14.99,
  17.99, 19.99, 24.99, 29.99, 30.99, 39.99, 49.99, 59.99, 99.99,
  124.99, 129.99, 149.99, 199.99, 249.99, 299.99, 399.99, 499.99,
];

export const FAST_PENDING_ORDER_KEY = "fast_payment_pending_order";

type ProviderKey = "cashapp" | "applepay" | "googlepay";

const PROVIDERS: { key: ProviderKey; label: string; icon: typeof DollarSign; className: string }[] = [
  { key: "cashapp", label: "Cash App", icon: DollarSign, className: "text-[#00D632] border-[#00D632]/40 bg-[#00D632]/10" },
  { key: "applepay", label: "Apple Pay", icon: Apple, className: "text-foreground border-foreground/30 bg-foreground/5" },
  { key: "googlepay", label: "Google Pay", icon: Wallet, className: "text-[#4285F4] border-[#4285F4]/40 bg-[#4285F4]/10" },
];

export const FastPaymentSection = () => {
  const [provider, setProvider] = useState<ProviderKey | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canPay = !!provider && !!amount;

  const handlePay = async () => {
    if (!canPay) return;
    setSubmitting(true);
    try {
      const res = await api.post("/user/deposit/fast-payment", { provider, amount });
      const payUrl = res.data?.pay_url;
      const orderSn = res.data?.order_sn;
      if (!payUrl) throw new Error("No checkout URL returned");

      if (orderSn) {
        try { sessionStorage.setItem(FAST_PENDING_ORDER_KEY, orderSn); } catch { /* ignore */ }
      }
      // Hand off to the FAST Payment hosted checkout. Balance is credited only after the
      // server verifies FAST's own webhook — never on the strength of this redirect alone.
      window.location.href = payUrl;
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.message || "Could not start the deposit. Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-3">
          Select Provider
        </label>
        <div className="grid grid-cols-3 gap-3">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            const selected = provider === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setProvider(p.key)}
                className={`rounded-xl border-2 py-4 flex flex-col items-center gap-2 transition-all ${
                  selected ? `${p.className} shadow-md` : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <Icon className={`h-6 w-6 ${selected ? "" : "text-muted-foreground"}`} />
                <span className={`text-xs font-semibold ${selected ? "" : "text-foreground"}`}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-3">
          Select Amount
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1">
          {FAST_PAYMENT_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt)}
              className={`rounded-lg border-2 py-2.5 text-xs font-bold transition-all ${
                amount === amt
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              ${amt.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handlePay}
        disabled={!canPay || submitting}
        className="w-full rounded-xl gradient-bg py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {submitting ? "Starting checkout..." : amount ? `Pay $${amount.toFixed(2)} Instantly` : "Select an amount"}
      </button>
      <p className="text-[11px] text-center text-muted-foreground">
        You'll be redirected to a secure checkout page to complete payment. Your balance is
        credited automatically once the payment is confirmed.
      </p>
    </div>
  );
};
