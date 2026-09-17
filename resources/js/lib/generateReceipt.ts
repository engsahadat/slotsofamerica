// qrcode is dynamically imported inside the receipt generator so it's only
// fetched when a user actually downloads a receipt.


export interface ReceiptData {
  transactionId: string;
  username: string;
  transactionType: string;
  amount: number;
  tip?: number;
  paymentMethod: string;
  dateTime: string;
  siteName: string;
  logoUrl: string | null;
}

function hslToRgb(hslStr: string): string {
  try {
    const parts = hslStr.trim().split(/\s+/);
    const h = parseFloat(parts[0]) / 360;
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  } catch {
    return "rgb(77, 163, 255)";
  }
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generateReceiptImage(data: ReceiptData): Promise<Blob> {
  const W = 800;
  const H = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Get theme colors from CSS variables
  const bgColor = hslToRgb(getCSSVar("background") || "222 47% 11%");
  const cardColor = hslToRgb(getCSSVar("card") || "217 33% 17%");
  const primaryColor = hslToRgb(getCSSVar("primary") || "212 100% 65%");
  const fgColor = hslToRgb(getCSSVar("foreground") || "210 40% 98%");
  const mutedFgColor = hslToRgb(getCSSVar("muted-foreground") || "226 40% 65%");
  const borderColor = hslToRgb(getCSSVar("border") || "217 20% 20%");

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Card
  const cardX = 40, cardY = 40, cardW = W - 80, cardH = H - 80;
  ctx.fillStyle = cardColor;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top accent bar
  ctx.fillStyle = primaryColor;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, 6, [20, 20, 0, 0]);
  ctx.fill();

  let y = cardY + 50;

  // Logo
  if (data.logoUrl) {
    try {
      const logo = await loadImage(data.logoUrl);
      const logoH = 50;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, y, logoW, logoH);
      y += logoH + 16;
    } catch {
      // skip logo
    }
  }

  // Site Name
  ctx.fillStyle = fgColor;
  ctx.font = "bold 28px 'Orbitron', 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.siteName.toUpperCase(), W / 2, y + 28);
  y += 50;

  // Title
  ctx.fillStyle = primaryColor;
  ctx.font = "bold 22px 'Inter', sans-serif";
  ctx.fillText("TRANSACTION RECEIPT", W / 2, y + 22);
  y += 50;

  // Separator
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 40, y);
  ctx.lineTo(cardX + cardW - 40, y);
  ctx.stroke();
  y += 30;

  // Details
  const withdrawAmount = data.tip ? data.amount - data.tip : data.amount;
  const fields = [
    { label: "Transaction ID", value: data.transactionId },
    { label: "Username", value: data.username },
    { label: "Type", value: data.transactionType.toUpperCase() },
    { label: "Amount", value: `$${withdrawAmount.toFixed(2)} USD` },
    ...(data.tip && data.tip > 0 ? [{ label: "Tip", value: `$${data.tip.toFixed(2)} USD` }] : []),
    { label: "Total", value: `$${data.amount.toFixed(2)} USD` },
    { label: "Payment Method", value: data.paymentMethod },
    { label: "Date & Time", value: data.dateTime },
    { label: "Status", value: "Pending Verification" },
  ];

  ctx.textAlign = "left";
  for (const field of fields) {
    // Label
    ctx.fillStyle = mutedFgColor;
    ctx.font = "500 14px 'Inter', sans-serif";
    ctx.fillText(field.label, cardX + 60, y);

    // Value
    ctx.fillStyle = field.label === "Status" ? primaryColor : fgColor;
    ctx.font = field.label === "Amount" ? "bold 18px 'Inter', sans-serif" : "600 16px 'Inter', sans-serif";
    ctx.fillText(field.value, cardX + 60, y + 24);

    // Line
    y += 60;
    if (field.label !== "Status") {
      ctx.strokeStyle = borderColor;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(cardX + 60, y - 10);
      ctx.lineTo(cardX + cardW - 60, y - 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  y += 10;

  // Separator
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 40, y);
  ctx.lineTo(cardX + cardW - 40, y);
  ctx.stroke();
  y += 25;

  // QR Code
  try {
    const { default: QRCode } = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL("https://livechat.link", {
      width: 120,
      margin: 1,
      color: { dark: "#ffffff", light: "#00000000" },
    });
    const qrImg = await loadImage(qrDataUrl);
    const qrSize = 100;
    ctx.drawImage(qrImg, (W - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 10;
    ctx.fillStyle = mutedFgColor;
    ctx.font = "400 11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scan to open live chat", W / 2, y + 10);
    y += 30;
  } catch {
    // skip QR
  }

  // Support note
  ctx.fillStyle = primaryColor;
  ctx.font = "600 13px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Send this receipt to live chat for verification.", W / 2, y + 10);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.92);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
