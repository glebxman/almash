import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { FancySelect } from "@/components/FancySelect";
import { ItemCard, type ItemCardData } from "@/components/ItemCard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { CATEGORIES, CONDITIONS } from "@/lib/constants";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

type Feed = "new" | "nearby" | "for_me";

export default function BrowsePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const labels = useLabels();
  const [items, setItems] = useState<ItemCardData[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [age, setAge] = useState("");
  const [inSet, setInSet] = useState(false);
  const [feed, setFeed] = useState<Feed>("new");
  const [loading, setLoading] = useState(true);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const subcats = category ? CATEGORIES[category] || [] : [];

  // Filters that are set right now, shown as removable chips under the search.
  const activeFilters = [
    category && {
      key: "category",
      label: labels.category(category),
      clear: () => {
        setCategory("");
        setSubcategory("");
      },
    },
    subcategory && { key: "subcategory", label: labels.subcategory(subcategory), clear: () => setSubcategory("") },
    condition && { key: "condition", label: labels.condition(condition), clear: () => setCondition("") },
    brand.trim() && { key: "brand", label: brand.trim(), clear: () => setBrand("") },
    city.trim() && { key: "city", label: city.trim(), clear: () => setCity("") },
    district.trim() && { key: "district", label: district.trim(), clear: () => setDistrict("") },
    age && {
      key: "age",
      label: age === "0" ? t("browse.under1") : t("browse.age", { count: Number(age) }),
      clear: () => setAge(""),
    },
    inSet && { key: "inSet", label: t("browse.inSet"), clear: () => setInSet(false) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  function resetFilters() {
    setCategory("");
    setSubcategory("");
    setCondition("");
    setBrand("");
    setCity("");
    setDistrict("");
    setAge("");
    setInSet(false);
  }

  // While the sheet is open: lock the page behind it, close on Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const fieldCls =
    "min-h-11 w-full rounded-2xl border border-forest/15 bg-white px-4 py-3 outline-none ring-forest/30 focus:ring-2 sm:text-sm";

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (condition) params.set("condition", condition);
    if (brand) params.set("brand", brand);
    if (city.trim()) params.set("city", city.trim());
    if (district.trim()) params.set("district", district.trim());
    if (age) params.set("age", age);
    if (inSet) params.set("inSet", "1");
    params.set("feed", feed);
    if (user?.city) params.set("meCity", user.city);
    if (user?.id) params.set("meId", user.id);
    setLoading(true);
    api<{ items: (ItemCardData & { matchScore?: number; matchReasons?: string[] })[] }>(
        `/api/items?${params}`,
    )
        .then((d) => setItems(d.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
  }, [q, category, subcategory, condition, brand, city, district, age, inSet, feed, user?.city, user?.id]);

  return (
      <div className="space-y-5 sm:space-y-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-rise">
          <div>
            <h1 className="font-display text-4xl text-ink">{t("browse.title")}</h1>
            <p className="text-sm font-semibold text-ink/55">
              {t("browse.subtitle")}{" "}
              <Link to="/" className="font-extrabold text-forest underline-offset-2 hover:underline">
                {t("browse.swipeLink")}
              </Link>
              .
            </p>
          </div>
          <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold btn-3d btn-3d-lime"
          >
            <Sparkles size={16} /> {t("browse.toSwipes")}
          </Link>
        </section>

        <section
            className="relative z-20 space-y-3 animate-rise sm:space-y-4"
            style={{ animationDelay: "80ms" }}
        >
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" size={18} />
              <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("browse.search")}
                  className="min-h-12 w-full rounded-2xl border border-forest/15 bg-white/80 py-3 pl-10 pr-4 outline-none ring-forest/30 focus:ring-2 sm:text-sm"
              />
            </div>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-label={t("browse.filters")}
                onClick={() => setFiltersOpen(true)}
                className="btn-3d btn-3d-violet btn-3d-sm relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-bold"
            >
              <SlidersHorizontal size={18} strokeWidth={2.4} />
              <span className="hidden min-[400px]:inline">{t("browse.filters")}</span>
              {activeFilters.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-black text-white ring-2 ring-cream">
                    {activeFilters.length}
                  </span>
              )}
            </button>
          </div>

          {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2.5 pb-1">
                {activeFilters.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={f.clear}
                        className="btn-3d btn-3d-white btn-3d-sm inline-flex max-w-full items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-bold"
                    >
                      <span className="truncate">{f.label}</span>
                      <X size={14} strokeWidth={2.6} className="shrink-0 text-ink/40" />
                    </button>
                ))}
                <button
                    type="button"
                    onClick={resetFilters}
                    className="px-2 py-1.5 text-xs font-bold text-forest"
                >
                  {t("browse.reset")}
                </button>
              </div>
          )}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3 pt-0.5 scrollbar-none">
            {(
                [
                  ["new", t("browse.feedNew")],
                  ["nearby", t("browse.feedNearby")],
                  ["for_me", t("browse.feedForMe")],
                ] as const
            ).map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => setFeed(id)}
                    className={`btn-3d btn-3d-sm shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                      feed === id ? "btn-3d-violet" : "btn-3d-white text-ink/70"
                    }`}
                >
                  {label}
                </button>
            ))}
          </div>
        </section>

        {loading ? (
            <p className="text-ink/50">{t("pages.loading")}</p>
        ) : items.length === 0 ? (
            <p className="rounded-2xl bg-white/60 p-6 text-center text-sm text-ink/60 sm:p-8">
              {t("browse.empty")}
            </p>
        ) : (
            <div className="relative z-0 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
              ))}
            </div>
        )}

        {filtersOpen &&
            createPortal(
                <div
                    className="sheet-backdrop fixed inset-0 z-[55] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-4"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setFiltersOpen(false);
                    }}
                >
                  <div
                      role="dialog"
                      aria-modal="true"
                      aria-label={t("browse.filters")}
                      className="sheet-up flex max-h-[calc(100dvh-var(--app-inset-top)-1rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-2xl sm:max-w-md sm:rounded-3xl"
                  >
                    <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" />
                    <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-3">
                      <h2 className="font-display text-2xl text-ink">{t("browse.filters")}</h2>
                      <div className="flex items-center gap-1">
                        {activeFilters.length > 0 && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="rounded-full px-3 py-2 text-sm font-bold text-forest"
                            >
                              {t("browse.reset")}
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label={t("common.cancel")}
                            onClick={() => setFiltersOpen(false)}
                            className="grid h-10 w-10 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 active:scale-95"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">
                      <div className="space-y-2">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t("browse.categoryLabel")}</p>
                        <FancySelect
                            value={category}
                            onChange={(v) => {
                              setCategory(v);
                              setSubcategory("");
                            }}
                            placeholder={t("browse.allCategories")}
                            options={[
                              { value: "", label: t("browse.allCategories") },
                              ...Object.keys(CATEGORIES).map((c) => ({ value: c, label: labels.category(c) })),
                            ]}
                        />
                        {subcats.length > 0 && (
                            <FancySelect
                                value={subcategory}
                                onChange={setSubcategory}
                                placeholder={t("browse.allSubcategories")}
                                options={[
                                  { value: "", label: t("browse.allSubcategories") },
                                  ...subcats.map((sc) => ({ value: sc, label: labels.subcategory(sc) })),
                                ]}
                            />
                        )}
                      </div>

                      <div className="grid gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-2">
                        <div className="min-w-0 space-y-2">
                          <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t("browse.conditionLabel")}</p>
                          <FancySelect
                              value={condition}
                              onChange={setCondition}
                              placeholder={t("browse.anyCondition")}
                              options={[
                                { value: "", label: t("browse.anyCondition") },
                                ...CONDITIONS.map((c) => ({ value: c, label: labels.condition(c) })),
                              ]}
                          />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t("browse.ageLabel")}</p>
                          <FancySelect
                              value={age}
                              onChange={setAge}
                              placeholder={t("browse.anyAge")}
                              options={[
                                { value: "", label: t("browse.anyAge") },
                                ...Array.from({ length: 15 }, (_, i) => ({
                                  value: String(i),
                                  label: i === 0 ? t("browse.under1") : t("browse.age", { count: i }),
                                })),
                              ]}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t("browse.brandLabel")}</p>
                        <input
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            placeholder={t("browse.brand")}
                            className={fieldCls}
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">{t("browse.placeLabel")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder={t("browse.city")}
                              className={fieldCls}
                          />
                          <input
                              value={district}
                              onChange={(e) => setDistrict(e.target.value)}
                              placeholder={t("browse.district")}
                              className={fieldCls}
                          />
                        </div>
                      </div>

                      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-forest/15 bg-white px-4 py-3 text-sm font-semibold text-ink/80">
                        {t("browse.inSet")}
                        <input
                            type="checkbox"
                            checked={inSet}
                            onChange={(e) => setInSet(e.target.checked)}
                            className="h-5 w-5"
                        />
                      </label>
                    </div>

                    <div className="shrink-0 border-t border-ink/[0.06] bg-cream px-5 pb-[max(1rem,var(--app-inset-bottom))] pt-3">
                      <button
                          type="button"
                          onClick={() => setFiltersOpen(false)}
                          className="btn-3d btn-3d-violet min-h-12 w-full rounded-2xl text-sm font-extrabold"
                      >
                        {loading ? t("pages.loading") : t("browse.show", { count: items.length })}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
            )}
      </div>
  );
}