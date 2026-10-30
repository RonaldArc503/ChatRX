import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  deleteMessage,
  editMessage,
  markConversationRead,
  pinMessage,
  sendMessage,
  subscribeMessages,
  toggleReaction,
  unpinMessage,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
} from "../../lib/chat";
import {
  classificationFor,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  uploadToCloudinary,
} from "../../lib/cloudinary";
import {
  clearTyping,
  setTyping,
  subscribeTyping,
} from "../../lib/typing";
import { optimizeVideo } from "../../lib/videoOptimizer";
import { updatePlaylist } from "../../lib/audioPlayer";
import { splitLinks } from "./linkify";
import {
  createSavedItem,
  saveMessage,
} from "../../lib/saved";
import {
  flushFirestoreWrites,
  isOnline,
  subscribeOnlineChange,
} from "../../lib/offline";
import {
  type PendingMessage,
  enqueuePending,
  flushPending,
  listPending,
  newLocalId,
  removePending,
} from "../../lib/pendingMessages";
import { isOnlineNow, type Presence } from "../../lib/presence";
import type { UserProfile } from "../../lib/profile";
import { AttachmentLightbox, type LightboxItem } from "./AttachmentLightbox";
import { Avatar, GroupAvatar } from "./Avatar";
import { peerOf } from "./ConversationList";
import { ForwardSheet } from "./ForwardSheet";
import { GroupInfoSheet } from "./GroupInfoSheet";
import { extractMentions, mentionContacts } from "./mention";
import { MessageActionsSheet, type MessageMenuAnchor } from "./MessageActionsSheet";
import { MessageBubble } from "./MessageBubble";
import { ThreadPanel, type ThreadDraft } from "./ThreadPanel";
import { buildMessageThreads, sameMessageDelivery } from "../../lib/chatThreads";
import { formatDayLabel, formatLastSeen, sameDay } from "./time";
import { trimFormattedText, type TextFormat } from "../../lib/messageFormatting";
import { MessageTextEditor, type MessageEditorHandle } from "./MessageTextEditor";

interface AttachmentDraft {
  id: string;
  file: File;
  kind: "image" | "video" | "pdf" | "doc" | "file" | "audio";
  status: "ready" | "optimizing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  attach?: ChatAttachment;
  previewUrl?: string;
}

interface ConversationWindowProps {
  me: UserProfile;
  conv: ChatConversation;
  peerPresence?: Presence | null;
  conversations: ChatConversation[];
  onBack: () => void;
}

function mergePendingMessages(
  real: ChatMessage[],
  pendingMsgs: ChatMessage[],
): ChatMessage[] {
  if (pendingMsgs.length === 0) return real;
  const realIds = new Set(real.map((m) => m.id));
  const merged = [...real];
  for (const pm of pendingMsgs) {
    if (realIds.has(pm.id)) continue;
    const duplicated = real.some((m) => sameMessageDelivery(m, pm));
    if (duplicated) {
      removePending(pm.id).catch(() => {});
      continue;
    }
    merged.push(pm);
  }
  merged.sort((a, b) => a.createdAt - b.createdAt);
  return merged;
}

export function ConversationWindow({
  me,
  conv,
  peerPresence,
  conversations,
  onBack,
}: ConversationWindowProps) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [formatting, setFormatting] = useState<TextFormat[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MessageMenuAnchor | null>(null);
  const [menuScope, setMenuScope] = useState<"main" | "thread">("main");
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadDrafts, setThreadDrafts] = useState<Record<string, ThreadDraft>>({});
  const [inlineEditing, setInlineEditing] = useState<{ id: string; scope: "main" | "thread" } | null>(null);
  const [threadFocus, setThreadFocus] = useState(0);
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadDocked, setThreadDocked] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    const observer = new ResizeObserver(() => setThreadDocked(layout.clientWidth >= 800));
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [replyMsg, setReplyMsg] = useState<ChatMessage | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [showJump, setShowJump] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<AttachmentDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const [lightbox, setLightbox] = useState<{
    list: LightboxItem[];
    index: number;
  } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [online, setOnline] = useState(() => isOnline());
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const entryPending = useRef(false);
  const inputRef = useRef<MessageEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const flushing = useRef(false);
  const lastScrollH = useRef<number | null>(null);
  const NEAR_BOTTOM_PX = 120;
  const visibleMessagesRef = useRef<ChatMessage[]>([]);

