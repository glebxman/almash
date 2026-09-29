import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Heart, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { ReportButton } from "@/components/ReportButton";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

type ItemDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  condition: string;
  completeness?: string | null;
  hasDamage: boolean;
  damageNotes?: string | null;
  city: string;
  district?: string | null;
  wantText?: string | null;
  wantCategories: string[];
  status: string;
  favorited: boolean;
  media: { url: string; type: string }[];
  owner: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    rating: number;
    completedTrades: number;
    trustLevel: string;
    city: string;
    district?: string | null;
  };
};

type MyItem = { id: string; title: string; media: { url: string }[] };

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [myItems, setMyItems] = useState<MyItem[]>([]);
  const [mySets, setMySets] = useState<
    { id: string; title: string; items: { item: { id: string } }[] }[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [myItemsLoading, setMyItemsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [activePhoto, setActivePhoto] = useState(0);
  const { t } = useTranslation();
  const labels = useLabels();

  useEffect(() => {
    setActivePhoto(0);
    api<{ item: ItemDetail }>(`/api/items/${id}`).then((d) => setItem(d.item));
  }, [id]);

  useEffect(() => {
    if (!user || !offerOpen) return;
    setMyItemsLoading(true);
    api<{ items: MyItem[] }>(`/api/items?ownerId=${user.id}`)
      .then((d) =>
        setMyItems(d.items.filter((i) => (i as MyItem & { status?: string }).status !== "HIDDEN")),
      )
      .catch(() => setMyItems([]))
      .finally(() => setMyItemsLoading(false));
    api<{ sets: typeof mySets }>("/api/sets").then((d) =>
      setMySets(d.sets || []),
    );
  }, [user, offerOpen]);

  // Offer sheet open: lock the page behind it and close on Escape
  useEffect(() => {
    if (!offerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOfferOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [offerOpen]);

  if (!item) return <p className="text-ink/50">{t("pages.loading")}</p>;

  const photos = item.media.filter((m) => m.type !== "VIDEO");
  const showPhoto = (i: number) =>
    setActivePhoto((i + photos.length) % Math.max(photos.length, 1));

  const trust = labels.trust(item.owner.trustLevel);
  const isOwner = user?.id === item.owner.id;

  async function toggleFav() {
    if (!user) return navigate("/login");
    const d = await api<{ favorited: boolean }>("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ itemId: item!.id }),
    });
    setItem({ ...item!, favorited: d.favorited });
  }

  async function sendOffer() {
    if (!user) return navigate("/login");
    if (selected.length === 0) {
      setError(t("itemPage.pickOne"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api<{ trade: { id: string; publicId: string } }>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          targetItemIds: [item!.id],
          offeredItemIds: selected,
          message: message || undefined,
        }),
      });
      navigate(`/trades/${d.trade.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 animate-rise sm:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-3">
        <div className="relative -mx-3 overflow-hidden bg-mist sm:mx-0 sm:rounded-3xl">
          <img
            src={mediaUrl(photos[activePhoto]?.url)}
            alt={item.title}
            className="aspect-square w-full object-cover"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t("itemPage.prevPhoto")}
                onClick={() => showPhoto(activePhoto - 1)}
                className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur transition hover:bg-white active:scale-95"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                aria-label={t("itemPage.nextPhoto")}
                onClick={() => showPhoto(activePhoto + 1)}
                className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur transition hover:bg-white active:scale-95"
              >
                <ChevronRight size={20} />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-ink/60 px-2.5 py-1 text-xs font-semibold text-white">
                {activePhoto + 1} / {photos.length}
              </span>
            </>
          )}
        </div>
        {/* p-1: room for the active thumbnail's ring inside the scroll box */}
        <div className="-mx-1 flex gap-2.5 overflow-x-auto p-1 scrollbar-none">
          {photos.map((m, i) => (
            <button
              key={m.url}
              type="button"
              aria-label={t("itemPage.photo", { n: i + 1 })}
              aria-current={i === activePhoto}
              onClick={() => showPhoto(i)}
              className={`shrink-0 overflow-hidden rounded-xl transition ${
                i === activePhoto
                  ? "ring-2 ring-forest ring-offset-2 ring-offset-cream"
                  : "opacity-70 ring-1 ring-forest/10 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(m.url)}
                alt=""
                className="h-16 w-16 object-cover sm:h-20 sm:w-20"
              />
            </button>
          ))}
        </div>
        {item.media
          .filter((m) => m.type === "VIDEO")
          .map((m) => (
            <video
              key={m.url}
              src={mediaUrl(m.url)}
              controls
              preload="metadata"
              className="w-full rounded-2xl bg-black sm:rounded-3xl"
            />
          ))}
      </div>

      <div className="space-y-4 sm:space-y-5">
        <div>
          <p className="text-xs text-ink/50 sm:text-sm">
            {labels.category(item.category)}
            {item.subcategory ? ` · ${labels.subcategory(item.subcategory)}` : ""}
            {item.brand ? ` · ${item.brand}` : ""}
          </p>
          <h1 className="font-display text-2xl leading-tight text-forest sm:text-3xl">
            {item.title}
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            {labels.condition(item.condition)} · {item.city}
            {item.district ? `, ${item.district}` : ""}
          </p>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80 sm:text-base">
          {item.description}
        </p>

        {(item.hasDamage || item.damageNotes) && (
          <div className="rounded-xl bg-coral/10 p-3 text-sm text-coral">
            {t("itemPage.damage", { notes: item.damageNotes || t("itemPage.damageYes") })}
          </div>
        )}

        <div className="rounded-2xl bg-forest/5 p-4">
          <p className="text-sm font-medium text-forest">{t("itemPage.wantTitle")}</p>
          <p className="mt-1 text-sm">{item.wantText || t("itemPage.wantAny")}</p>
        </div>

        <Link
          to={`/users/${item.owner.id}`}
          className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-forest/10"
        >
          <img
            src={mediaUrl(item.owner.avatarUrl) || ""}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
          <div className="flex-1">
            <p className="font-medium">{item.owner.name}</p>
            <p className="text-xs text-ink/55">
              ★ {item.owner.rating.toFixed(1)} ·{" "}
              {t("itemPage.trades", { count: item.owner.completedTrades })} ·{" "}
              {trust}
            </p>
          </div>
          <ReportButton targetUserId={item.owner.id} itemId={item.id} />
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={toggleFav}
            className="btn-3d btn-3d-white inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
          >
            <Heart
              size={16}
              className={item.favorited ? "fill-coral text-coral" : ""}
            />
            {t("itemPage.favorite")}
          </button>
          {!isOwner && item.status === "ACTIVE" && (
            <button
              type="button"
              onClick={() => {
                if (!user) return navigate("/login");
                setOfferOpen(true);
              }}
              className="btn-3d btn-3d-coral inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
            >
              <RefreshCw size={16} />
              {t("itemPage.offer")}
            </button>
          )}
          {!isOwner && item.status === "IN_TRADE" && (
            <p className="w-full rounded-xl bg-sand/80 px-4 py-3 text-sm text-ink/70">
              {t("itemPage.inTrade")}
            </p>
          )}
          {!isOwner && item.status === "TRADED" && (
            <p className="w-full rounded-xl bg-mist/80 px-4 py-3 text-sm text-ink/70">
              {t("itemPage.traded")}
            </p>
          )}
        </div>

        {offerOpen &&
          // Bottom sheet on phones, centred dialog on larger screens. Only the
          // item grid scrolls, so the send button is always in reach.
          createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 pt-[var(--app-inset-top)] backdrop-blur-[2px] sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOfferOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="offer-title"
                className="flex max-h-[calc(100dvh-var(--app-inset-top)-0.5rem)] w-full animate-bouncein flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[88dvh] sm:max-w-lg sm:rounded-[1.75rem]"
              >
                {/* Header: what the offer is for */}
                <div className="flex shrink-0 items-center gap-3 border-b border-ink/[0.06] px-4 py-3">
                  <img
                    src={mediaUrl(photos[0]?.url) || "https://placehold.co/96x96"}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p id="offer-title" className="text-xs font-bold uppercase tracking-wide text-ink/45">
                      {t("itemPage.offer")}
                    </p>
                    <p className="truncate text-[15px] font-extrabold text-ink">{item.title}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("common.cancel")}
                    onClick={() => setOfferOpen(false)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5 active:scale-90"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Scrollable body: sets + my items */}
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{t("itemPage.pickMine")}</p>
                    {selected.length > 0 && (
                      <span className="shrink-0 text-xs font-bold text-forest">
                        {t("profile.sets.selected", { count: selected.length })}
                      </span>
                    )}
                  </div>

                  {mySets.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 pt-0.5 scrollbar-none">
                      <span className="shrink-0 text-xs font-semibold text-ink/50">{t("itemPage.pickSet")}</span>
                      {mySets.map((s) => {
                        const setIds = s.items.map((i) => i.item.id);
                        const allIn = setIds.length > 0 && setIds.every((id) => selected.includes(id));
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setSelected((prev) =>
                                setIds.every((id) => prev.includes(id))
                                  ? prev.filter((id) => !setIds.includes(id))
                                  : [...new Set([...prev, ...setIds])],
                              )
                            }
                            className={`btn-3d btn-3d-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                              allIn ? "btn-3d-violet" : "btn-3d-white text-forest"
                            }`}
                          >
                            📦 {s.title}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {myItemsLoading ? (
                    <div className="grid place-items-center py-10">
                      <Loader2 size={24} className="animate-spin text-forest" />
                    </div>
                  ) : myItems.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-cream/60 px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-ink/55">{t("profile.sets.noItems")}</p>
                      <Link
                        to="/items/new"
                        className="btn-3d btn-3d-violet btn-3d-sm inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold"
                      >
                        <Plus size={16} />
                        {t("nav.add")}
                      </Link>
                    </div>
                  ) : (
                    // Compact rows (small thumbnail) so the list stays short and the send button in view.
                    <div className="grid grid-cols-1 gap-1.5 p-0.5 sm:grid-cols-2">
                      {myItems.map((mi) => {
                        const on = selected.includes(mi.id);
                        return (
                          <button
                            key={mi.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              setError("");
                              setSelected((s) => (on ? s.filter((x) => x !== mi.id) : [...s, mi.id]));
                            }}
                            className={`nav-3d flex items-center gap-3 rounded-2xl p-2 text-left transition active:scale-[0.99] ${
                              on ? "bg-forest/[0.07] ring-2 ring-forest" : "bg-white ring-1 ring-forest/10 hover:ring-forest/30"
                            }`}
                          >
                            <img
                              src={mediaUrl(mi.media?.[0]?.url) || "https://placehold.co/112x112"}
                              alt=""
                              loading="lazy"
                              className="h-14 w-14 shrink-0 rounded-xl bg-cream object-cover"
                            />
                            <span
                              className={`min-w-0 flex-1 line-clamp-2 text-sm font-bold leading-snug ${
                                on ? "text-forest" : "text-ink"
                              }`}
                            >
                              {mi.title}
                            </span>
                            <span
                              className={`btn-3d btn-3d-sm pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                                on ? "btn-3d-violet" : "btn-3d-white"
                              }`}
                            >
                              {on && <Check size={15} strokeWidth={3} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer: always visible */}
                <div className="shrink-0 space-y-2 border-t border-ink/[0.06] px-4 pt-3 pb-[max(0.75rem,var(--app-inset-bottom))]">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("itemPage.messagePlaceholder")}
                    rows={1}
                    className="max-h-24 min-h-11 w-full resize-none rounded-2xl bg-ink/[0.04] px-4 py-2.5 text-sm outline-none placeholder:text-ink/35 focus:bg-ink/[0.06]"
                  />
                  {error && <p className="text-sm font-semibold text-coral">{error}</p>}
                  <button
                    type="button"
                    disabled={busy || selected.length === 0}
                    onClick={sendOffer}
                    className="btn-3d btn-3d-coral inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold"
                  >
                    {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                    {busy
                      ? t("itemPage.sending")
                      : selected.length > 0
                        ? `${t("itemPage.send")} (${selected.length})`
                        : t("itemPage.send")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
