import api from "@/services/api";

export type UploadFolder =
  | "avatars"
  | "game-images"
  | "gateway-qr"
  | "brand-assets"
  | "landing-images"
  | "chat-images"
  | "withdraw-proof"
  | "deposit-proof";

/**
 * Compress image file client-side before sending to server to prevent 413 Payload Too Large.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 250 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

/**
 * Every upload component's catch block was building its own message from
 * err.response?.data?.message — fine for a real Laravel validation error, but a raw HTTP 413
 * (Payload Too Large) never reaches Laravel at all — nginx/PHP reject it first with no JSON
 * body, so err.response?.data?.message is undefined and axios's own "Request failed with status
 * code 413" leaked straight to the user. compressImage() above already resizes most oversized
 * photos before they get anywhere near that limit, but this is the safety net for whatever still
 * gets through (HEIC/unusual formats compression skips, a server limit lower than expected, etc).
 */
export function getUploadErrorMessage(err: any): string {
  if (err?.response?.status === 413) {
    return "This image is too large for the server to accept. Please try a smaller screenshot or a lower-resolution photo.";
  }
  return err?.response?.data?.message || err?.message || "Upload failed. Please try again.";
}

export async function uploadFile(file: File, folder: UploadFolder): Promise<string> {
  const fileToUpload = await compressImage(file);
  const formData = new FormData();
  formData.append("file", fileToUpload);
  formData.append("folder", folder);
  
  const res = await api.post("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  
  return res.data.url as string;
}
