import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, MessageCircle, X, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useEffect, useState } from "react";
import { generateReceiptImage, downloadBlob, type ReceiptData } from "@/lib/generateReceipt";
import { openChatWithProfile } from "@/lib/openChatWithProfile";

declare global {
  interface Window {
    PancakeChatPlugin?: {
      setInitialFormData: (data: Record<string, string | undefined>) => void;
      openChatBox: () => void;
      changeLocale: (locale: string) => void;
    };
  }
}

export interface TransactionDetails {
  transactionId: string;
  type: string;
  amount: number;
  baseAmount?: number;
  tip?: number;
  paymentMethod: string;
}

interface TransactionSuccessModalProps {
  open: boolean;
  onClose: () => void;
  transaction?: TransactionDetails | null;
}

export const TransactionSuccessModal = ({ open, onClose, transaction }: TransactionSuccessModalProps) => {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      try { window.PancakeChatPlugin?.changeLocale("en"); } catch {}
    }
  }, [open]);

  const handleOpenChat = async () => {
    await openChatWithProfile({ username: user?.username, email: user?.email, phone: user?.phone });
    onClose();
  };

  const handleDownloadReceipt = async () => {
    if (!transaction) return;
    setDownloading(true);
    try {
      const username = user?.username || user?.name || user?.email || "User";
      const receiptData: ReceiptData = {
        transactionId: transaction.transactionId,
        username,
        transactionType: transaction.type,
        amount: transaction.amount,
        tip: transaction.tip,
        paymentMethod: transaction.paymentMethod,
        dateTime: new Date().toLocaleString("en-US", {
          year: "numeric", month: "long", day: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
        siteName: settings.site_name || "GameVault",
        logoUrl: settings.logo_url,
      };
      const blob = await generateReceiptImage(receiptData);
      const shortId = String(transaction.transactionId).slice(0, 8);
      downloadBlob(blob, `transaction_receipt_${shortId}.jpg`);
    } catch (e) {
      console.error("Receipt generation failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Success icon */}
            <div className="flex justify-center mb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.15, duration: 0.5, bounce: 0.4 }}
                className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center"
              >
                <CheckCircle className="h-8 w-8 text-green-500" />
              </motion.div>
            </div>

            {/* Content */}
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-display font-bold tracking-wide text-foreground">
                {transaction?.type === "withdraw"
                  ? "Request Withdraw Submitted Successfully"
                  : transaction?.type === "redeem"
                  ? "Request Redeem Submitted Successfully"
                  : transaction?.type === "transfer"
                  ? "Request Transfer Submitted Successfully"
                  : "Request Deposit Submitted Successfully"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {transaction?.type === "withdraw" || transaction?.type === "redeem"
                  ? "The requested amount will be credited to your account shortly."
                  : "Please wait a few minutes. Your account will be credited automatically shortly."}
              </p>
              {transaction && (
                <div className="rounded-lg bg-muted/30 border border-border p-3 mt-3 text-left space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">ID</span>
                    <span className="text-foreground font-mono text-[11px]">{String(transaction.transactionId).slice(0, 12)}…</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-foreground font-medium capitalize">{transaction.type}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-foreground font-medium">${(transaction.baseAmount ?? (transaction.tip ? transaction.amount - transaction.tip : transaction.amount)).toFixed(2)}</span>
                  </div>
                  {(transaction.tip ?? 0) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Tip</span>
                      <span className="text-foreground font-medium">${transaction.tip!.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs border-t border-border pt-1">
                    <span className="text-muted-foreground font-semibold">Total</span>
                    <span className="text-primary font-semibold">${transaction.amount.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="space-y-2.5">
              {transaction && (
                <button
                  onClick={handleDownloadReceipt}
                  disabled={downloading}
                  className="w-full rounded-xl border border-primary/30 bg-primary/10 py-3 text-sm font-bold text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading ? "Generating…" : "Download Transaction Receipt"}
                </button>
              )}
              <button
                onClick={handleOpenChat}
                className="w-full rounded-xl gradient-bg py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Contact Support
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
