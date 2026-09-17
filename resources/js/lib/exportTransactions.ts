// jspdf / jspdf-autotable are dynamically imported inside downloadPdf so the
// ~300KB PDF engine is only fetched when the user actually exports a PDF.
import api from "@/services/api";


export type SavedExportFilters = {
  from: string;
  to: string;
  typeFilter: "all" | "deposit" | "withdraw" | "redeem" | "transfer";
  statusFilter: "all" | "pending" | "completed" | "rejected";
  filenameBase?: string;
  includeDateInName?: boolean;
};

/**
 * `exportRequestId` is required for manager downloads (the backend re-validates
 * that the id belongs to the caller, is approved, and hasn't expired) — admins
 * pass nothing and get direct access. See AdminTransactionApiController::export.
 */
export async function fetchTransactionRows(f: SavedExportFilters, exportRequestId?: number | string): Promise<TxRow[]> {
  const { data } = await api.get("/admin/transactions/export", {
    params: {
      from: f.from,
      to: f.to,
      type: f.typeFilter,
      status: f.statusFilter,
      export_request_id: exportRequestId,
    },
  });
  return (data.rows || []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    type: r.type,
    status: r.status,
    amount: Number(r.amount),
    notes: r.notes,
    user_label: r.user_label || "User",
    game_label: r.game_label || "—",
  }));
}

export function buildExportFilename(f: SavedExportFilters, ext: "csv" | "pdf") {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const base = sanitize(f.filenameBase || "transactions") || "transactions";
  const suffix = f.includeDateInName === false ? "" : `_${f.from}_to_${f.to}`;
  return `${base}${suffix}.${ext}`;
}



export type TxRow = {
  id: string;
  created_at: string;
  type: string;
  status: string;
  amount: number;
  user_label: string;
  game_label: string;
  notes: string | null;
};

