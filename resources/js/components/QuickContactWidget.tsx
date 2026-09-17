import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import api from "@/services/api";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { ChannelIcon } from "@/components/ChannelIcons";

interface Channel {
  id: string | number;
  name: string;
  icon: string;
  link: string;
  sort_order: number;
}

type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "custom";
interface CustomPosition {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

const POSITION_CLASSES: Record<Exclude<WidgetPosition, "custom">, string> = {
  "bottom-right": "bottom-6 right-6 items-end",
  "bottom-left": "bottom-6 left-6 items-start",
  "top-right": "top-6 right-6 items-end",
  "top-left": "top-6 left-6 items-start",
};

export function QuickContactWidget() {
  const { settings } = useSiteSettings();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get("/support-channels")
      .then((res) => {
        if (res.data?.channels) {
          setChannels(res.data.channels);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch support channels", err);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sanitizeLink = (link: string) => {
    const trimmed = link.trim();
    if (trimmed.toLowerCase().startsWith("javascript:")) return "#";
    if (/^(https?:|mailto:|tel:|viber:|tg:)/i.test(trimmed)) return trimmed;
    try { new URL(trimmed); return trimmed; } catch { return "#"; }
  };

  const handleOpenPancake = () => {
    try { (window as any).PancakeChatPlugin?.openChatBox?.(); } catch {}
    setOpen(false);
  };

  // Nothing configured yet — matches the reference: no fake/placeholder channels shown.
  if (channels.length === 0) return null;

  const iconsOnly = settings.contact_display_mode !== "icons_with_text";
  const buttonLabel = settings.contact_button_label || "Get Support";
  const headerTitle = settings.contact_header_title || "";
  const buttonColor = settings.contact_button_color || "";
  const textColor = settings.contact_text_color || "";

  let position: WidgetPosition = "bottom-right";
  let customPosition: CustomPosition = {};
  const rawPos = settings.contact_widget_position;
  if (rawPos) {
    try {
      const parsed = JSON.parse(rawPos);
      if (typeof parsed === "object" && parsed !== null) {
        position = "custom";
        customPosition = parsed;
      } else {
        position = rawPos as WidgetPosition;
      }
    } catch {
      position = rawPos as WidgetPosition;
    }
  }

  const isCustom = position === "custom";
  const isBottomAnchored = isCustom
    ? customPosition.bottom !== undefined || customPosition.top === undefined
    : position.startsWith("bottom");
  const customAlignClass = isCustom ? (customPosition.right !== undefined ? "items-end" : "items-start") : "";
  const customStyle: React.CSSProperties = isCustom
    ? {
        ...(customPosition.top !== undefined ? { top: `${customPosition.top}px` } : {}),
        ...(customPosition.bottom !== undefined ? { bottom: `${customPosition.bottom}px` } : {}),
        ...(customPosition.left !== undefined ? { left: `${customPosition.left}px` } : {}),
        ...(customPosition.right !== undefined ? { right: `${customPosition.right}px` } : {}),
      }
    : {};

  const rootClass = isCustom
    ? `fixed z-[50] flex flex-col ${customAlignClass}`
    : `fixed z-[50] flex flex-col ${POSITION_CLASSES[position]}`;

  const panel = open && (
    <PanelContent
      channels={channels}
      sanitizeLink={sanitizeLink}
      handleOpenPancake={handleOpenPancake}
      iconsOnly={iconsOnly}
      headerTitle={headerTitle}
      animateFromTop={!isBottomAnchored}
      spacingClass={isBottomAnchored ? "mb-3.5" : "mt-3.5"}
    />
  );

  const button = (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setOpen(!open)}
      style={{
        ...(buttonColor ? { backgroundColor: buttonColor } : {}),
        ...(textColor ? { color: textColor } : {}),
      }}
      className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-bold shadow-2xl shadow-purple-600/40 hover:opacity-95 transition-all ${
        !buttonColor ? "bg-gradient-to-r from-[#6366f1] via-[#a855f7] to-[#ec4899]" : ""
      } ${!textColor ? "text-white" : ""}`}
    >
      {open ? <X className="h-5 w-5" strokeWidth={2.5} /> : <MessageCircle className="h-5 w-5" strokeWidth={2} />}
      <span>{buttonLabel}</span>
    </motion.button>
  );

  return (
    <div ref={panelRef} className={rootClass} style={customStyle}>
      <AnimatePresence>
        {isBottomAnchored ? panel : null}
      </AnimatePresence>
      {button}
      <AnimatePresence>
        {!isBottomAnchored ? panel : null}
      </AnimatePresence>
    </div>
  );
}

function PanelContent({
  channels,
  sanitizeLink,
  handleOpenPancake,
  iconsOnly,
  headerTitle,
  animateFromTop,
  spacingClass,
}: {
  channels: Channel[];
  sanitizeLink: (link: string) => string;
  handleOpenPancake: () => void;
  iconsOnly: boolean;
  headerTitle: string;
  animateFromTop: boolean;
  spacingClass: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: animateFromTop ? -15 : 15, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: animateFromTop ? -15 : 15, scale: 0.92 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className={`${spacingClass} flex flex-col items-center gap-3.5 rounded-3xl border border-white/10 bg-[#0b0c16]/95 px-4 py-5 shadow-2xl backdrop-blur-xl ${iconsOnly ? "w-32" : "w-56"}`}
    >
      <span className="text-[12px] font-bold text-gray-300 tracking-wider text-center select-none">
        {headerTitle || "Get Support"}
      </span>

      <div className={iconsOnly ? "flex flex-col items-center gap-3" : "flex flex-col items-stretch gap-2 w-full"}>
        {channels.map((ch) => {
          const icon = <ChannelIcon iconKey={ch.icon} className="h-5 w-5" colored />;
          return iconsOnly ? (
            <a
              key={ch.id}
              href={sanitizeLink(ch.link)}
              target="_blank"
              rel="noopener noreferrer"
              title={ch.name}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#131525] border border-white/10 text-white shadow-md hover:bg-[#1a1c32] hover:scale-105 transition-all duration-200"
            >
              {icon}
            </a>
          ) : (
            <a
              key={ch.id}
              href={sanitizeLink(ch.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-[#131525] border border-white/10 px-3 py-2.5 text-white shadow-md hover:bg-[#1a1c32] transition-all duration-200"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">{icon}</span>
              <span className="text-sm font-medium truncate">{ch.name}</span>
            </a>
          );
        })}

        {/* Live Chat Solid Teal-Green Icon Button */}
        {iconsOnly ? (
          <button
            onClick={handleOpenPancake}
            title="Live Chat"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00bfa5] text-white shadow-lg shadow-[#00bfa5]/40 hover:scale-105 transition-all duration-200"
          >
            <MessageCircle className="h-6 w-6 text-white" fill="white" strokeWidth={0} />
          </button>
        ) : (
          <button
            onClick={handleOpenPancake}
            className="flex items-center gap-3 rounded-2xl bg-[#00bfa5] px-3 py-2.5 text-white shadow-lg shadow-[#00bfa5]/40 hover:scale-[1.02] transition-all duration-200"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
              <MessageCircle className="h-5 w-5 text-white" fill="white" strokeWidth={0} />
            </span>
            <span className="text-sm font-medium">Live Chat</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
