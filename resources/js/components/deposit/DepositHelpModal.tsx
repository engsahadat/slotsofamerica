import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, MessageCircle, ArrowRight } from "lucide-react";
import { openChatWithProfile } from "@/lib/openChatWithProfile";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const DepositHelpModal = ({ open, onClose }: Props) => {
  const { user } = useAuth();
  const handleOpenChat = async () => {
    await openChatWithProfile({ username: user?.username, email: user?.email, phone: user?.phone });
    onClose();
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
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <HelpCircle className="h-8 w-8 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-display font-bold tracking-wide text-foreground">
                Need some help?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We're always here to help. Chat with us using the live chat widget below.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleOpenChat}
                className="w-full rounded-xl gradient-bg py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Open Chat
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
