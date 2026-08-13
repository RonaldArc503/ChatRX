export type AttachmentKind =
  | "image"
  | "video"
  | "pdf"
  | "doc"
  | "file"
  | "audio";

export interface CloudinaryUploadResult {
  resourceType: string;
  url: string;
  publicId: string;
  bytes: number;
  format: string;
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 30;

const cloudName = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME || "lrpsglzl";
const uploadPreset =
  import.meta.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || "chat_uploads";
const apiKey = import.meta.env.PUBLIC_CLOUDINARY_API_KEY || "811998144818725";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/flac",
]);

export function classificationFor(file: {
  name: string;
  type: string;
}): AttachmentKind {
  const t = file.type.toLowerCase();
  if (IMAGE_TYPES.has(t)) return "image";
  if (VIDEO_TYPES.has(t)) return "video";
  if (AUDIO_TYPES.has(t) || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(file.name))
    return "audio";
  if (t === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (t.includes("word") || /\.docx?$/i.test(file.name) || /officedocument\.wordprocessingml/i.test(t))
    return "doc";
  return "file";
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function attachmentMediaUrl(url: string, trans: string): string {
  const transformed = url.replace(/\/(image|video|raw)\/upload\//, `/$1/upload/${trans}/`);
  return transformed === url ? url : transformed;
}

export function uploadToCloudinary(
  file: File,
  uid: string,
  onProgress: (progress: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", uploadPreset);
    form.append("api_key", apiKey);
    form.append("folder", `taskly/${uid}`);
    form.append("resource_type", "auto");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve({
            resourceType: json.resource_type as string,
            url: json.secure_url as string,
            publicId: json.public_id as string,
            bytes: json.bytes as number,
            format: json.format as string,
            width: typeof json.width === "number" ? json.width : undefined,
            height: typeof json.height === "number" ? json.height : undefined,
            duration: typeof json.duration === "number" ? Number(json.duration) : undefined,
            pages: typeof json.pages === "number" ? json.pages : undefined,
          });
        } catch {
          reject(new Error("Respuesta inválida de Cloudinary."));
        }
      } else {
        reject(new Error("No se pudo subir el archivo."));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red al subir el archivo."));
    xhr.ontimeout = () => reject(new Error("Se agotó el tiempo de subida."));
    xhr.send(form);
  });
}