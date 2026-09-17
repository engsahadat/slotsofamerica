import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Loader2, MessageCircle, ExternalLink } from "lucide-react";
import { ChannelIcon, CHANNEL_PRESETS } from "@/components/ChannelIcons";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

interface SupportChannel {
  id: number;
  name: string;
  icon: string;
  link: string;
  is_active: boolean;
  sort_order: number;
}

type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "custom";

interface CustomPosition {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

const POSITION_OPTIONS: { value: WidgetPosition; label: string }[] = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
  { value: "custom", label: "Custom" },
];

const AdminSupportChannels = () => {
  const [channels, setChannels] = useState<SupportChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editChannel, setEditChannel] = useState<Partial<SupportChannel> | null>(null);
  const [displayMode, setDisplayMode] = useState<"icons_only" | "icons_with_text">("icons_only");
  const [buttonLabel, setButtonLabel] = useState("More");
  const [headerTitle, setHeaderTitle] = useState("");
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>("bottom-right");
  const [customPosition, setCustomPosition] = useState<CustomPosition>({ bottom: "80", right: "16" });
  const [buttonColor, setButtonColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const { refetch: refetchPublicSettings } = useSiteSettings();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/support-channels");
      setChannels(data.channels || []);
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Failed to load channels."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    api.get("/admin/site-settings").then(({ data }) => {
      const s = data?.settings;
      if (!s) return;
      if (s.contact_display_mode) setDisplayMode(s.contact_display_mode);
      if (s.contact_button_label) setButtonLabel(s.contact_button_label);
      if (s.contact_header_title != null) setHeaderTitle(s.contact_header_title);
      if (s.contact_widget_position) {
        try {
          const parsed = JSON.parse(s.contact_widget_position);
          if (typeof parsed === "object" && parsed !== null) {
            setWidgetPosition("custom");
            setCustomPosition(parsed);
          } else {
            setWidgetPosition(s.contact_widget_position as WidgetPosition);
          }
        } catch {
          setWidgetPosition(s.contact_widget_position as WidgetPosition);
        }
      }
      if (s.contact_button_color) setButtonColor(s.contact_button_color);
      if (s.contact_text_color) setTextColor(s.contact_text_color);
    }).catch(() => { /* non-fatal — widget settings just stay at defaults */ });
  }, []);

  const handleDisplayModeChange = async (mode: "icons_only" | "icons_with_text") => {
    setDisplayMode(mode);
    try {
      await api.post("/admin/site-settings", { contact_display_mode: mode });
      await refetchPublicSettings();
      toast({ title: "Display mode updated" });
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    }
  };

  const handleSaveWidgetSettings = async () => {
    setSettingsSaving(true);
    try {
      await api.post("/admin/site-settings", {
        contact_button_label: buttonLabel,
        contact_header_title: headerTitle,
        contact_widget_position: widgetPosition === "custom" ? JSON.stringify(customPosition) : widgetPosition,
        contact_button_color: buttonColor,
        contact_text_color: textColor,
      });
      await refetchPublicSettings();
      toast({ title: "Widget settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editChannel?.name || !editChannel?.link) {
      toast({ title: "Name and Link are required", variant: "destructive" });
      return;
    }
    const sanitizedLink = editChannel.link.trim();
    if (sanitizedLink.toLowerCase().startsWith("javascript:")) {
      toast({ title: "Invalid link", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editChannel.id) {
        await api.put(`/admin/support-channels/${editChannel.id}`, {
          name: editChannel.name, icon: editChannel.icon || "whatsapp", link: sanitizedLink,
          is_active: editChannel.is_active ?? true, sort_order: editChannel.sort_order ?? 0,
        });
        toast({ title: "Channel updated" });
      } else {
        await api.post("/admin/support-channels", {
          name: editChannel.name, icon: editChannel.icon || "whatsapp", link: sanitizedLink,
          is_active: editChannel.is_active ?? true, sort_order: channels.length,
        });
        toast({ title: "Channel added" });
      }
      setEditChannel(null);
      fetchChannels();
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/support-channels/${id}`);
      toast({ title: "Deleted" });
      fetchChannels();
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    }
  };

  const handleToggle = async (id: number, is_active: boolean) => {
    try {
      await api.put(`/admin/support-channels/${id}`, { is_active });
      fetchChannels();
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    }
  };

  const handleReorder = async (id: number, direction: "up" | "down") => {
    const idx = channels.findIndex(c => c.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === channels.length - 1)) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    try {
      await Promise.all([
        api.put(`/admin/support-channels/${channels[idx].id}`, { sort_order: channels[swapIdx].sort_order }),
        api.put(`/admin/support-channels/${channels[swapIdx].id}`, { sort_order: channels[idx].sort_order }),
      ]);
      fetchChannels();
    } catch (e: any) {
      toast({ title: "Error", description: errMsg(e, "Please try again."), variant: "destructive" });
    }
  };

  const selectedPreset = CHANNEL_PRESETS.find(p => p.key === editChannel?.icon);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage quick contact options shown to users (WhatsApp, Telegram, etc.)</p>
        </div>
        <Button onClick={() => setEditChannel({ name: "", link: "", icon: "whatsapp", is_active: true })} className="gap-2">
          <Plus className="h-4 w-4" /> Add Channel
        </Button>
      </div>

      {/* Widget Settings Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-sm">Widget Settings</h3>

        {/* Display Mode */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Display style</span>
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button
              onClick={() => handleDisplayModeChange("icons_only")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${displayMode === "icons_only" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Icons Only
            </button>
            <button
              onClick={() => handleDisplayModeChange("icons_with_text")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${displayMode === "icons_with_text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Icons + Text
            </button>
          </div>
        </div>

        {/* Button Label */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Button label</span>
          <Input
            className="w-44"
            value={buttonLabel}
            onChange={e => setButtonLabel(e.target.value)}
            placeholder="More"
          />
        </div>

        {/* Header Title */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Header title</span>
          <Input
            className="w-44"
            value={headerTitle}
            onChange={e => setHeaderTitle(e.target.value)}
            placeholder="e.g. Contact Us"
          />
        </div>

        {/* Position */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Position</span>
          <div className="inline-flex rounded-lg bg-muted p-1 flex-wrap gap-0.5">
            {POSITION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setWidgetPosition(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${widgetPosition === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {widgetPosition === "custom" && (
          <div className="flex items-start gap-3">
            <span className="text-sm text-muted-foreground w-32 shrink-0 pt-1.5">Offsets (px)</span>
            <div className="grid grid-cols-2 gap-2 w-56">
              {(["top", "bottom", "left", "right"] as const).map(side => (
                <div key={side} className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground capitalize w-12">{side}</label>
                  <Input
                    className="w-20 font-mono text-xs"
                    type="number"
                    min="0"
                    value={customPosition[side] ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      setCustomPosition(prev => {
                        const next = { ...prev };
                        if (val === "" || val === "0") {
                          delete next[side];
                        } else {
                          next[side] = val;
                        }
                        return next;
                      });
                    }}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visual Position Preview — Draggable */}
        <div className="flex items-start gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0 pt-1.5">Preview</span>
          <DraggablePreview
            widgetPosition={widgetPosition}
            customPosition={customPosition}
            buttonColor={buttonColor}
            onDrop={(pos) => {
              setWidgetPosition("custom");
              setCustomPosition(pos);
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Button color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={buttonColor || "#6d28d9"}
              onChange={e => setButtonColor(e.target.value)}
              className="h-9 w-9 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
            />
            <Input
              className="w-28 font-mono text-xs"
              value={buttonColor}
              onChange={e => setButtonColor(e.target.value)}
              placeholder="#6d28d9"
            />
            {buttonColor && (
              <button onClick={() => setButtonColor("")} className="text-xs text-muted-foreground hover:text-foreground underline">Reset</button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground w-32 shrink-0">Text color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textColor || "#ffffff"}
              onChange={e => setTextColor(e.target.value)}
              className="h-9 w-9 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
            />
            <Input
              className="w-28 font-mono text-xs"
              value={textColor}
              onChange={e => setTextColor(e.target.value)}
              placeholder="#ffffff"
            />
            {textColor && (
              <button onClick={() => setTextColor("")} className="text-xs text-muted-foreground hover:text-foreground underline">Reset</button>
            )}
          </div>
        </div>

        {/* Preview */}
        {(buttonColor || textColor) && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-32 shrink-0">Preview</span>
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold shadow-md"
              style={{ backgroundColor: buttonColor || "#6d28d9", color: textColor || "#ffffff" }}
            >
              <MessageCircle className="h-4 w-4" />
              <span>{buttonLabel || "More"}</span>
            </div>
          </div>
        )}

        <Button size="sm" onClick={handleSaveWidgetSettings} disabled={settingsSaving} className="gap-1.5">
          {settingsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Settings
        </Button>
      </div>

      {/* Edit/Add Form */}
      {editChannel && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">{editChannel.id ? "Edit Channel" : "New Channel"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel Type</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CHANNEL_PRESETS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setEditChannel({ ...editChannel, icon: p.key, name: editChannel?.name || p.label })}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-medium transition-all ${editChannel.icon === p.key ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <ChannelIcon iconKey={p.key} className="h-6 w-6" colored />
                    <span className="truncate w-full text-center">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                <Input placeholder="WhatsApp" value={editChannel.name || ""} onChange={e => setEditChannel({ ...editChannel, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Link</label>
                <Input
                  placeholder={selectedPreset?.placeholder || "https://..."}
                  value={editChannel.link || ""}
                  onChange={e => setEditChannel({ ...editChannel, link: e.target.value })}
                />
                {selectedPreset && (
                  <p className="text-[10px] text-muted-foreground mt-1">Example: {selectedPreset.placeholder}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editChannel.is_active ?? true} onCheckedChange={v => setEditChannel({ ...editChannel, is_active: v })} />
                <span className="text-sm">Active</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            <Button variant="outline" onClick={() => setEditChannel(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Channel List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : channels.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No support channels yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch, idx) => (
            <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <button disabled={idx === 0} onClick={() => handleReorder(ch.id, "up")} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▲</button>
                <button disabled={idx === channels.length - 1} onClick={() => handleReorder(ch.id, "down")} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▼</button>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <ChannelIcon iconKey={ch.icon} className="h-5 w-5" colored />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{ch.name}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><ExternalLink className="h-3 w-3" />{ch.link}</p>
              </div>
              <Switch checked={ch.is_active} onCheckedChange={v => handleToggle(ch.id, v)} />
              <Button size="sm" variant="ghost" onClick={() => setEditChannel(ch)}>Edit</Button>
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(ch.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Miniature screen with draggable dot
const PREVIEW_W = 192;
const PREVIEW_H = 112;
const CHROME_H = 12;
const DOT_SIZE = 12;

// Map a preset position to pixel coordinates inside the preview
function presetToXY(pos: WidgetPosition): { x: number; y: number } {
  const pad = 6;
  switch (pos) {
    case "top-left": return { x: pad, y: CHROME_H + pad };
    case "top-right": return { x: PREVIEW_W - DOT_SIZE - pad, y: CHROME_H + pad };
    case "bottom-left": return { x: pad, y: PREVIEW_H - DOT_SIZE - pad };
    case "bottom-right":
    default: return { x: PREVIEW_W - DOT_SIZE - pad, y: PREVIEW_H - DOT_SIZE - pad };
  }
}

function customToXY(cp: CustomPosition): { x: number; y: number } {
  // Scale: 1 real px ≈ preview_size / ~1500
  const scaleX = (PREVIEW_W - DOT_SIZE) / 1500;
  const scaleY = (PREVIEW_H - CHROME_H - DOT_SIZE) / 900;

  let x: number;
  if (cp.left) x = Math.min(Number(cp.left) * scaleX, PREVIEW_W - DOT_SIZE);
  else if (cp.right) x = Math.max(PREVIEW_W - DOT_SIZE - Number(cp.right) * scaleX, 0);
  else x = PREVIEW_W - DOT_SIZE - 6;

  let y: number;
  if (cp.top) y = CHROME_H + Math.min(Number(cp.top) * scaleY, PREVIEW_H - CHROME_H - DOT_SIZE);
  else if (cp.bottom) y = Math.max(PREVIEW_H - DOT_SIZE - Number(cp.bottom) * scaleY, CHROME_H);
  else y = PREVIEW_H - DOT_SIZE - 6;

  return { x, y };
}

function DraggablePreview({
  widgetPosition,
  customPosition,
  buttonColor,
  onDrop,
}: {
  widgetPosition: WidgetPosition;
  customPosition: CustomPosition;
  buttonColor: string;
  onDrop: (pos: CustomPosition) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Compute position from props
  useEffect(() => {
    if (widgetPosition === "custom") {
      setPos(customToXY(customPosition));
    } else {
      setPos(presetToXY(widgetPosition));
    }
  }, [widgetPosition, customPosition]);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left - DOT_SIZE / 2, 0, PREVIEW_W - DOT_SIZE);
    const y = clamp(e.clientY - rect.top - DOT_SIZE / 2, CHROME_H, PREVIEW_H - DOT_SIZE);
    setPos({ x, y });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    // Convert preview coords back to real pixel offsets
    const scaleX = 1500 / (PREVIEW_W - DOT_SIZE);
    const scaleY = 900 / (PREVIEW_H - CHROME_H - DOT_SIZE);

    const midX = PREVIEW_W / 2;
    const midY = (PREVIEW_H + CHROME_H) / 2;

    const newPos: CustomPosition = {};
    if (pos.y < midY) {
      newPos.top = String(Math.round((pos.y - CHROME_H) * scaleY));
    } else {
      newPos.bottom = String(Math.round((PREVIEW_H - DOT_SIZE - pos.y) * scaleY));
    }
    if (pos.x < midX) {
      newPos.left = String(Math.round(pos.x * scaleX));
    } else {
      newPos.right = String(Math.round((PREVIEW_W - DOT_SIZE - pos.x) * scaleX));
    }
    onDrop(newPos);
  }, [dragging, pos, onDrop]);

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none rounded-lg border-2 border-border bg-muted/30 overflow-hidden"
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Chrome bar */}
      <div className="absolute inset-x-0 top-0 flex items-center px-1.5 gap-0.5 bg-muted/60 border-b border-border" style={{ height: CHROME_H }}>
        <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      {/* Draggable dot */}
      <div
        onPointerDown={handlePointerDown}
        className={`absolute rounded-full shadow-md cursor-grab active:cursor-grabbing ring-2 ring-transparent hover:ring-primary/40 transition-shadow ${dragging ? "ring-primary/60 scale-125" : ""}`}
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          backgroundColor: buttonColor || "hsl(var(--primary))",
          left: pos.x,
          top: pos.y,
          transition: dragging ? "none" : "left 0.3s, top 0.3s",
        }}
      />
      {/* Hint */}
      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/50 pointer-events-none">
        drag to position
      </span>
    </div>
  );
}

export default AdminSupportChannels;
