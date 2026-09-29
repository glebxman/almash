import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Loader2, RotateCcw, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { useAuth } from "@/components/AuthProvider";
import { ToyMascot } from "@/components/ToyMascot";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

export type SwipeCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  condition: string;
  city: string;
  district: string | null;
  wantText: string | null;
  media: { url: string }[];
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
    city: string;
    rating: number;
    trustLevel: string;
  };
  matchScore: number;
  matchReasons: string[];
  suggestedOffer: { id: string; title: string; media: { url: string }[] } | null;
};

type MatchInfo = {
  theirItemId: string;
  theirItemTitle: string;
  myItemId: string;
  myItemTitle: string;
  theirUserId: string;
  theirUserName: string;
};

const SWIPE_THRESHOLD = 96;
const FLY_MS = 520;

export function SwipeDeck() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<SwipeCard[]>([]);
  const [myItemCount, setMyItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const [hint, setHint] = useState(false);
  const { t } = useTranslation();
  const labels = useLabels();
  const [notice, setNotice] = useState<string | null>(null);
  // bumps to replay the "add a toy first" banner animation on a blocked like
  const [nudge, setNudge] = useState(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, t: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ cards: SwipeCard[]; myItemCount: number }>(
        "/api/swipe/deck",
      );
      setCards(d.cards || []);
      setMyItemCount(
        typeof d.myItemCount === "number"
          ? d.myItemCount
          : (d.cards || []).some((c) => c.suggestedOffer)
            ? 1
            : 0,
      );
    } catch {
      setCards([]);
      setMyItemCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    load();
  }, [user, authLoading, navigate, load]);

  const top = cards[0] ?? null;
  const canLike = myItemCount > 0 || !!top?.suggestedOffer;

  useEffect(() => {
    if (!top || busy || drag.active || exit) {
      setHint(false);
      return;
    }
    const t = window.setTimeout(() => setHint(true), 1400);
    return () => window.clearTimeout(t);
  }, [top, busy, drag.active, exit]);

  const commit = useCallback(
    async (direction: "LIKE" | "PASS", card: SwipeCard) => {
      if (busy) return;
      if (direction === "LIKE" && myItemCount === 0 && !card.suggestedOffer) {
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
        dragRef.current = { x: 0, y: 0 };
        setNudge((n) => n + 1);
        return;
      }
      setBusy(true);
      setHint(false);
      setExit(direction === "LIKE" ? "right" : "left");
      try {
        const result = await api<{
          direction: string;
          match: MatchInfo | null;
        }>("/api/swipe", {
          method: "POST",
          body: JSON.stringify({
            itemId: card.id,
            direction,
            offeredItemId: card.suggestedOffer?.id ?? null,
          }),
        });
        window.setTimeout(() => {
          setCards((prev) => prev.filter((c) => c.id !== card.id));
          setExit(null);
          setDrag({ x: 0, y: 0, active: false });
          dragRef.current = { x: 0, y: 0 };
          setBusy(false);
          if (result.match) setMatch(result.match);
        }, FLY_MS);
      } catch (err) {
        const status = (err as { status?: number }).status;
        const message = err instanceof Error ? err.message : "";
        if (status === 404 || status === 400) {
          // The card is stale (e.g. already in another trade) — without this
          // it would snap back and block the deck forever.
          setCards((prev) => prev.filter((c) => c.id !== card.id));
          showNotice(message || t("swipe.unavailable"));
        } else {
          showNotice(message || t("common.error"));
        }
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
        dragRef.current = { x: 0, y: 0 };
        setBusy(false);
      }
    },
    [busy, myItemCount, showNotice, t],
  );

  function onPointerDown(e: React.PointerEvent) {
    if (busy || !top) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    velRef.current = { x: 0, t: performance.now() };
    setHint(false);
    setDrag({ x: 0, y: 0, active: true });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current || busy) return;
    const x = e.clientX - startRef.current.x;
    const y = (e.clientY - startRef.current.y) * 0.32;
    const now = performance.now();
    const dt = Math.max(8, now - velRef.current.t);
    velRef.current = { x: (x - dragRef.current.x) / dt, t: now };
    dragRef.current = { x, y };
    setDrag({ x, y, active: true });
  }

  function onPointerUp() {
    if (!startRef.current || !top || busy) return;
    const { x } = dragRef.current;
    const flung = Math.abs(velRef.current.x) > 0.85;
    startRef.current = null;
    if (x > SWIPE_THRESHOLD || (flung && x > 36)) {
      void commit("LIKE", top);
    } else if (x < -SWIPE_THRESHOLD || (flung && x < -36)) {
      void commit("PASS", top);
    } else {
      setDrag({ x: 0, y: 0, active: false });
      dragRef.current = { x: 0, y: 0 };
    }
  }

  async function startTrade() {
    if (!match) return;
    setBusy(true);
    try {
      const d = await api<{ trade: { id: string } }>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          targetItemIds: [match.theirItemId],
          offeredItemIds: [match.myItemId],
          message: t("matches.swipeMessage"),
        }),
      });
      setMatch(null);
      navigate(`/trades/${d.trade.id}`);
    } catch {
      setBusy(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-ink/50">
        <span className="mb-1.5 grid h-14 w-14 place-items-center rounded-[1.25rem] bg-forest text-white bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0)_60%)] shadow-[0_4px_0_#6a5ce0,0_12px_20px_-8px_rgba(23,21,31,0.28),inset_0_1.5px_0_rgba(255,255,255,0.45)]">
          <Loader2 size={24} strokeWidth={2.6} className="animate-spin" />
        </span>
        {t("pages.loading")}
      </div>
    );
  }

  const rot = drag.x * 0.048;
  const likeOpacity = Math.min(1, Math.max(0, drag.x / SWIPE_THRESHOLD));
  const passOpacity = Math.min(1, Math.max(0, -drag.x / SWIPE_THRESHOLD));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <header className="flex items-end justify-between gap-3 animate-rise">
        <div>
          <p className="font-display text-[2rem] leading-none text-ink sm:text-4xl">
            {t("swipe.question")}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink/50">
            {t("swipe.howto")}
          </p>
        </div>
        <ToyMascot className="w-16 shrink-0 sm:w-20" mood={exit === "right" ? "yay" : "idle"} />
      </header>

      <div className="flex gap-2 pb-1">
        <span className="btn-3d btn-3d-coral btn-3d-sm pointer-events-none rounded-full px-3 py-1 text-xs font-extrabold">
          {t("swipe.skipHint")}
        </span>
        <span className="btn-3d btn-3d-lime btn-3d-sm pointer-events-none rounded-full px-3 py-1 text-xs font-extrabold">
          {t("swipe.tradeHint")}
        </span>
      </div>

      {myItemCount === 0 && (
        <div
          key={nudge}
          role="status"
          aria-live="polite"
          className={clsx(
            "rounded-3xl bg-coral px-4 py-3 text-sm font-bold text-white shadow-[0_6px_0_#c44a3a]",
            nudge > 0 && "animate-bouncein ring-4 ring-coral/30",
          )}
        >
          {t("swipe.addFirst")}{" "}
          <Link to="/items/new" className="underline">
            {t("swipe.add")}
          </Link>
        </div>
      )}

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="animate-rise rounded-2xl bg-ink px-4 py-3 text-center text-sm font-bold text-cream shadow-[0_6px_0_rgba(23,21,31,0.25)]"
        >
          {notice}
        </p>
      )}

      <div className="relative mx-auto aspect-[3/4] w-full max-h-[min(62vh,540px)]">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-white text-ink/45 shadow-[0_16px_40px_rgba(23,21,31,0.08)]">
            <span className="mb-1.5 grid h-14 w-14 place-items-center rounded-[1.25rem] bg-forest text-white bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0)_60%)] shadow-[0_4px_0_#6a5ce0,0_12px_20px_-8px_rgba(23,21,31,0.28),inset_0_1.5px_0_rgba(255,255,255,0.45)]">
              <Loader2 size={24} strokeWidth={2.6} className="animate-spin" />
            </span>
            {t("swipe.building")}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-[linear-gradient(160deg,#F5F2FF_0%,#ECE7FF_55%,#F4FADF_100%)] px-6 text-center shadow-[0_16px_40px_rgba(23,21,31,0.08)] ring-1 ring-forest/10">
            <ToyMascot className="w-28" reverse />
            <p className="font-display text-3xl text-ink">{t("swipe.emptyTitle")}</p>
            <p className="text-sm font-semibold text-ink/55">
              {t("swipe.emptyText")}
            </p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => load()}
                className="btn-3d btn-3d-ink inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold"
              >
                <RotateCcw size={16} /> {t("swipe.refresh")}
              </button>
              <Link
                to="/browse"
                className="btn-3d btn-3d-white inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold"
              >
                {t("swipe.catalog")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {cards
              .slice(0, 3)
              .reverse()
              .map((card, revIdx, arr) => {
                const stackIndex = arr.length - 1 - revIdx;
                const isTop = stackIndex === 0;
                const scale = 1 - stackIndex * 0.055;
                const yOff = stackIndex * 14;
                const xOff = stackIndex * 6;
                const hinting = isTop && hint && !drag.active && !exit;
                const transform = hinting
                  ? undefined
                  : isTop
                    ? `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`
                    : `translate(${xOff}px, ${yOff}px) scale(${scale})`;

                return (
                  <div
                    key={card.id}
                    className={clsx(
                      "absolute inset-0 overflow-hidden rounded-[2rem] bg-ink shadow-[0_18px_40px_rgba(23,21,31,0.18)]",
                      isTop && "touch-none cursor-grab active:cursor-grabbing",
                      isTop && exit === "right" && "swipe-fly-right",
                      isTop && exit === "left" && "swipe-fly-left",
                      hinting && "swipe-hint",
                      !exit && isTop && !drag.active && !hint && "transition-transform duration-500 ease-[cubic-bezier(0.22,1.2,0.36,1)]",
                    )}
                    style={{
                      zIndex: 10 - stackIndex,
                      transform,
                      ["--dx" as string]: `${drag.x}px`,
                      ["--dy" as string]: `${drag.y}px`,
                      ["--rot" as string]: `${rot}deg`,
                    }}
                    onPointerDown={isTop ? onPointerDown : undefined}
                    onPointerMove={isTop ? onPointerMove : undefined}
                    onPointerUp={isTop ? onPointerUp : undefined}
                    onPointerCancel={isTop ? onPointerUp : undefined}
                  >
                    <img
                      src={
                        mediaUrl(card.media[0]?.url) ||
                        "https://placehold.co/600x800/8B7CFF/F7F3EA?text=Retoy"
                      }
                      alt={card.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                    <div
                      className="absolute inset-0 transition-colors"
                      style={{
                        background:
                          likeOpacity > 0.05
                            ? `linear-gradient(180deg, rgba(214,241,92,${0.18 * likeOpacity}) 0%, rgba(23,21,31,0.72) 100%)`
                            : passOpacity > 0.05
                              ? `linear-gradient(180deg, rgba(255,109,87,${0.28 * passOpacity}) 0%, rgba(23,21,31,0.72) 100%)`
                              : "linear-gradient(180deg, transparent 35%, rgba(23,21,31,0.82) 100%)",
                      }}
                    />

                    {isTop && likeOpacity > 0.12 && (
                      <div
                        className="swipe-stamp pointer-events-none absolute left-4 top-7 rounded-2xl border-[5px] border-sand px-3 py-1 font-display text-3xl uppercase tracking-wide text-sand"
                        style={{
                          opacity: likeOpacity,
                          transform: `rotate(-12deg) scale(${0.85 + likeOpacity * 0.2})`,
                        }}
                      >
                        {t("swipe.yes")}
                      </div>
                    )}
                    {isTop && passOpacity > 0.12 && (
                      <div
                        className="swipe-stamp pointer-events-none absolute right-4 top-7 rounded-2xl border-[5px] border-coral px-3 py-1 font-display text-3xl uppercase tracking-wide text-coral"
                        style={{
                          opacity: passOpacity,
                          transform: `rotate(12deg) scale(${0.85 + passOpacity * 0.2})`,
                        }}
                      >
                        {t("swipe.no")}
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-cream sm:p-5">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-display text-2xl leading-none sm:text-3xl">
                            {card.title}
                          </h2>
                          <p className="mt-1.5 text-sm font-semibold text-cream/75">
                            {labels.condition(card.condition)} · {card.city}
                            {card.district ? `, ${card.district}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-sand px-2.5 py-1 text-xs font-black text-ink">
                          {card.matchScore}%
                        </span>
                      </div>
                      {card.wantText && (
                        <p className="line-clamp-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-sand">
                          {t("swipe.wants", { text: card.wantText })}
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <img
                          src={
                            mediaUrl(card.owner.avatarUrl) ||
                            "https://placehold.co/40x40"
                          }
                          alt=""
                          className="h-8 w-8 rounded-full object-cover ring-2 ring-sand"
                        />
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-bold">{card.owner.name}</p>
                          <p className="text-xs font-semibold text-cream/60">
                            {card.matchReasons[0]}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>

      {cards.length > 0 && (
        <div className="flex items-center justify-center gap-5 pb-1">
          <button
            type="button"
            disabled={busy}
            aria-label={t("swipe.skip")}
            onClick={() => top && commit("PASS", top)}
            className={clsx(
              "btn-3d btn-3d-coral btn-3d-lg flex h-16 w-16 items-center justify-center rounded-full",
              passOpacity > 0.4 && "[scale:1.1]",
            )}
          >
            <X size={30} strokeWidth={2.8} />
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={t("swipe.like")}
            onClick={() => top && commit("LIKE", top)}
            className={clsx(
              "btn-3d btn-3d-lime btn-3d-lg flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full",
              likeOpacity > 0.4 && "[scale:1.1]",
              !canLike && "opacity-60",
            )}
          >
            <Heart size={32} fill="currentColor" />
          </button>
        </div>
      )}

      <p className="text-center text-xs font-bold text-ink/35">
        <Link to="/browse" className="underline-offset-2 hover:underline">
          {t("swipe.catalogList")}
        </Link>
        {" · "}
        <Link to="/matches" className="underline-offset-2 hover:underline">
          {t("swipe.matches")}
        </Link>
      </p>

      {match && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center">
          <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-cream p-6 shadow-[0_20px_60px_rgba(23,21,31,0.3)] animate-bouncein">
            <ConfettiBurst />
            <ToyMascot className="mx-auto w-28" mood="yay" />
            <p className="text-center font-display text-4xl text-ink">{t("swipe.matchTitle")}</p>
            <p className="mt-2 text-center text-sm font-semibold text-ink/60">
              {t("swipe.matchText", { name: match.theirUserName })}
            </p>
            <p className="mt-4 rounded-3xl bg-sand px-3 py-3 text-center text-base font-extrabold text-ink">
              {match.myItemTitle}
              <span className="mx-2 text-coral">⇄</span>
              {match.theirItemTitle}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => startTrade()}
                className="btn-3d btn-3d-violet inline-flex min-h-12 items-center justify-center rounded-full px-4 font-extrabold"
              >
                {t("swipe.start")}
              </button>
              <button
                type="button"
                onClick={() => setMatch(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-full text-sm font-bold text-ink/50"
              >
                {t("swipe.keepSwiping")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
