import { ShieldAlert, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function VerificationRequiredModal({ open, onClose }: Props) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl text-center"
        >
          <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <ShieldAlert className="h-7 w-7 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">Verification Required</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Please verify your email or phone number to complete this action.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onClose(); navigate("/settings"); }}
              className="flex-1 rounded-xl gradient-bg py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Go to Settings
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