export type ExportBranding = {
  siteName: string;
  logoUrl: string | null;
  primaryColor?: string; // hex like "#3b82f6"
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const formatAmount = (n: number) =>
  `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const csvEscape = (val: any) => {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function downloadCsv(filename: string, rows: TxRow[]) {
  const headers = ["Date", "Type", "Status", "Amount", "User", "Game", "Notes", "Transaction ID"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      formatDate(r.created_at),
      r.type,
      r.status,
      r.amount,
      r.user_label,
      r.game_label,
      r.notes || "",
      r.id,
    ].map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [59, 130, 246];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Semantic accent color per transaction type — mirrors the status-badge colors used in the app UI. */
const TYPE_COLOR: Record<string, [number, number, number]> = {
  deposit: [5, 150, 105], // emerald
  withdraw: [225, 29, 72], // rose
  redeem: [37, 99, 235], // blue
  transfer: [124, 58, 237], // violet
};
const TYPE_ORDER = ["deposit", "withdraw", "redeem", "transfer"];

export async function downloadPdf(
  filename: string,
  rows: TxRow[],
  meta: {
    branding: ExportBranding;
    title: string;
    dateRange: string;
    typeFilter: string;
    statusFilter: string;
    generatedBy: string;
  }
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const primary = hexToRgb(meta.branding.primaryColor || "#3b82f6");
  const border: [number, number, number] = [223, 227, 232];
  const label: [number, number, number] = [110, 116, 126];
  const value: [number, number, number] = [30, 33, 38];

  // ---- Header banner ----
  const headerH = 76;
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pageW, headerH, "F");

  let textX = margin;
  if (meta.branding.logoUrl) {
    const img = await loadImageAsDataUrl(meta.branding.logoUrl);
    if (img && img.w && img.h) {
      const targetH = 40;
      const targetW = (img.w / img.h) * targetH;
      try {
        doc.addImage(img.dataUrl, "PNG", margin, (headerH - targetH) / 2, targetW, targetH);
        textX = margin + targetW + 16;
      } catch {
        /* ignore */
      }
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(meta.branding.siteName, textX, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(meta.title, textX, 58);

  // ---- Report info card (bordered, two-column key/value) ----
  const cardY = headerH + 18;
  const cardH = 66;
  doc.setDrawColor(border[0], border[1], border[2]);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, cardY, pageW - margin * 2, cardH, 5, 5, "FD");

  const padX = 16;
  const lineH = 17;
  const leftRows: [string, string][] = [
    ["Date range", meta.dateRange],
    ["Transaction type", titleCase(meta.typeFilter)],
    ["Status", titleCase(meta.statusFilter)],
  ];
  const rightRows: [string, string][] = [
    ["Generated", new Date().toLocaleString()],
    ["Generated by", meta.generatedBy],
    ["Total rows", String(rows.length)],
  ];

  doc.setFontSize(9);
  leftRows.forEach(([l, v], i) => {
    const y = cardY + 22 + i * lineH;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(label[0], label[1], label[2]);
    doc.text(`${l}:`, margin + padX, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(value[0], value[1], value[2]);
    doc.text(v, margin + padX + 100, y);
  });
  // Right column: each "Label: value" pair drawn as two right-aligned runs so
  // the whole pair's right edge lines up cleanly regardless of value length.
  rightRows.forEach(([l, v], i) => {
    const y = cardY + 22 + i * lineH;
    const combined = `${l}: `;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(value[0], value[1], value[2]);
    doc.text(v, pageW - margin - padX, y, { align: "right" });
    const vW = doc.getTextWidth(v);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(label[0], label[1], label[2]);
    doc.text(combined, pageW - margin - padX - vW, y, { align: "right" });
  });

  // ---- Summary chips (one per transaction type present) ----
  const totals: Record<string, { count: number; sum: number }> = {};
  rows.forEach((r) => {
    if (!totals[r.type]) totals[r.type] = { count: 0, sum: 0 };
    totals[r.type].count += 1;
    totals[r.type].sum += Number(r.amount) || 0;
  });
  const typesPresent = [
    ...TYPE_ORDER.filter((t) => totals[t]),
    ...Object.keys(totals).filter((t) => !TYPE_ORDER.includes(t)),
  ];

  let chipsBottom = cardY + cardH + 14;
  if (typesPresent.length) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    let cx = margin;
    let cy = chipsBottom;
    const chipH = 22;
    typesPresent.forEach((t) => {
      const v = totals[t];
      const text = `${titleCase(t)}  ${v.count} · ${formatAmount(v.sum)}`;
      const textW = doc.getTextWidth(text);
      const chipW = textW + 20;
      if (cx + chipW > pageW - margin) {
        cx = margin;
        cy += chipH + 6;
      }
      const [r, g, b] = TYPE_COLOR[t] || [100, 116, 139];
      // Soft tinted background with a solid-color left accent bar.
      doc.setFillColor(Math.round(r + (255 - r) * 0.88), Math.round(g + (255 - g) * 0.88), Math.round(b + (255 - b) * 0.88));
      doc.roundedRect(cx, cy, chipW, chipH, 4, 4, "F");
      doc.setFillColor(r, g, b);
      doc.rect(cx, cy, 3, chipH, "F");
      doc.setTextColor(Math.round(r * 0.7), Math.round(g * 0.7), Math.round(b * 0.7));
      doc.text(text, cx + 12, cy + chipH / 2 + 3);
      cx += chipW + 8;
    });
    chipsBottom = cy + chipH;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(value[0], value[1], value[2]);
    doc.text("No transactions in this selection.", margin, chipsBottom + 10);
    chipsBottom += 14;
  }

  // ---- Table ----
  autoTable(doc, {
    startY: chipsBottom + 16,
    head: [["Date", "Type", "Status", "Amount", "User", "Game", "Notes"]],
    body: rows.map((r) => [
      formatDate(r.created_at),
      titleCase(r.type),
      titleCase(r.status),
      formatAmount(r.amount),
      r.user_label,
      r.game_label,
      r.notes || "",
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 6, overflow: "linebreak", lineColor: border, lineWidth: 0.5 },
    headStyles: {
      fillColor: [primary[0], primary[1], primary[2]],
      textColor: 255,
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { cellWidth: 55 },
      2: { cellWidth: 62 },
      3: { cellWidth: 68, halign: "right" },
      4: { cellWidth: 88 },
      5: { cellWidth: 68 },
      6: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin, bottom: 40 },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(border[0], border[1], border[2]);
      doc.line(margin, pageH - 30, pageW - margin, pageH - 30);

      const pageCount = (doc as any).internal.getNumberOfPages();
      const cur = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 145, 152);
      doc.text(meta.branding.siteName, margin, pageH - 18);
      doc.text("System-generated report", pageW / 2, pageH - 18, { align: "center" });
      doc.text(`Page ${cur} of ${pageCount}`, pageW - margin, pageH - 18, { align: "right" });
    },
  });

  doc.save(filename);
}
