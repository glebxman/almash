import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { dateLocale } from "@/lib/labels";
import { isVideoUrl, uploadMedia, VIDEO_ACCEPT } from "@/lib/media";

export type ChatMsg = {
  id: string;
  body: string;
  mediaUrl?: string | null;
  system: boolean;
  flagged: boolean;
  createdAt: string;
  sender: { id: string; name: string; avatarUrl?: string | null };
};

type Peer = { id: string; name: string; avatarUrl?: string | null };

const GROUP_GAP_MS = 5 * 60 * 1000;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (diff === 0 || diff === 1) {
    const s = new Intl.RelativeTimeFormat(dateLocale(), { numeric: "auto" }).format(-diff, "day");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return d.toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
}

/**
 * Telegram-style deal chat. Owns only the composer state; the message list
 * comes from the trade page (which polls it) and `onSent` reloads it.
 */
export function TradeChat({
  tradeId,
  publicId,
  meId,
  peer,
  messages,
  closed,
  onSent,
  onError,
}: {
  tradeId: string;
  publicId: string;
  meId: string;
  peer?: Peer;
  messages: ChatMsg[];
  closed: boolean;
  onSent: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [pendingMediaUrl, setPendingMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const lastCount = useRef(0);

  // Placeholder body the API needs for media-only messages; not shown in bubbles.
  const attachmentLabels = new Set(
    ["ru", "uz"].map((lng) => i18n.t("pages.messages.attachment", { lng })),
  );

  // Keep the view pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    const mineLast = messages[messages.length - 1]?.sender.id === meId;
    if (lastCount.current === 0 || (grew && (stickToBottom.current || mineLast))) {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = messages.length;
  }, [messages, meId]);

  // Auto-grow the composer up to ~5 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const canSend = !sending && !uploading && Boolean(text.trim() || pendingMediaUrl);

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      await api(`/api/trades/${tradeId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: text.trim() || t("pages.messages.attachment"),
          mediaUrl: pendingMediaUrl || undefined,
        }),
      });
      setText("");
      setPendingMediaUrl(null);
      stickToBottom.current = true;
      await onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends, Shift+Enter breaks the line. Phones keep Enter as newline.
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex h-[min(72dvh,620px)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/10 sm:rounded-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-ink/[0.06] px-4 py-2.5">
        <img
          src={mediaUrl(peer?.avatarUrl) || "https://placehold.co/40x40"}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-ink">{peer?.name || "—"}</p>
          <p className="truncate text-xs text-ink/45">
            {t("trade.chat")} · {publicId}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="chat-wallpaper flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-4"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center">
            <p className="rounded-2xl bg-white/80 px-4 py-2 text-center text-sm font-semibold text-ink/55 shadow-sm">
              {t("trade.chatEmpty")}
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const sameAsPrev =
            !newDay &&
            prev &&
            !prev.system &&
            !m.system &&
            prev.sender.id === m.sender.id &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS;
          const lastInGroup =
            !next ||
            next.system ||
            next.sender.id !== m.sender.id ||
            dayKey(next.createdAt) !== dayKey(m.createdAt) ||
            new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() >= GROUP_GAP_MS;

          const dateChip = newDay && (
            <div className="sticky top-0 z-10 flex justify-center py-2">
              <span className="rounded-full bg-ink/25 px-3 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                {dayLabel(m.createdAt)}
              </span>
            </div>
          );

          if (m.system) {
            return (
              <div key={m.id}>
                {dateChip}
                <div className="my-2 flex justify-center px-6">
                  <span className="rounded-2xl bg-ink/25 px-3 py-1 text-center text-xs font-semibold text-white backdrop-blur-sm">
                    {m.body}
                  </span>
                </div>
              </div>
            );
          }

          const mine = m.sender.id === meId;
          const showBody = !(m.mediaUrl && attachmentLabels.has(m.body.trim()));
          const mediaOnly = Boolean(m.mediaUrl) && !showBody;
          const video = m.mediaUrl ? isVideoUrl(m.mediaUrl) : false;

          const meta = (
            <span
              className={`pointer-events-none absolute select-none whitespace-nowrap text-[11px] ${
                mediaOnly
                  ? "bottom-1.5 right-2 rounded-full bg-black/45 px-1.5 py-0.5 text-white"
                  : `bottom-1 right-2.5 ${mine ? "text-white/70" : "text-ink/40"}`
              }`}
            >
              {timeLabel(m.createdAt)}
            </span>
          );

          return (
            <div key={m.id}>
              {dateChip}
              <div
                className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${
                  sameAsPrev ? "mt-0.5" : "mt-2"
                }`}
              >
                {!mine && (
                  <div className="w-8 shrink-0">
                    {lastInGroup && (
                      <img
                        src={mediaUrl(m.sender.avatarUrl ?? peer?.avatarUrl) || "https://placehold.co/32x32"}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    )}
                  </div>
                )}
                <div
                  className={`relative max-w-[80%] overflow-hidden text-[15px] leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.08)] sm:max-w-[70%] ${
                    mine ? "bg-forest text-white" : "bg-white text-ink"
                  } ${mediaOnly ? "" : "px-3 py-1.5"} rounded-2xl ${
                    lastInGroup ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""
                  }`}
                >
                  {m.mediaUrl && (
                    <div className={mediaOnly ? "" : "-mx-3 -mt-1.5 mb-1.5"}>
                      {video ? (
                        <video
                          src={mediaUrl(m.mediaUrl)}
                          controls
                          preload="metadata"
                          className="block max-h-72 w-full bg-black"
                        />
                      ) : (
                        <a href={mediaUrl(m.mediaUrl)} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={mediaUrl(m.mediaUrl)}
                            alt={t("trade.imageAlt")}
                            className="block max-h-72 w-full min-w-[160px] object-cover"
                          />
                        </a>
                      )}
                    </div>
                  )}
                  {showBody && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                  {m.flagged && (
                    <span className={`block text-[11px] font-semibold ${mine ? "text-white/80" : "text-coral"}`}>
                      {t("trade.blocked")}
                    </span>
                  )}
                  {/* reserves room on the last line for the absolutely placed time */}
                  {!mediaOnly && <span className="inline-block w-11 align-bottom" aria-hidden />}
                  {meta}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {closed ? (
        <p className="border-t border-ink/[0.06] px-4 py-3 text-center text-sm font-semibold text-ink/45">
          {t("trade.chatClosed")}
        </p>
      ) : (
        <div className="border-t border-ink/[0.06] bg-white">
          {(pendingMediaUrl || uploading) && (
            <div className="flex items-center gap-3 px-3 pt-2.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink/5">
                {uploading ? (
                  <Loader2 size={20} className="animate-spin text-forest" />
                ) : pendingMediaUrl && isVideoUrl(pendingMediaUrl) ? (
                  <video src={mediaUrl(pendingMediaUrl)} muted className="h-full w-full bg-black object-cover" />
                ) : (
                  <img src={mediaUrl(pendingMediaUrl)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink/70">
                {uploading
                  ? "…"
                  : pendingMediaUrl && isVideoUrl(pendingMediaUrl)
                    ? t("trade.videoAttached")
                    : t("trade.photoAttached")}
              </span>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => setPendingMediaUrl(null)}
                  aria-label={t("trade.remove")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-coral"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-1.5 p-2"
          >
            <label
              className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-forest ${
                uploading ? "pointer-events-none opacity-40" : ""
              }`}
              title={t("trade.attach")}
              aria-label={t("trade.attach")}
            >
              <Paperclip size={22} />
              <input
                type="file"
                accept={`image/*,${VIDEO_ACCEPT}`}
                disabled={uploading}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  try {
                    setPendingMediaUrl(await uploadMedia(file, publicId));
                  } catch (err) {
                    onError(err instanceof Error ? err.message : t("trade.fileError"));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={4000}
              placeholder={pendingMediaUrl ? t("trade.commentPhoto") : t("trade.messagePlaceholder")}
              className="max-h-[132px] min-h-11 min-w-0 flex-1 resize-none rounded-[22px] bg-ink/[0.04] px-4 py-[11px] text-[15px] leading-snug text-ink outline-none placeholder:text-ink/35 focus:bg-ink/[0.06]"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("trade.send")}
              className="btn-3d btn-3d-violet btn-3d-sm grid h-11 w-11 shrink-0 place-items-center rounded-full"
            >
              {sending ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
