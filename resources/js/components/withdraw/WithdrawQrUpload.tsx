import { useState, useRef } from "react";
import { Upload, X, Loader2, CheckCircle, QrCode } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { uploadFile, getUploadErrorMessage } from "@/lib/uploadFile";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

interface Props {
  onUploadComplete: (url: string) => void;
  onRemove: () => void;
  uploadedUrl: string | null;
}

export const WithdrawQrUpload = ({ onUploadComplete, onRemove, uploadedUrl }: Props) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Only JPG, PNG, and WEBP images are allowed", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "Image must be under 5MB", variant: "destructive" });
      return;
    }
    if (!user) return;

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    try {
      const url = await uploadFile(file, "withdraw-proof");
      onUploadComplete(url);
      toast({ title: "QR code uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: getUploadErrorMessage(err), variant: "destructive" });
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    setPreview(null);
    onRemove();
    if (inputRef.current) inputRef.current.value = "";
  };

  const displayUrl = preview || uploadedUrl;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted-foreground">
        Upload Your QR Code <span className="text-muted-foreground/60">(Optional)</span>
      </label>

      {displayUrl ? (
        <div className="relative rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-3">
            <img
              src={displayUrl}
              alt="QR Code"
              className="h-20 w-20 rounded-lg object-cover border border-border"
            />
            <div className="flex-1 min-w-0">
              {uploading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  QR code uploaded
                </div>
              )}
            </div>
            {!uploading && (
              <button
                onClick={handleRemove}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/20 p-4 text-center hover:border-primary/50 hover:bg-muted/30 transition-all active:scale-[0.98]"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Tap to upload your QR code</p>
            <p className="text-xs text-muted-foreground">JPG, PNG or WEBP • Max 5MB</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
};