let coarsePointer: boolean | null = null;
function isCoarsePointer(): boolean {
  if (coarsePointer === null) {
    coarsePointer =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
  }
  return coarsePointer;
}
  function scrollToAbsoluteEnd() {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.max(0, max);
  }

  function settleEntryScroll() {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el) return;

    const resettle = () => {
      requestAnimationFrame(() => {
        scrollToAbsoluteEnd();
        setShowJump(false);
      });
    };
    resettle();

    let stopped = false;
    let ro: ResizeObserver | null = null;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      ro?.disconnect();
      window.clearTimeout(timer);
      resettle();
    };
    const timer = window.setTimeout(stop, 1200);

    if (content && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (stopped) return;
        resettle();
      });
      ro.observe(content);
    }
  }

  const peer = peerOf(conv, me.uid);
  const isGroup = peer.isGroup;
  const members = conv.members ?? {};
  const mentionContactsList = mentionContacts(members, me.uid);
  const mentionFiltered = mentionOpen
    ? mentionContactsList.filter((c) =>
        c.displayName.toLowerCase().includes(mentionQuery.toLowerCase()),
      )
    : mentionContactsList;

  const imageGallery: LightboxItem[] = messages.flatMap((m) =>
    (m.attachments ?? [])
      .filter((a) => a.kind === "image")
      .map((a) => ({ a, caption: m.text })),
  );

  function openLightbox(m: ChatMessage, a: ChatAttachment) {
    if (a.kind === "image") {
      const idx = imageGallery.findIndex((it) => it.a.publicId === a.publicId);
      setLightbox({ list: imageGallery, index: Math.max(0, idx) });
    } else {
      setLightbox({ list: [{ a, caption: m.text }], index: 0 });
    }
  }

  function handleForward(m: ChatMessage) {
    setMenuMsg(null);
    setForwardMsg(m);
  }

  async function handleSave(m: ChatMessage) {
    setMenuMsg(null);
    const text = m.text.trim();
    if (!text && !(m.attachments && m.attachments.length > 0)) return;
    const links = splitLinks(text)
      .filter((seg) => seg.url)
      .map((seg) => seg.url as string);
    const senderName = m.senderId === me.uid
      ? me.displayName
      : isGroup
        ? members[m.senderId]?.displayName || "Miembro"
        : peer.name;
    const item = createSavedItem({
      kind: links.length > 0 && !(m.attachments && m.attachments.length > 0)
        ? "link"
        : "message",
      text,
      links,
      attachments: m.attachments ?? [],
      senderId: m.senderId,
      senderName,
      convId: conv.id,
      convName: peer.isGroup ? conv.name || "Grupo" : peer.name,
      createdAt: m.createdAt,
    });
    try {
      await saveMessage(me.uid, item);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo guardar el mensaje.",
      );
    }
  }

  useEffect(() => {
    setMessages([]);
    return subscribeMessages(conv.id, setMessages);
  }, [conv.id]);

  useEffect(() => {
    const tracks = messages.flatMap((m) =>
      (m.attachments ?? [])
        .filter((a) => a.kind === "audio")
        .map((a) => ({
          id: a.publicId,
          url: a.url,
          name: a.name,
          msgId: m.id,
        })),
    );
    updatePlaylist(tracks);
  }, [messages]);

  useEffect(() => {
    return subscribeTyping(conv.id, setTypingMap);
  }, [conv.id]);

  useEffect(() => {
    if ((conv.unread?.[me.uid] ?? 0) > 0) markConversationRead(conv.id, me.uid);
  }, [conv.id, conv.unread?.[me.uid], me.uid]);

  useEffect(() => {
    let active = true;
    listPending(conv.id).then((list) => {
      if (active) setPending(list);
    });
    return () => {
      active = false;
    };
  }, [conv.id, online]);

  useEffect(() => {
    return subscribeOnlineChange(setOnline);
  }, []);

  useEffect(() => {
    if (!online || flushing.current) return;
    let active = true;
    flushing.current = true;
    (async () => {
      const pendingList = await listPending();
      if (pendingList.length > 0) {
        await flushPending((pm) =>
          sendMessage(
            pm.convId,
            pm.senderId,
            pm.text,
            pm.replyTo ?? null,
            undefined,
            pm.mentions,
            pm.forwardedFrom ?? null,
            pm.formatting,
          ),
        );
      }
      await flushFirestoreWrites();
      if (active) {
        listPending(conv.id).then(setPending);
      }
    })()
      .catch(() => {})
      .finally(() => {
        flushing.current = false;
      });
    return () => {
      active = false;
    };
  }, [online, conv.id]);

  useEffect(() => {
    stickRef.current = true;
    entryPending.current = true;
    setShowJump(false);
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && messages.length === 0) el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [conv.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    lastScrollH.current = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const cur = el.clientHeight;
      const prev = lastScrollH.current;
      lastScrollH.current = cur;
      if (stickRef.current) {
        scrollToAbsoluteEnd();
        return;
      }
      if (prev === null || prev === cur) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(el.scrollTop + (prev - cur), max));
    });
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [desktop, messages.length > 0]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    if (entryPending.current) {
      entryPending.current = false;
      requestAnimationFrame(() => {
        settleEntryScroll();
      });
      return;
    }
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      setShowJump(true);
    }
  }, [messages]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setEditing(null);
    setThreadRootId(null);
    setInlineEditing(null);
    setThreadBusy(false);
    setMenuMsg(null);
    setForwardMsg(null);
    setReplyMsg(null);
    setText(""); setFormatting([]);
    setSendError(null);
    setLightbox(null);
    setHighlightedId(null);
    if (highlightTimer.current !== null) {
      window.clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }
    setUploading(false);
    setPinnedIndex(0);
    clearDraftUrls();
    setPendingFiles([]);
  }, [conv.id]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const pinnedList = conv.pinnedMessages ?? [];
  useEffect(() => {
    if (pinnedList.length === 0) {
      setPinnedIndex(0);
    } else if (pinnedIndex >= pinnedList.length) {
      setPinnedIndex(pinnedList.length - 1);
    }
  }, [pinnedList.length, pinnedIndex]);

  useEffect(() => {
    return () => clearTyping(conv.id, me.uid);
  }, [conv.id, me.uid]);

  useEffect(() => {
    if (mentionOpen && mentionIndex >= mentionFiltered.length) {
      setMentionIndex(Math.max(mentionFiltered.length - 1, 0));
    }
  }, [mentionFiltered.length, mentionIndex, mentionOpen]);

  const typingFrom = peer.isSelf ? undefined : typingMap[peer.uid];
  const peerTyping = typingFrom !== undefined && now - typingFrom < 3500;

  const typingUids = Object.entries(typingMap)
    .filter(([uid, ts]) => uid !== me.uid && now - ts < 3500)
    .map(([uid]) => uid);
  const groupTypingText = (() => {
    if (!isGroup || typingUids.length === 0) return null;
    const names = typingUids.slice(0, 2).map((uid) => members[uid]?.displayName || "Alguien");
    if (typingUids.length === 1) return `${names[0]} está escribiendo…`;
    if (typingUids.length === 2) return `${names[0]} y ${names[1]} están escribiendo…`;
    return `${names[0]} y ${typingUids.length - 1} más están escribiendo…`;
  })();

  function isNearBottom(el: HTMLDivElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottom(el)) {
      stickRef.current = true;
      setShowJump(false);
    } else if (stickRef.current) {
      stickRef.current = false;
    }
  }

  function jumpToBottom() {
    stickRef.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function scrollToMessage(msgId: string) {
    const root = threads.rootById.get(msgId);
    if (desktop && root && root !== msgId) {
      setThreadRootId(root);
      setThreadFocus((value) => value + 1);
      highlightMessage(msgId);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(msgId)}"]`,
    );
    if (!target) return;
    stickRef.current = false;
    setShowJump(false);

    const containerRect = el.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta =
      targetRect.top -
      containerRect.top -
      containerRect.height / 2 +
      target.offsetHeight / 2;
    el.scrollTo({
      top: el.scrollTop + delta,
      behavior: "smooth",
    });
    highlightMessage(msgId);
  }

  function highlightMessage(msgId: string) {
    setHighlightedId(msgId);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      setHighlightedId(null);
      highlightTimer.current = null;
    }, 2500);
  }

  function clearDraftUrls() {
    setPendingFiles((prev) => {
      prev.forEach((d) => {
        if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      });
      return prev;
    });
  }

  function addFiles(files: File[]) {
    if (files.length === 0 || uploading) return;
    setSendError(null);
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
        const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const kind = classificationFor(file);
        const tooBig = file.size > MAX_ATTACHMENT_BYTES;
        next.push({
          id,
          file,
          kind,
          status: tooBig ? "error" : "ready",
          progress: 0,
          error: tooBig ? "Excede 20 MB" : undefined,
          previewUrl:
            kind === "image" || kind === "video"
              ? URL.createObjectURL(file)
              : undefined,
        });
      }
      return next;
    });
  }

  function handleFilesChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    addFiles(files);
  }

  function handlePaste(e: ClipboardEvent) {
    if (editing || uploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  function handleDragEnter(e: DragEvent) {
    if (uploading || editing || !e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current++;
    setDragActive(true);
  }

  function handleDragOver(e: DragEvent) {
    if (uploading || editing) return;
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  }

  function handleDragLeave() {
    if (dragDepth.current === 0) return;
    dragDepth.current--;
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    addFiles(files);
  }

  function removeDraft(id: string) {
    setPendingFiles((prev) => {
      const draft = prev.find((d) => d.id === id);
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  }

  async function uploadDraft(d: AttachmentDraft): Promise<ChatAttachment | null> {
    if (d.file.size > MAX_ATTACHMENT_BYTES) {
      setPendingFiles((prev) =>
        prev.map((x) =>
          x.id === d.id ? { ...x, status: "error" as const, error: "Excede 20 MB" } : x,
        ),
      );
      return null;
    }
    setPendingFiles((prev) =>
      prev.map((x) =>
        x.id === d.id ? { ...x, status: "uploading" as const, progress: 0 } : x,
      ),
    );

    let fileToUpload = d.file;
    if (d.kind === "video" && fileToUpload.size > 5 * 1024 * 1024) {
      setPendingFiles((prev) =>
        prev.map((x) =>
          x.id === d.id ? { ...x, status: "optimizing" as const } : x,
        ),
      );
      const optimized = await optimizeVideo(fileToUpload);
      if (optimized !== fileToUpload) {
        if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
        fileToUpload = optimized;
        const previewUrl = URL.createObjectURL(fileToUpload);
        setPendingFiles((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? { ...x, file: fileToUpload, previewUrl, status: "uploading" as const, progress: 0 }
              : x,
          ),
        );
      } else {
        setPendingFiles((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? { ...x, status: "uploading" as const, progress: 0 }
              : x,
          ),
        );
      }
    }

    try {
      const res = await uploadToCloudinary(fileToUpload, me.uid, (p) => {
        setPendingFiles((prev) =>
          prev.map((x) => (x.id === d.id ? { ...x, progress: p } : x)),
        );
      });
      const attach: ChatAttachment = {
        kind: d.kind,
        resourceType: res.resourceType,
        url: res.url,
        publicId: res.publicId,
        name: d.file.name,
        size: res.bytes || fileToUpload.size,
        mimeType: fileToUpload.type,
      };
      if (res.width !== undefined) attach.width = res.width;
      if (res.height !== undefined) attach.height = res.height;
      if (res.duration !== undefined) attach.duration = res.duration;
      if (res.pages !== undefined) attach.pages = res.pages;
      setPendingFiles((prev) =>
        prev.map((x) =>
          x.id === d.id ? { ...x, status: "done" as const, progress: 100, attach } : x,
        ),
      );
      return attach;
    } catch (err) {
      setPendingFiles((prev) =>
        prev.map((x) =>
          x.id === d.id
            ? {
                ...x,
                status: "error" as const,
                error: err instanceof Error ? err.message : "No se pudo subir.",
              }
            : x,
        ),
      );
      return null;
    }
  }

  function bumpTyping(hasText: boolean) {
    if (!hasText || editing) return;
    const t = Date.now();
    if (t - lastTypingSent.current < 2000) return;
    lastTypingSent.current = t;
    setTyping(conv.id, me.uid);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) =>
          Math.min(i + 1, mentionFiltered.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const contact = mentionFiltered[mentionIndex];
        if (contact) {
          e.preventDefault();
          insertMention(contact.displayName);
          return;
        }
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isCoarsePointer()) {
        insertNewline();
        return;
      }
      handleSubmit();
    }
  }

  function insertNewline() {
    inputRef.current?.insertText("\n");
  }

  function insertMention(name: string) {
    const input = inputRef.current;
    if (!input) return;
    const before = input.value.slice(0, input.selectionStart);
    const at = before.lastIndexOf("@");
    if (at >= 0 && !before.slice(at).includes("\n")) input.setSelectionRange(at, input.selectionEnd);
    input.insertText("@" + name + " ");
    setMentionOpen(false);
  }

  function updateMentionAutocomplete(el: MessageEditorHandle) {
    if (!isGroup) {
      setMentionOpen(false);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, start);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1 || before.slice(atIndex).includes("\n")) {
      setMentionOpen(false);
      return;
    }
    const query = before.slice(atIndex + 1);
    if (query.length > 0 && query.includes(" ")) {
      setMentionOpen(false);
      return;
    }
    setMentionQuery(query);
    setMentionIndex(0);
    setMentionOpen(true);
  }

  async function handleSubmit() {
    inputRef.current?.focus({ preventScroll: true });
    const { text: value, formatting: sendFormatting } = trimFormattedText(text, formatting);
    const onlineNow = isOnline();
    setSendError(null);
    clearTyping(conv.id, me.uid);

    if (editing) {
      if (!value) return;
      if (!onlineNow) {
        setSendError("Sin conexión: no se puede editar ahora.");
        return;
      }
      try {
        await editMessage(conv.id, editing.id, value, sendFormatting);
        setEditing(null);
        setText(""); setFormatting([]);

      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : "No se pudo editar el mensaje.",
        );
      }
      return;
    }

    const hasPending = pendingFiles.length > 0;
    if (!value && !hasPending) return;

    if (hasPending && !onlineNow) {
      setSendError("Sin conexión: no se pueden subir archivos.");
      return;
    }

    if (hasPending) {
      if (uploading) return;
      setUploading(true);
      const doneAtts = pendingFiles
        .filter((d) => d.status === "done" && d.attach)
        .map((d) => d.attach as ChatAttachment);
      const toUpload = pendingFiles.filter(
        (d) => d.status !== "done" && d.file.size <= MAX_ATTACHMENT_BYTES,
      );
      let failed = 0;
      const newly: ChatAttachment[] = [];
      for (const d of toUpload) {
        const att = await uploadDraft(d);
        if (att) newly.push(att);
        else failed++;
      }
      setUploading(false);

      if (failed > 0) {
        setSendError(
          "Algunos archivos no se subieron. Reintenta o elimínalos.",
        );
        return;
      }

      const allAtts = [...doneAtts, ...newly];
      if (allAtts.length === 0) return;
      const mentionedIds = isGroup ? extractMentions(value, members) : [];
      const reply = replyMsg
        ? {
            id: replyMsg.id,
            text: replyMsg.text,
            senderId: replyMsg.senderId,
          }
        : null;
      try {
        if (allAtts.length === 1) {
          await sendMessage(
            conv.id,
            me.uid,
            value,
            reply,
            allAtts,
            mentionedIds,
            null,
            sendFormatting,
          );
        } else {
          if (value) {
            await sendMessage(conv.id, me.uid, value, reply, undefined, mentionedIds, null, sendFormatting);
          }
          for (let i = 0; i < allAtts.length; i++) {
            await sendMessage(
              conv.id,
              me.uid,
              "",
              i === 0 && !value ? reply : null,
              [allAtts[i]],
              [],
            );
          }
        }
        clearDraftUrls();
        setPendingFiles([]);
        setReplyMsg(null);
        setText(""); setFormatting([]);
        stickRef.current = true;
        setShowJump(false);

      } catch (err) {
        setSendError(err instanceof Error ? err.message : "No se pudo enviar.");
      }
      return;
    }

    const mentionedIds = isGroup ? extractMentions(value, members) : [];
    if (!onlineNow) {
      const pm: PendingMessage = {
        localId: newLocalId(),
        convId: conv.id,
        senderId: me.uid,
        text: value,
        formatting: sendFormatting,
        createdAt: Date.now(),
        replyTo: replyMsg
          ? {
              id: replyMsg.id,
              text: replyMsg.text,
              senderId: replyMsg.senderId,
            }
          : null,
        mentions: mentionedIds,
      };
      await enqueuePending(pm);
      setPending((prev) => [...prev, pm]);
      setReplyMsg(null);
      setText(""); setFormatting([]);
      stickRef.current = true;
      setShowJump(false);

      return;
    }
    setText(""); setFormatting([]);
    stickRef.current = true;
    setShowJump(false);
    try {
      await sendMessage(
        conv.id,
        me.uid,
        value,
        replyMsg
          ? {
              id: replyMsg.id,
              text: replyMsg.text,
              senderId: replyMsg.senderId,
            }
          : null,
        undefined,
        mentionedIds,
        null,
        sendFormatting,
      );
      setReplyMsg(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "No se pudo enviar.");
    }
  }

  function handleEdit(m: ChatMessage) {
    setMenuMsg(null);
    if (desktop) {
      setInlineEditing({ id: m.id, scope: menuScope === "thread" && threadRootId ? "thread" : "main" });
      return;
    }
    setReplyMsg(null);
    setEditing(m);
    setText(m.text);
    setFormatting(m.formatting ?? []);
  }

  function focusComposer(scope: "main" | "thread") {
    requestAnimationFrame(() => {
      const input = scope === "thread"
        ? document.querySelector<HTMLElement>('#chat-thread-panel [role="textbox"][aria-label="Respuesta en el hilo"]')
        : inputRef.current;
      input?.focus({ preventScroll: true });
    });
  }

  function cancelInlineEdit(scope: "main" | "thread") {
    setInlineEditing(null);
    focusComposer(scope);
  }

  async function saveInlineEdit(message: ChatMessage, value: string, scope: "main" | "thread", marks: TextFormat[]) {
    if (!isOnline()) throw new Error("Conéctate a internet para editar el mensaje.");
    if (message.pending) throw new Error("Espera a que el mensaje se sincronice para editarlo.");
    if (!visibleMessagesRef.current.some((current) => current.id === message.id)) throw new Error("El mensaje ya no está disponible.");
    await editMessage(conv.id, message.id, value, marks);
    const active = document.activeElement;
    const restoreFocus = active === document.body || active?.closest("[data-inline-editor]")?.getAttribute("data-inline-editor") === message.id;
    setInlineEditing((current) => current?.id === message.id && current.scope === scope ? null : current);
    if (restoreFocus) focusComposer(scope);
  }

  function handleReply(m: ChatMessage) {
    setMenuMsg(null);
    if (desktop) {
      openThread(m);
      return;
    }
    setEditing(null);
    setReplyMsg(m);
  }

  function openThread(message: ChatMessage) {
    if (threadBusy) return;
    if (message.pending) {
      setSendError("Espera a que el mensaje se sincronice para abrir su hilo.");
      return;
    }
    const root = threads.rootById.get(message.id) ?? message.id;
    if (root !== threadRootId && inlineEditing?.scope === "thread") setInlineEditing(null);
    setThreadRootId(root);
    setThreadFocus((value) => value + 1);
  }

  async function sendThreadReply(rootId: string, value: string, attachments: ChatAttachment[], marks: TextFormat[]) {
    const root = visibleMessagesRef.current.find((message) => message.id === rootId);
    if (!root || root.pending) throw new Error("El mensaje original ya no está disponible.");
    const reply = { id: root.id, text: root.text, senderId: root.senderId };
    const mentions = isGroup ? extractMentions(value, members) : [];
    if (!isOnline()) {
      if (attachments.length) throw new Error("Conéctate a internet para enviar archivos.");
      const queued: PendingMessage = { localId: newLocalId(), convId: conv.id, senderId: me.uid,
        text: value, formatting: marks, createdAt: Date.now(), replyTo: reply, mentions };
      await enqueuePending(queued);
      setPending((previous) => [...previous, queued]);
      return;
    }
    await sendMessage(conv.id, me.uid, value, reply, attachments.length ? attachments : undefined, mentions, null, marks);
  }

  async function handleReact(m: ChatMessage, emoji: string) {
    setMenuMsg(null);
    try {
      await toggleReaction(conv.id, m.id, me.uid, emoji);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo reaccionar.",
      );
    }
  }

  const [deletedForMeIds, setDeletedForMeIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`deleted_for_me_${me.uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  function handleDeleteForMe(m: ChatMessage) {
    setMenuMsg(null);
    const updated = [...deletedForMeIds, m.id];
    setDeletedForMeIds(updated);
    try {
      localStorage.setItem(`deleted_for_me_${me.uid}`, JSON.stringify(updated));
    } catch {}
  }

  async function handleDelete(m: ChatMessage) {
    setMenuMsg(null);
    try {
      if (conv.pinnedMessages?.some((p) => p.id === m.id)) {
        await unpinMessage(conv.id, m.id).catch(() => {});
      }
      await deleteMessage(conv.id, m.id);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo eliminar el mensaje.",
      );
    }
  }

  async function handlePin(m: ChatMessage) {
    setMenuMsg(null);
    try {
      await pinMessage(conv.id, {
        id: m.id,
        text: m.text,
        senderId: m.senderId,
      });
      setPinnedIndex(0);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo fijar el mensaje.",
      );
    }
  }

  const pendingForConv = useMemo(() => pending
    .filter((p) => p.convId === conv.id)
    .map((p): ChatMessage => ({
      id: p.localId,
      senderId: p.senderId,
      text: p.text,
      createdAt: p.createdAt,
      replyTo: p.replyTo ?? null,
      mentions: p.mentions,
      forwardedFrom: p.forwardedFrom ?? null,
      pending: true,
      formatting: p.formatting,
    })), [pending, conv.id]);

  const displayMessages = useMemo(() => mergePendingMessages(messages, pendingForConv).filter(
    (m) => !deletedForMeIds.includes(m.id),
  ), [messages, pendingForConv, deletedForMeIds]);
  visibleMessagesRef.current = displayMessages;
  const threads = useMemo(() => buildMessageThreads(displayMessages), [displayMessages]);
  const timeline = desktop ? threads.timeline : displayMessages;
  const threadRoot = desktop ? displayMessages.find((message) => message.id === threadRootId) ?? null : null;
  const threadKey = `${me.uid}:${conv.id}:${threadRoot?.id ?? ""}`;

  useEffect(() => {
    if (threadRootId && !displayMessages.some((message) => message.id === threadRootId)) {
      setThreadRootId(null);
      if (inlineEditing?.scope === "thread") setInlineEditing(null);
    }
  }, [displayMessages, threadRootId]);

  const items: preact.ComponentChildren[] = [];
  timeline.forEach((msg, i) => {
    const previous = timeline[i - 1];
    if (!previous || !sameDay(previous.createdAt, msg.createdAt)) {
      items.push(
        <div key={"day-" + msg.id} class="flex shrink-0 items-center justify-center gap-4 py-2.5 lg:sticky lg:top-0 lg:z-10 lg:bg-white lg:px-6 lg:dark:bg-slate-900">
          <span aria-hidden="true" class="hidden h-px flex-1 bg-slate-200 dark:bg-slate-800 lg:block" />
          <span class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-400 lg:px-4 lg:text-sm">
            {formatDayLabel(msg.createdAt)}
          </span>
          <span aria-hidden="true" class="hidden h-px flex-1 bg-slate-200 dark:bg-slate-800 lg:block" />
        </div>,
      );
    }
    items.push(
      <MessageBubble
        key={msg.id}
        msg={msg}
        mine={msg.senderId === me.uid}
        uid={me.uid}
        onOpenMenu={(message, anchor) => { setMenuScope("main"); setMenuAnchor(anchor ?? null); setMenuMsg(message); }}
        onReact={handleReact}
        onOpenAttachment={openLightbox}
        onJumpToReply={scrollToMessage}
        isPinned={conv.pinnedMessages?.some((p) => p.id === msg.id) ?? false}
        highlighted={highlightedId === msg.id}
        showAuthor={isGroup && msg.senderId !== me.uid}
        authorName={members[msg.senderId]?.displayName || (msg.senderId === me.uid ? me.displayName : peer.name)}
        authorPhotoURL={members[msg.senderId]?.photoURL || (msg.senderId === me.uid ? me.photoURL : peer.photoURL)}
        desktop={desktop}
        grouped={!!previous && previous.senderId === msg.senderId && sameDay(previous.createdAt, msg.createdAt) && msg.createdAt - previous.createdAt >= 0 && msg.createdAt - previous.createdAt < 5 * 60_000 && !msg.replyTo && !msg.forwardedFrom}
        onReply={handleReply}
        editing={desktop && inlineEditing?.scope === "main" && inlineEditing.id === msg.id}
        onSaveEdit={(message, value, marks) => saveInlineEdit(message, value, "main", marks)}
        onCancelEdit={() => cancelInlineEdit("main")}
        threadReplies={desktop ? threads.repliesByRoot.get(msg.id) : undefined}
        onOpenThread={() => openThread(msg)}
        threadSelected={threadRoot?.id === msg.id}
        members={members}
      />,
    );
  });

  if (peerTyping && !isGroup) {
    items.push(
      <div key="typing" class="flex items-start">
        <div class="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <span class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" style={{ animationDelay: "0.15s" }} />
          <span class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>,
    );
  }

  return (
    <div ref={layoutRef} data-thread-docked={threadDocked ? "true" : "false"} class="chat-conversation-layout relative flex min-h-0 min-w-0 flex-1">
    <div
      class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      inert={threadRoot && !threadDocked ? true : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header class="chat-conversation-header flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900 lg:min-h-[88px] lg:px-6 lg:py-4">
        <button
          type="button"
          aria-label="Volver a la lista"
          onClick={onBack}
          class="grid h-9 w-9 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        {isGroup ? (
          <span class="chat-header-avatar flex-none">
            <GroupAvatar name={conv.name || "Grupo"} size="sm" />
          </span>
        ) : (
          <span class="chat-header-avatar relative flex-none">
            <Avatar uid={peer.uid} name={peer.name} photoURL={peer.photoURL} size="sm" />
            {isOnlineNow(peerPresence) && !peer.isSelf ? (
              <span
                class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"
                aria-label="En línea"
              />
            ) : null}
          </span>
        )}
        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left"
          onClick={() => (isGroup ? setShowGroupInfo(true) : undefined)}
        >
          <span class="block truncate text-sm font-bold text-slate-800 dark:text-slate-100 lg:text-[15px]">
            {peer.name}
          </span>
          {isGroup ? (
            <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
              {groupTypingText
                ? groupTypingText
                : `${Object.keys(members).length} miembros`}
            </span>
          ) : peer.isSelf ? (
            <span class="block text-xs text-slate-500 dark:text-slate-400">
              Escribirte a ti mismo
            </span>
          ) : peerTyping ? (
            <span class="block text-xs font-medium text-indigo-600 dark:text-indigo-400">
              escribiendo…
            </span>
          ) : isOnlineNow(peerPresence) ? (
            <span class="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
              En línea
            </span>
          ) : peerPresence ? (
            <span class="block text-xs text-slate-500 dark:text-slate-400">
              {formatLastSeen(peerPresence.lastSeen)}
            </span>
          ) : (
            <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
              {peer.phone || peer.uid}
            </span>
          )}
        </button>
        {isGroup ? (
          <button
            type="button"
            aria-label="Información del grupo"
            onClick={() => setShowGroupInfo(true)}
            class="grid h-9 w-9 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        ) : null}
      </header>

      {dragActive ? (
        <div class="pointer-events-none absolute inset-x-0 top-14 bottom-0 z-10 flex items-center justify-center overflow-hidden">
          <div class="pointer-events-none absolute inset-0 bg-indigo-500/10 backdrop-blur-[2px]" />
          <div class="drop-zone-bounce relative flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-indigo-400 bg-white/90 px-10 py-8 shadow-2xl dark:bg-slate-900/90">
            <span class="grid h-14 w-14 place-items-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-7 w-7">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </span>
            <p class="text-center text-sm font-bold text-slate-800 dark:text-slate-100">
              Suelta para enviar
            </p>
            <p class="text-center text-xs text-slate-500 dark:text-slate-400">
              Se agregarán como adjuntos
            </p>
          </div>
        </div>
      ) : null}

      {pinnedList.length > 0 ? (
        <div class="flex items-center gap-1.5 border-b border-slate-200 bg-indigo-50/70 px-3 py-2 dark:border-slate-800 dark:bg-indigo-500/10">
          <span class="grid h-7 w-7 flex-none place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M12 17v5" />
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
            </svg>
          </span>
          {pinnedList.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Fijado anterior"
                onClick={() =>
                  setPinnedIndex((i) => (i - 1 + pinnedList.length) % pinnedList.length)
                }
                class="grid h-6 w-6 flex-none place-items-center rounded-lg text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Fijado siguiente"
                onClick={() => setPinnedIndex((i) => (i + 1) % pinnedList.length)}
                class="grid h-6 w-6 flex-none place-items-center rounded-lg text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          ) : null}
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            onClick={() => scrollToMessage(pinnedList[pinnedIndex].id)}
          >
            <span class="block text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
              Mensaje fijado{" · "}
              {pinnedList[pinnedIndex].senderId === me.uid
                ? "Tú"
                : isGroup
                  ? members[pinnedList[pinnedIndex].senderId]?.displayName || "Miembro"
                  : peer.isSelf
                    ? "Tú"
                    : peer.name}
            </span>
            <span class="block truncate text-xs text-indigo-900/80 dark:text-indigo-200/80">
              {pinnedList[pinnedIndex].text || "Adjunto"}
            </span>
          </button>
          <span class="flex-none text-[11px] font-semibold tabular-nums text-indigo-400 dark:text-indigo-300">
            {pinnedIndex + 1}/{pinnedList.length}
          </span>
          <button
            type="button"
            aria-label="Desfijar mensaje"
            onClick={() => {
              unpinMessage(conv.id, pinnedList[pinnedIndex].id).catch(() => {});
            }}
            class="grid h-7 w-7 flex-none place-items-center rounded-lg text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ) : null}

      <div class="relative min-h-0 flex-1">
        <div
          class="chat-scroll chat-bg h-full overflow-x-hidden overflow-y-auto px-3 py-4 lg:px-0 lg:py-0"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {displayMessages.length === 0 ? (
            <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Esta es tu conversación con {peer.name}.
              </p>
              <p class="text-xs text-slate-400 dark:text-slate-500">
                Escribe el primer mensaje.
              </p>
            </div>
          ) : (
            <div ref={contentRef} class="flex flex-col gap-2 lg:min-h-full lg:justify-end lg:gap-0">{items}</div>
          )}
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={jumpToBottom}
            class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
            Último mensaje
          </button>
        ) : null}
      </div>

      {replyMsg ? (
        <div class="flex items-center justify-between gap-2 border-t border-slate-200 bg-indigo-50 px-4 py-2 dark:border-slate-700 dark:bg-indigo-500/15">
          <span class="flex min-w-0 items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4 flex-none">
              <path d="m3 11 9-9v5c6 1 9 5 9 11-2-4-5-5-9-5v5Z" />
            </svg>
            <span class="min-w-0">
              <span class="block truncate text-indigo-700/80 dark:text-indigo-300/80">
                Respondiendo a {peer.name}
              </span>
              <span class="block truncate font-normal">{replyMsg.text}</span>
            </span>
          </span>
          <button
            type="button"
            aria-label="Cancelar respuesta"
            onClick={() => setReplyMsg(null)}
            class="grid h-6 w-6 flex-none place-items-center rounded-lg text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20"
          >
            ✕
          </button>
        </div>
      ) : null}

      {editing ? (
        <div class="flex items-center justify-between gap-2 border-t border-slate-200 bg-amber-50 px-4 py-2 dark:border-slate-700 dark:bg-amber-500/15">
          <span class="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Editando mensaje
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setText(""); setFormatting([]);

            }}
            class="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      {pendingFiles.length > 0 && !editing ? (
        <div class="border-t border-slate-200 bg-slate-50 px-3 pt-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <p class="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Adjuntos ({pendingFiles.length})
            </p>
            {uploading ? (
              <p class="mb-2 text-xs text-slate-400 dark:text-slate-500">
                Subiendo…
              </p>
            ) : null}
          </div>
          <div class="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
            {pendingFiles.map((d) => (
              <div
                key={d.id}
                class="relative h-16 w-16 flex-none overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              >
                {d.previewUrl ? (
                  <img
                    src={d.previewUrl}
                    alt={d.file.name}
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    class={
                      "grid h-full w-full place-items-center text-[11px] font-bold uppercase " +
                      (d.kind === "pdf"
                        ? "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400"
                        : "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400")
                    }
                  >
                    {d.kind === "pdf" ? "PDF" : d.file.name.split(".").pop()}
                  </span>
                )}

                {d.status === "optimizing" ? (
                  <div class="absolute inset-0 grid place-items-center bg-black/45">
                    <span class="flex items-center gap-1.5 text-[11px] font-bold text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5 animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Optimizando…
                    </span>
                  </div>
                ) : null}

                {d.status === "uploading" ? (
                  <div class="absolute inset-0 grid place-items-center bg-black/45">
                    <span class="text-xs font-bold text-white">
                      {d.progress}%
                    </span>
                    <div class="absolute inset-x-0 bottom-0 h-1 bg-black/30">
                      <div
                        class="h-full bg-emerald-400 transition-all"
                        style={{ width: `${d.progress}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {d.status === "done" ? (
                  <span class="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" class="h-3 w-3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                ) : null}

                {d.status === "error" ? (
                  <div class="absolute inset-0 grid place-items-center bg-red-500/30">
                    <button
                      type="button"
                      aria-label="Reintentar"
                      title={d.error || "Error al subir"}
                      onClick={() => {
                        setSendError(null);
                        uploadDraft(d);
                      }}
                      class="grid h-8 w-8 place-items-center rounded-full bg-white text-red-600 shadow-md"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  aria-label="Quitar adjunto"
                  onClick={() => removeDraft(d.id)}
                  class="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {mentionOpen && mentionFiltered.length > 0 ? (
        <div class="relative z-20 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900">
          <ul class="max-h-56 overflow-y-auto">
            {mentionFiltered.map((contact, i) => (
              <li key={contact.uid}>
                <button
                  type="button"
                  class={
                    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left " +
                    (i === mentionIndex
                      ? "bg-indigo-50 dark:bg-indigo-500/15"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60")
                  }
                  onMouseEnter={() => setMentionIndex(i)}
                  onClick={() => insertMention(contact.displayName)}
                >
                  <Avatar uid={contact.uid} name={contact.displayName} photoURL={members[contact.uid]?.photoURL} size="sm" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {contact.displayName}
                    </span>
                    <span class="block text-xs text-indigo-500">
                      @{contact.displayName}
                    </span>
                  </span>
                  {i === mentionIndex ? (
                    <span class="text-[11px] font-bold text-indigo-500">Enter ↵</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form class="chat-composer shrink-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:mx-6 lg:mb-4 lg:mt-3 lg:rounded-xl lg:border lg:shadow-sm lg:focus-within:border-indigo-400 lg:focus-within:ring-2 lg:focus-within:ring-indigo-500/15" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,.pdf,.doc,.docx"
          multiple
          class="hidden"
          onChange={handleFilesChange}
        />
        <MessageTextEditor editorRef={inputRef} value={text} formatting={formatting}
          label={editing ? "Editar mensaje" : "Mensaje"}
          placeholder={editing ? "Editar mensaje…" : desktop ? `Mensaje a ${peer.name}…` : "Escribe un mensaje…"}
          className="text-slate-800 dark:text-slate-100"
          readOnly={uploading}
          onChange={(value, marks, input) => {
            setText(value); setFormatting(marks);
            bumpTyping(value.trim().length > 0);
            updateMentionAutocomplete(input);
          }}
          onKeyDown={handleKeyDown} onPaste={handlePaste}
          footerStart={<>
        <button
          type="button"
          aria-label="Adjuntar archivo"
          disabled={uploading || !!editing}
          onClick={() => fileInputRef.current?.click()}
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="m9 15 3 3 3-3" />
          </svg>
        </button>
          </>} footerEnd={<>
            <span class="hidden min-w-0 flex-1 px-2 text-xs text-slate-400 dark:text-slate-500 lg:block">Enter para enviar · Shift + Enter para una nueva línea</span>
          <button
            type="submit"
            onPointerDown={(event) => event.preventDefault()}
            disabled={uploading || (!text.trim() && pendingFiles.length === 0)}
            aria-label={editing ? "Guardar edición" : "Enviar mensaje"}
            class="ml-auto grid h-10 w-10 flex-none place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40 lg:h-11 lg:w-11 lg:rounded-lg"
          >
            {editing ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4.5 w-4.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4.5 w-4.5 -translate-x-[1px]">
                <path d="m22 2-11 11" />
                <path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            )}
          </button>
          </>} />
      </form>

      {sendError ? (
        <p class="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {sendError}
        </p>
      ) : null}
    </div>
    {threadRoot ? <ThreadPanel key={`${conv.id}:${threadRoot.id}`} root={threadRoot}
      replies={threads.repliesByRoot.get(threadRoot.id) ?? []} me={me} members={members}
      pinnedIds={pinnedList.map((message) => message.id)} focusToken={threadFocus} highlightedId={highlightedId}
      editingId={inlineEditing?.scope === "thread" ? inlineEditing.id : null}
      onSaveEdit={(message, value, marks) => saveInlineEdit(message, value, "thread", marks)} onCancelEdit={() => cancelInlineEdit("thread")}
      draft={threadDrafts[threadKey] ?? { text: "", files: [] }}
      onDraftChange={(draft) => setThreadDrafts((previous) => ({ ...previous, [threadKey]: draft }))}
      onBusyChange={setThreadBusy}
      onClose={() => { if (threadBusy) return; setThreadRootId(null); if (inlineEditing?.scope === "thread") setInlineEditing(null); focusComposer("main"); }}
      onSend={(value, attachments, marks) => sendThreadReply(threadRoot.id, value, attachments, marks)}
      onOpenMenu={(message, anchor) => { setMenuScope("thread"); setMenuAnchor(anchor ?? null); setMenuMsg(message); }}
      onReact={handleReact} onOpenAttachment={openLightbox} /> : null}

      <MessageActionsSheet
        msg={menuMsg}
        desktop={desktop}
        anchor={menuAnchor}
        mine={menuMsg !== null && menuMsg.senderId === me.uid}
        uid={me.uid}
        isPinned={(menuMsg !== null && conv.pinnedMessages?.some((p) => p.id === menuMsg.id)) || false}
        onClose={() => setMenuMsg(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeleteForMe={handleDeleteForMe}
        onReply={handleReply}
        onReact={handleReact}
        onPin={handlePin}
        onForward={handleForward}
        onSave={handleSave}
      />

      {forwardMsg ? (
        <ForwardSheet
          me={me}
          msg={forwardMsg}
          forwardedFrom={{
            uid: forwardMsg.senderId,
            name:
              forwardMsg.senderId === me.uid
                ? me.displayName
                : isGroup
                  ? members[forwardMsg.senderId]?.displayName || "Contacto"
                  : peer.name,
          }}
          conversations={conversations}
          currentConvId={conv.id}
          onClose={() => setForwardMsg(null)}
          onSent={() => {
            setSendError(null);
          }}
        />
      ) : null}

      {lightbox ? (
        <AttachmentLightbox
          mediaList={lightbox.list}
          index={lightbox.index}
          onNav={(index) =>
            setLightbox((prev) =>
              prev ? { ...prev, index } : prev,
            )
          }
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {showGroupInfo ? (
        <GroupInfoSheet
          conv={conv}
          meUid={me.uid}
          onClose={() => setShowGroupInfo(false)}
          onLeft={onBack}
        />
      ) : null}
    </div>
  );
}
