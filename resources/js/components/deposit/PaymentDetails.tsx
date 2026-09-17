import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, ExternalLink, QrCode, RefreshCw, MessageCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface GatewayAccount {
  id: string;
  account_name: string;
  account_number: string;
  deep_link: string | null;
  qr_code_url: string | null;
}

interface PaymentGateway {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  qr_code_url: string | null;
  minimum_amount: number;
  instructions: string | null;
  deep_link: string | null;
}

interface Props {
  gateway: PaymentGateway;
  account: GatewayAccount | null;
  amount: string;
  onRequestNewAccount: () => void;
  noMoreAccounts: boolean;
  hasMultipleAccounts: boolean;
}

export const PaymentDetails = ({
  gateway,
  account,
  amount,
  onRequestNewAccount,
  noMoreAccounts,
  hasMultipleAccounts,
}: Props) => {
  const isMobile = useIsMobile();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const displayAddress = account?.account_number || gateway.address;
  const displayName = account?.account_name || gateway.name;
  const rawDeepLink = account?.deep_link || gateway.deep_link;
  const isChatSupport = rawDeepLink === "__chat_support__";
  const deepLink = isChatSupport ? null : rawDeepLink;
  const qrUrl = account?.qr_code_url || gateway.qr_code_url;

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Map deep link protocols to web URLs for desktop
  const getWebUrl = (link: string): string | null => {
    const map: Record<string, string> = {
      "cashapp://": "https://cash.app/",
      "venmo://": "https://venmo.com/",
      "paypal://": "https://www.paypal.com/",
      "chime://": "https://www.chime.com/",
      "zelle://": "https://www.zellepay.com/",
    };
    for (const [protocol, url] of Object.entries(map)) {
      if (link.toLowerCase().startsWith(protocol.toLowerCase())) {
        // Preserve any path after the protocol (e.g. cashapp://pay/user → https://cash.app/pay/user)
        const path = link.slice(protocol.length);
        return url + path;
      }
    }
    // If it's already an http(s) link, use it directly
    if (link.startsWith("http://") || link.startsWith("https://")) return link;
    return null;
  };

  const handleOpenApp = () => {
    if (!deepLink) {
      handleCopy(displayAddress, "address");
      return;
    }
    if (isMobile) {
      // Mobile: open native app via deep link protocol
      window.location.href = deepLink;
    } else {
      // Desktop: open web version in new tab
      const webUrl = getWebUrl(deepLink);
      if (webUrl) {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      } else {
        // Fallback: try deep link anyway
        window.location.href = deepLink;
      }
    }
  };

  const handleOpenChat = () => {
    // Trigger Pancake chat widget via the global interceptor
    const pancakeBtn = document.querySelector<HTMLElement>('[data-pancake-chat-trigger], .pancake-chat-btn, iframe[src*="pancake"]');
    if (pancakeBtn) {
      pancakeBtn.click();
    } else {
      // Fallback: dispatch custom event that the chat interceptor listens for
      window.dispatchEvent(new CustomEvent("open-pancake-chat"));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-xl border border-border bg-muted/10 p-4 sm:p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {gateway.logo_url && (
          <img
            src={gateway.logo_url}
            alt={gateway.name}
            className="h-10 w-10 rounded-lg object-contain bg-card p-0.5 border border-border"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Send payment to {displayName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {deepLink && isMobile
              ? "Tap below to open the payment app"
              : "Copy the details below and send your payment"}
          </p>
        </div>
      </div>

      {/* Primary CTA Button */}
      {isChatSupport ? (
        <button
          onClick={handleOpenChat}
          className="w-full rounded-xl gradient-bg py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" />
          Open Chat Support
        </button>
      ) : deepLink ? (
        <button
          onClick={handleOpenApp}
          className="w-full rounded-xl gradient-bg py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <ExternalLink className="h-4 w-4" />
          Open Payment App
        </button>
      ) : null}

      {/* Account / Address */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Account / Address
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground font-mono break-all">
            {displayAddress}
          </div>
          <button
            onClick={() => handleCopy(displayAddress, "address")}
            className="shrink-0 rounded-lg border border-border bg-muted/50 p-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy address"
          >
            {copiedField === "address" ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Copy Amount */}
      {amount && parseFloat(amount) > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Amount
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground font-semibold">
              ${parseFloat(amount).toFixed(2)}
            </div>
            <button
              onClick={() => handleCopy(parseFloat(amount).toFixed(2), "amount")}
              className="shrink-0 rounded-lg border border-border bg-muted/50 p-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Copy amount"
            >
              {copiedField === "amount" ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Show QR toggle */}
      {qrUrl && (
        <div>
          {!showQr ? (
            <button
              onClick={() => setShowQr(true)}
              className="w-full rounded-lg border border-border bg-muted/30 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
            >
              <QrCode className="h-4 w-4" />
              Show QR Code
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex justify-center pt-1"
            >
              <img
                src={qrUrl}
                alt={`${gateway.name} QR Code`}
                className="max-w-full max-h-56 rounded-xl border border-border bg-white p-2 object-contain"
              />
            </motion.div>
          )}
        </div>
      )}

      {/* Request New Account */}
      {hasMultipleAccounts && (
        <div>
          {noMoreAccounts ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-center">
              <p className="text-xs text-destructive font-medium">
                No more accounts available. Please contact support.
              </p>
            </div>
          ) : (
            <button
              onClick={onRequestNewAccount}
              className="w-full rounded-lg border border-border bg-muted/30 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Request New Account
            </button>
          )}
        </div>
      )}

      {/* Instructions */}
      {gateway.instructions && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
          <p className="text-xs font-semibold text-primary mb-1">Instructions</p>
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {gateway.instructions}
          </p>
        </div>
      )}
    </motion.div>
  );
};
