import { useEffect, useRef, useState } from "preact/hooks";
import {
  deleteMessage,
  editMessage,
  markConversationRead,
  sendMessage,
  subscribeMessages,
  type ChatConversation,
  type ChatMessage,
} from "../../lib/chat";
import type { UserProfile } from "../../lib/profile";
import { Avatar } from "./Avatar";
import { peerOf } from "./ConversationList";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { MessageBubble } from "./MessageBubble";
import { formatDayLabel, sameDay } from "./time";

interface ConversationWindowProps {
  me: UserProfile;
  conv: ChatConversation;
  onBack: () => void;
}

export function ConversationWindow({ me, conv, onBack }: ConversationWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const peer = peerOf(conv, me.uid);

  useEffect(() => {
    return subscribeMessages(conv.id, setMessages);
  }, [conv.id]);

  useEffect(() => {
    markConversationRead(conv.id, me.uid);
  }, [messages, conv.id, me.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    setEditing(null);
    setMenuMsg(null);
    setText("");
    setSendError(null);
  }, [conv.id]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      autoGrow(inputRef.current);
    }
  }, [editing]);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleSubmit() {
    const value = text.trim();
    if (!value) return;
    setSendError(null);

    if (editing) {
      try {
        await editMessage(conv.id, editing.id, value);
        setEditing(null);
        setText("");
        if (inputRef.current) inputRef.current.style.height = "auto";
      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : "No se pudo editar el mensaje.",
        );
      }
      return;
    }

    setText("");
    try {
      await sendMessage(conv.id, me.uid, value);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "No se pudo enviar.");
    }
  }

  function handleEdit(m: ChatMessage) {
    setMenuMsg(null);
    setEditing(m);
    setText(m.text);
  }

  async function handleDelete(m: ChatMessage) {
    setMenuMsg(null);
    try {
      await deleteMessage(conv.id, m.id);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo eliminar el mensaje.",
      );
    }
  }

  const items: preact.ComponentChildren[] = [];
  messages.forEach((msg, i) => {
    const previous = messages[i - 1];
    if (!previous || !sameDay(previous.createdAt, msg.createdAt)) {
      items.push(
        <div key={"day-" + msg.id} class="flex justify-center py-2">
          <span class="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {formatDayLabel(msg.createdAt)}
          </span>
        </div>,
      );
    }
    items.push(
      <MessageBubble
        key={msg.id}
        msg={msg}
        mine={msg.senderId === me.uid}
        onOpenMenu={setMenuMsg}
      />,
    );
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5">
        <button
          type="button"
          aria-label="Volver a la lista"
          onClick={onBack}
          class="grid h-9 w-9 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <Avatar uid={peer.uid} name={peer.name} photoURL={peer.photoURL} size="sm" />
        <div class="min-w-0">
          <h2 class="truncate text-sm font-bold text-slate-800">{peer.name}</h2>
          {peer.isSelf ? (
            <p class="truncate text-xs text-slate-500">Escribirte a ti mismo</p>
          ) : (
            <p class="truncate text-xs text-slate-500">{peer.phone || peer.uid}</p>
          )}
        </div>
      </header>

      <div class="flex-1 overflow-y-auto bg-slate-50 px-3 py-4">
        {messages.length === 0 ? (
          <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p class="text-sm font-semibold text-slate-600">
              Esta es tu conversación con {peer.name}.
            </p>
            <p class="text-xs text-slate-400">Escribe el primer mensaje.</p>
          </div>
        ) : (
          <div class="flex flex-col gap-2">{items}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {editing ? (
        <div class="flex items-center justify-between gap-2 border-t border-slate-200 bg-amber-50 px-4 py-2">
          <span class="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Editando mensaje
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setText("");
              if (inputRef.current) inputRef.current.style.height = "auto";
            }}
            class="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      <form class="flex items-end gap-2 border-t border-slate-200 bg-white p-3" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={editing ? "Editar mensaje…" : "Escribe un mensaje…"}
          class="no-scrollbar max-h-32 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            setText(el.value);
            autoGrow(el);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={editing ? "Guardar edición" : "Enviar mensaje"}
          class="grid h-10 w-10 flex-none place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {editing ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="m22 2-11 11" />
              <path d="M22 2 15 22l-4-9-9-4Z" />
            </svg>
          )}
        </button>
      </form>

      {sendError ? (
        <p class="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
          {sendError}
        </p>
      ) : null}

      <MessageActionsSheet
        msg={menuMsg}
        mine={menuMsg !== null && menuMsg.senderId === me.uid}
        onClose={() => setMenuMsg(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}