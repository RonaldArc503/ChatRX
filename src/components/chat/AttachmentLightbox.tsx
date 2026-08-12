import type { ChatAttachment } from "../../lib/chat";
import { attachmentMediaUrl } from "../../lib/cloudinary";

interface AttachmentLightboxProps {
  attachment: ChatAttachment;
  caption: string;
  onClose: () => void;
}

export function AttachmentLightbox({
  attachment,
  caption,
  onClose,
}: AttachmentLightboxProps) {
  return (
    <div
      class="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div
        class="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span class="min-w-0 truncate text-sm font-semibold">
          {attachment.name}
        </span>
        <div class="flex flex-none items-center gap-2">
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            aria-label="Abrir en pestaña nueva"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
            </svg>
          </a>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        class="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {attachment.kind === "image" ? (
          <img
            src={attachmentMediaUrl(attachment.url, "f_auto,q_auto")}
            alt={attachment.name}
            class="max-h-full max-w-full rounded-lg object-contain"
          />
        ) : attachment.kind === "pdf" ? (
          <iframe
            src={`${attachment.url}${attachment.url.includes("?") ? "&" : "?"}#view=FitH`}
            title={attachment.name}
            class="h-full w-full rounded-lg bg-white"
          />
        ) : null}
      </div>

      {caption ? (
        <p
          class="mx-auto flex-none max-w-3xl px-6 pb-6 text-center text-sm text-slate-300"
          onClick={(e) => e.stopPropagation()}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}