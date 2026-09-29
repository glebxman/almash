import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { dateLocale, useLabels } from "@/lib/labels";
import { Loader2, MessageCircle } from "lucide-react";
import i18n, { LANGUAGES } from "@/lib/i18n";

// Placeholder body stored for media-only messages (either UI language).
function isAttachmentOnly(body: string) {
  return LANGUAGES.some((lng) => i18n.t("pages.messages.attachment", { lng }) === body.trim());
}

type ChatRow = {
  id: string;
  publicId: string;
  status: string;
  updatedAt: string;
  parties: { side: string; user: { id: string; name: string; avatarUrl?: string | null } }[];
  _count: { messages: number };
  lastMessage: {
    body: string;
    createdAt: string;
    system: boolean;
    senderId: string;
    mediaUrl?: string | null;
  } | null;
};

/** TZ §13 / §43: every offer has its own chat — this is the list of them. */
export default function MessagesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const labels = useLabels();
  const [chats, setChats] = useState<ChatRow[] | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    api<{ trades: ChatRow[] }>("/api/trades")
      .then((d) => {
        const rows = d.trades.filter((t) => t.lastMessage);
        rows.sort(
          (a, b) =>
            new Date(b.lastMessage!.createdAt).getTime() -
            new Date(a.lastMessage!.createdAt).getTime(),
        );
        setChats(rows);
      })
      .catch(() => setChats([]));
  }, [user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-rise">
      <h1 className="px-1 font-display text-3xl text-ink">{t("pages.messages.title")}</h1>
      {chats === null ? (
        <div className="grid place-items-center py-16">
          <Loader2 size={28} className="animate-spin text-forest" />
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-12 text-center shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-forest/10 text-forest">
            <MessageCircle size={28} />
          </span>
          <p className="text-sm font-semibold text-ink/55">{t("pages.messages.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {chats.map((c, i) => {
            const other = c.parties.find((p) => p.user.id !== user.id)?.user;
            const last = c.lastMessage!;
            const preview = last.mediaUrl && isAttachmentOnly(last.body) ? t("pages.messages.attachment") : last.body;
            const mine = !last.system && last.senderId === user.id;
            return (
              <Link
                key={c.id}
                to={`/trades/${c.id}`}
                className="flex items-center gap-3 px-3 transition active:bg-ink/[0.04] hover:bg-ink/[0.02]"
              >
                <img
                  src={mediaUrl(other?.avatarUrl) || "https://placehold.co/56x56"}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <div
                  className={`min-w-0 flex-1 py-2.5 pr-1 ${
                    i < chats.length - 1 ? "border-b border-ink/[0.06]" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-bold text-ink">{other?.name || "—"}</p>
                    <span className="shrink-0 text-xs text-ink/40">{listTime(last.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm text-ink/55">
                    {mine && <span className="font-semibold text-forest">{t("pages.messages.you")}: </span>}
                    {last.system ? <span className="italic">{preview}</span> : preview}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-semibold text-ink/35">
                    <span className="truncate">{c.publicId}</span>
                    <span>·</span>
                    <span className="shrink-0 rounded-full bg-forest/10 px-1.5 py-px text-forest">
                      {labels.tradeStatus(c.status)}
                    </span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Telegram list style: time today, weekday this week, date otherwise. */
function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) {
    return d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getTime() >= startOfToday - 6 * 86_400_000) {
    return d.toLocaleDateString(dateLocale(), { weekday: "short" });
  }
  return d.toLocaleDateString(dateLocale(), { day: "2-digit", month: "2-digit", year: "2-digit" });
}
