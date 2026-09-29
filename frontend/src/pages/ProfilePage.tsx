import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { ItemCard, type ItemCardData } from "@/components/ItemCard";
import { useTranslation } from "react-i18next";
import { LanguageList } from "@/components/LanguageSwitcher";
import { useFeedback } from "@/components/Feedback";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  Heart,
  Languages,
  Layers,
  Loader2,
  LogOut,
  Plus,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

function SettingsGroup({
  title,
  icon: Icon,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-1.5 flex items-center gap-1.5 px-4 text-xs font-bold uppercase tracking-wide text-ink/45">
          {Icon && <Icon size={14} />}
          {title}
        </h2>
      )}
      <div className="card-3d divide-y divide-ink/[0.06] overflow-hidden rounded-2xl">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  iconBg,
  label,
  to,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const content = (
    <>
      <span
        className={`btn-3d btn-3d-sm pointer-events-none grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${iconBg}`}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className={`flex-1 text-[15px] font-semibold ${danger ? "text-coral" : "text-ink"}`}>
        {label}
      </span>
      {!danger && <ChevronRight size={18} className="shrink-0 text-ink/25" />}
    </>
  );
  const className =
    // nav-3d: pressing the row sinks its 3D icon key
    "nav-3d flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-ink/[0.04]";

  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export default function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { confirm } = useFeedback();
  const [items, setItems] = useState<(ItemCardData & { status?: string })[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [listingErr, setListingErr] = useState("");
  const [sets, setSets] = useState<
      {
        id: string;
        title: string;
        description?: string | null;
        items: { item: ItemCardData }[];
      }[]
  >([]);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [newSetDesc, setNewSetDesc] = useState("");
  const [selectedSetItemIds, setSelectedSetItemIds] = useState<string[]>([]);
  const [itemSetBusy, setItemSetBusy] = useState(false);
  const [itemSetError, setItemSetError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  const loadSets = () => {
    if (!user) return;
    api<{ sets: typeof sets }>("/api/sets").then((d) => setSets(d.sets || []));
  };

  useEffect(() => {
    if (!user) return;
    api<{ items: ItemCardData[] }>(`/api/items?ownerId=${user.id}`).then((d) =>
        setItems(d.items),
    );
    loadSets();
  }, [user]);

  if (!user) return null;

  const trust = t(`trust.${user.trustLevel}`, { defaultValue: user.trustLevel });

  return (
      <div className="space-y-6 animate-rise sm:space-y-8">
        {/* Telegram-style header: centred avatar, name, handle, quick stats */}
        <section className="flex flex-col items-center px-2 pt-2 text-center">
          <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label={t("profile.avatar.change")}
              title={t("profile.avatar.change")}
              className="nav-3d group relative rounded-full"
          >
            <img
                src={mediaUrl(user.avatarUrl) || "https://placehold.co/96x96"}
                alt=""
                className="h-24 w-24 rounded-full object-cover shadow-[0_6px_0_#e2dcf2,0_14px_28px_-10px_rgba(23,21,31,0.25)] ring-4 ring-white"
            />
            {avatarBusy && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45">
                  <Loader2 size={28} className="animate-spin text-white" />
                </span>
            )}
            <span className="btn-3d btn-3d-violet btn-3d-sm pointer-events-none absolute bottom-0.5 right-0 grid h-8 w-8 place-items-center rounded-full ring-[3px] ring-cream">
              <Camera size={16} strokeWidth={2.4} />
            </span>
          </button>
          <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setAvatarBusy(true);
                setAvatarErr("");
                try {
                  const form = new FormData();
                  form.append("file", file);
                  await api("/api/me/avatar", { method: "POST", body: form });
                  await refresh();
                } catch (err) {
                  setAvatarErr(err instanceof Error ? err.message : t("common.error"));
                } finally {
                  setAvatarBusy(false);
                }
              }}
          />
          {avatarErr && <p className="mt-2 text-sm font-semibold text-coral">{avatarErr}</p>}
          <h1 className="mt-3 max-w-full break-words font-display text-2xl text-ink sm:text-3xl">
            {user.name}
          </h1>
          <p className="mt-0.5 max-w-full truncate text-sm font-semibold text-ink/50">
            @{user.username}
            {user.city ? ` · ${user.city}` : ""}
          </p>

          <div className="mt-4 grid w-full max-w-md grid-cols-3 gap-2.5 pb-1">
            <div className="card-3d flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3">
              <span className="flex items-center gap-1 text-base font-extrabold text-ink">
                <Star size={15} className="fill-forest text-forest" />
                {(user.rating ?? 0).toFixed(1)}
              </span>
              <span className="text-[11px] font-semibold text-ink/45">{t("profile.stats.rating")}</span>
            </div>
            <div className="card-3d flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3">
              <span className="text-base font-extrabold text-ink">{user.completedTrades ?? 0}</span>
              <span className="text-[11px] font-semibold text-ink/45">{t("profile.stats.trades")}</span>
            </div>
            <div className="card-3d flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-2 py-3">
              <span className="flex max-w-full items-center gap-1 text-base font-extrabold text-ink">
                <ShieldCheck size={15} className="hidden shrink-0 text-forest min-[400px]:block" />
                <span className="truncate">{trust}</span>
              </span>
              <span className="text-[11px] font-semibold text-ink/45">{t("profile.stats.trust")}</span>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-md space-y-5">
          <SettingsGroup>
            <SettingsRow to="/favorites" icon={Heart} iconBg="btn-3d-coral" label={t("profile.favorites")} />
            <SettingsRow to="/notifications" icon={Bell} iconBg="btn-3d-violet" label={t("profile.alerts")} />
          </SettingsGroup>

          {/* The admin link lives only in the desktop header, so phones reach it from here. */}
          {user.role === "ADMIN" && (
              <SettingsGroup>
                <SettingsRow to="/admin" icon={Shield} iconBg="btn-3d-ink" label={t("nav.admin")} />
              </SettingsGroup>
          )}

          {/* Interface language: ru (default) / uz */}
          <SettingsGroup title={t("lang.label")} icon={Languages}>
            <LanguageList />
          </SettingsGroup>

          <SettingsGroup>
            <SettingsRow
                icon={LogOut}
                iconBg="btn-3d-coral"
                label={t("profile.logout")}
                danger
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
            />
          </SettingsGroup>
        </div>

        {/* Мои наборы (ItemSets - TZ п. 8) */}
        <section className="card-3d space-y-4 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-xl leading-tight text-ink sm:text-2xl">
                <Layers size={20} className="shrink-0 text-forest" />
                {t("profile.sets.title")}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink/55">{t("profile.sets.hint")}</p>
            </div>
            <button
                type="button"
                onClick={() => {
                  setIsCreatingSet((v) => !v);
                  setItemSetError("");
                }}
                aria-label={isCreatingSet ? t("profile.sets.cancel") : t("profile.sets.create")}
                className={`btn-3d btn-3d-sm inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold ${
                  isCreatingSet ? "btn-3d-soft" : "btn-3d-violet"
                }`}
            >
              {isCreatingSet ? <X size={16} /> : <Plus size={16} strokeWidth={2.6} />}
              <span className="hidden min-[400px]:inline">
                {isCreatingSet ? t("profile.sets.cancel") : t("profile.sets.createShort")}
              </span>
            </button>
          </div>

          {isCreatingSet && (
              <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (selectedSetItemIds.length === 0) {
                      setItemSetError(t("profile.sets.pickOne"));
                      return;
                    }
                    setItemSetBusy(true);
                    setItemSetError("");
                    try {
                      await api("/api/sets", {
                        method: "POST",
                        body: JSON.stringify({
                          title: newSetTitle,
                          description: newSetDesc || undefined,
                          itemIds: selectedSetItemIds,
                        }),
                      });
                      setNewSetTitle("");
                      setNewSetDesc("");
                      setSelectedSetItemIds([]);
                      setIsCreatingSet(false);
                      loadSets();
                    } catch (err) {
                      setItemSetError(
                          err instanceof Error ? err.message : t("profile.sets.createError"),
                      );
                    } finally {
                      setItemSetBusy(false);
                    }
                  }}
                  className="space-y-3 border-t border-ink/[0.06] pt-4"
              >
                <input
                    type="text"
                    required
                    placeholder={t("profile.sets.namePlaceholder")}
                    value={newSetTitle}
                    onChange={(e) => setNewSetTitle(e.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 py-2.5 text-sm font-semibold outline-none transition placeholder:font-normal placeholder:text-ink/35 focus:border-forest/40 focus:bg-white focus:ring-2 focus:ring-forest/15"
                />
                <input
                    type="text"
                    placeholder={t("profile.sets.descPlaceholder")}
                    value={newSetDesc}
                    onChange={(e) => setNewSetDesc(e.target.value)}
                    className="min-h-11 w-full rounded-2xl border border-ink/10 bg-cream/60 px-4 py-2.5 text-sm outline-none transition placeholder:text-ink/35 focus:border-forest/40 focus:bg-white focus:ring-2 focus:ring-forest/15"
                />

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink/45">{t("profile.sets.pickItems")}</p>
                    {selectedSetItemIds.length > 0 && (
                        <span className="shrink-0 text-xs font-bold text-forest">
                          {t("profile.sets.selected", { count: selectedSetItemIds.length })}
                        </span>
                    )}
                  </div>
                  {items.length === 0 ? (
                      <p className="rounded-2xl bg-cream/60 px-4 py-6 text-center text-xs font-semibold text-ink/50">
                        {t("profile.sets.noItems")}
                      </p>
                  ) : (
                      <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-0.5 sm:grid-cols-3">
                        {items.map((it) => {
                          const isSelected = selectedSetItemIds.includes(it.id);
                          return (
                              <button
                                  type="button"
                                  key={it.id}
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    setItemSetError("");
                                    setSelectedSetItemIds((prev) =>
                                        isSelected ? prev.filter((id) => id !== it.id) : [...prev, it.id],
                                    );
                                  }}
                                  className={`overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.97] ${
                                    isSelected ? "ring-[3px] ring-forest" : "ring-1 ring-ink/10 hover:ring-forest/30"
                                  }`}
                              >
                                <div className="relative aspect-square w-full overflow-hidden bg-cream">
                                  <img
                                      src={mediaUrl(it.media?.[0]?.url) || "https://placehold.co/300x300"}
                                      alt=""
                                      loading="lazy"
                                      className="absolute inset-0 h-full w-full object-cover"
                                  />
                                  <span
                                      className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-white shadow transition ${
                                        isSelected ? "bg-forest" : "bg-white/80 ring-1 ring-ink/10"
                                      }`}
                                  >
                                    {isSelected && <Check size={14} strokeWidth={3} />}
                                  </span>
                                </div>
                                <p
                                    className={`line-clamp-2 px-2 py-1.5 text-xs font-bold leading-snug ${
                                      isSelected ? "text-forest" : "text-ink"
                                    }`}
                                >
                                  {it.title}
                                </p>
                              </button>
                          );
                        })}
                      </div>
                  )}
                </div>

                {itemSetError && (
                    <p className="rounded-xl bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">{itemSetError}</p>
                )}
                <button
                    type="submit"
                    disabled={itemSetBusy || items.length === 0}
                    className="btn-3d btn-3d-violet inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold"
                >
                  {itemSetBusy && <Loader2 size={16} className="animate-spin" />}
                  {itemSetBusy ? t("profile.sets.saving") : t("profile.sets.save")}
                </button>
              </form>
          )}

          {!isCreatingSet && itemSetError && (
              <p className="rounded-xl bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">{itemSetError}</p>
          )}

          {sets.length === 0 ? (
              !isCreatingSet && (
                  <p className="rounded-2xl bg-cream/60 px-4 py-6 text-center text-xs font-semibold text-ink/50">
                    {t("profile.sets.empty")}
                  </p>
              )
          ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sets.map((s) => (
                    <div key={s.id} className="space-y-3 rounded-2xl p-3 ring-1 ring-ink/[0.08]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="break-words text-[15px] font-extrabold leading-snug text-ink">{s.title}</h3>
                          <p className="text-xs text-ink/50">
                            {s.description ? `${s.description} · ` : ""}
                            {t("profile.sets.itemsCount", { count: s.items.length })}
                          </p>
                        </div>
                        <button
                            type="button"
                            aria-label={t("profile.sets.delete")}
                            title={t("profile.sets.delete")}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t("toast.deleteSetTitle"),
                                message: t("profile.sets.confirmDelete", { title: s.title }),
                              });
                              if (!ok) return;
                              try {
                                await api(`/api/sets?id=${s.id}`, { method: "DELETE" });
                                loadSets();
                              } catch (e) {
                                setItemSetError(e instanceof Error ? e.message : t("common.error"));
                              }
                            }}
                            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-coral/10 hover:text-coral"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {s.items.map(({ item }) => (
                            <Link key={item.id} to={`/items/${item.id}`} className="w-16 shrink-0" title={item.title}>
                              <img
                                  src={mediaUrl(item.media?.[0]?.url) || "https://placehold.co/128x128"}
                                  alt=""
                                  loading="lazy"
                                  className="aspect-square w-16 rounded-xl object-cover ring-1 ring-ink/[0.06]"
                              />
                              <p className="mt-1 truncate text-[10px] font-semibold text-ink/60">{item.title}</p>
                            </Link>
                        ))}
                      </div>
                    </div>
                ))}
              </div>
          )}
        </section>


        <section className="space-y-3">
          <h2 className="font-display text-2xl text-forest">{t("profile.listings.title")}</h2>
          {listingErr && (
              <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">{listingErr}</p>
          )}
          {items.length === 0 ? (
              <p className="card-3d rounded-2xl px-4 py-8 text-center text-sm font-semibold text-ink/50">
                {t("profile.listings.empty")}
              </p>
          ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {items.map((item) => {
                  const inTrade = item.status === "IN_TRADE";
                  // Got it in a trade: private until the owner lists it.
                  const received = item.status === "RECEIVED";
                  const deleting = deletingId === item.id;
                  return (
                      <div
                          key={item.id}
                          className={`relative flex flex-col gap-2 transition ${deleting ? "opacity-50" : ""}`}
                      >
                        <div className="relative flex-1">
                          <ItemCard item={item} />
                          {received && (
                              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-sand px-2.5 py-1 text-[11px] font-extrabold text-ink shadow-md">
                                {t("profile.listings.received")}
                              </span>
                          )}
                        </div>
                        {received && (
                            <button
                                type="button"
                                disabled={publishingId === item.id}
                                onClick={async () => {
                                  setListingErr("");
                                  setPublishingId(item.id);
                                  try {
                                    await api(`/api/items/${item.id}`, {
                                      method: "PATCH",
                                      body: JSON.stringify({ publish: true }),
                                    });
                                    setItems((prev) =>
                                        prev.map((i) => (i.id === item.id ? { ...i, status: "ACTIVE" } : i)),
                                    );
                                  } catch (e) {
                                    setListingErr(e instanceof Error ? e.message : t("common.error"));
                                  } finally {
                                    setPublishingId(null);
                                  }
                                }}
                                className="btn-3d btn-3d-violet btn-3d-sm inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-extrabold"
                            >
                              {publishingId === item.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                              ) : (
                                  <Upload size={14} strokeWidth={2.6} />
                              )}
                              {t("profile.listings.publish")}
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={deleting}
                            aria-label={t("profile.listings.delete")}
                            title={inTrade ? t("profile.listings.inTrade") : t("profile.listings.delete")}
                            onClick={async () => {
                              setListingErr("");
                              if (inTrade) {
                                setListingErr(t("profile.listings.inTrade"));
                                return;
                              }
                              const ok = await confirm({
                                title: t("toast.deleteItemTitle"),
                                message: t("profile.listings.confirmDelete", { title: item.title }),
                              });
                              if (!ok) return;
                              setDeletingId(item.id);
                              try {
                                await api(`/api/items/${item.id}`, { method: "DELETE" });
                                setItems((prev) => prev.filter((i) => i.id !== item.id));
                                loadSets();
                              } catch (e) {
                                setListingErr(e instanceof Error ? e.message : t("common.error"));
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                            className={`absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full shadow-md backdrop-blur-sm transition active:scale-90 ${
                              inTrade ? "bg-white/70 text-ink/30" : "bg-white/90 text-coral hover:bg-coral hover:text-white"
                            }`}
                        >
                          {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                        </button>
                      </div>
                  );
                })}
              </div>
          )}
        </section>
      </div>
  );
}
