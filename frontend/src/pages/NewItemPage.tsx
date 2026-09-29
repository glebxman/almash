import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { MAX_VIDEO_MB, uploadMedia, VIDEO_ACCEPT } from "@/lib/media";
import { CATEGORIES, CONDITIONS } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { FancySelect } from "@/components/FancySelect";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

const ALL_SUBCATEGORIES = Object.values(CATEGORIES).flat();

/** Validated fields, in the order they appear in the form. */
const FIELD_ORDER = ["photos", "title", "description", "city", "ageFrom", "ageTo", "defectsConfirmed"] as const;
type FieldKey = (typeof FIELD_ORDER)[number];
type FieldErrors = Partial<Record<FieldKey, string>>;

const INPUT_OK = "border-forest/15 bg-cream/40 focus:border-forest/40 focus:ring-forest/15";
const INPUT_BAD = "border-coral bg-coral/5 focus:border-coral focus:ring-coral/20";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="block text-xs font-semibold text-coral">{message}</span>;
}

// Same look as the text fields of this form
const FIELD_TRIGGER =
  "border-forest/15 bg-cream/40 hover:border-forest/30 focus:border-forest/40 focus:bg-white focus:ring-forest/15";

export default function NewItemPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("Игрушки");
  const [subcategory, setSubcategory] = useState(CATEGORIES["Игрушки"]?.[0] ?? "");
  const [condition, setCondition] = useState<string>(CONDITIONS[0]);
  const [isOriginal, setIsOriginal] = useState("on");
  const [wantType, setWantType] = useState("ANY");
  // Stored values stay Russian (matching compares them with subcategories)
  const [wantCats, setWantCats] = useState<string[]>([]);
  const { t } = useTranslation();
  const labels = useLabels();
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const subcats = useMemo(() => CATEGORIES[category] || [], [category]);
  // Optional parts of the form start collapsed to keep it short on phones.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wantMoreOpen, setWantMoreOpen] = useState(false);

  if (!loading && !user) {
    navigate("/login", { replace: true });
  }

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as FieldKey];
      if (Object.keys(next).length === 0) setError("");
      return next;
    });
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        fd.append("itemId", "draft");
        fd.append("sortOrder", String(uploaded.length + i));
        const data = await api<{ url: string; duplicateWarning?: boolean }>("/api/upload", {
          method: "POST",
          body: fd,
        });
        setUploaded((u) => [...u, data.url]);
        clearFieldError("photos");
        if (data.duplicateWarning) {
          setError(t("newItem.duplicatePhotos"));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("newItem.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  /** Short field names for the "fill in: …" summary above the submit button. */
  const fieldNames: Record<string, string> = {
    title: t("newItem.name"),
    description: t("newItem.description"),
    city: t("newItem.city"),
    ageFrom: t("newItem.ageFrom"),
    ageTo: t("newItem.ageTo"),
    photos: t("newItem.err.photos"),
    defectsConfirmed: t("newItem.err.defectsShort"),
  };

  /** Mirrors the backend createSchema so the user learns about every problem at once. */
  function validate(fd: FormData): FieldErrors {
    const errs: FieldErrors = {};
    const str = (key: string) => String(fd.get(key) || "").trim();

    const title = str("title");
    if (!title) errs.title = t("newItem.err.required");
    else if (title.length < 3) errs.title = t("newItem.err.titleMin");

    const description = str("description");
    if (!description) errs.description = t("newItem.err.required");
    else if (description.length < 10) errs.description = t("newItem.err.descMin", { count: description.length });

    for (const key of ["ageFrom", "ageTo"] as const) {
      const v = str(key);
      if (v && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 18)) errs[key] = t("newItem.err.age");
    }
    if (!errs.ageFrom && !errs.ageTo && str("ageFrom") && str("ageTo") && Number(str("ageFrom")) > Number(str("ageTo"))) {
      errs.ageTo = t("newItem.ageOrder");
    }

    if (!str("city")) errs.city = t("newItem.err.required");

    if (uploaded.length < 2) errs.photos = t("newItem.err.photosMin", { count: uploaded.length });
    else if (uploaded.length > 10) errs.photos = t("newItem.err.photosMax", { count: uploaded.length });

    if (fd.get("defectsConfirmed") !== "on") errs.defectsConfirmed = t("newItem.err.defects");
    return errs;
  }

  /** Scroll the first broken field into view (form order) and focus it. */
  function revealFirst(errs: FieldErrors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    const box = document.querySelector<HTMLElement>(`[data-field="${first}"]`);
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    box?.querySelector<HTMLElement>("input:not([type=file]), textarea")?.focus({ preventScroll: true });
  }

  function showErrors(errs: FieldErrors) {
    setFieldErrors(errs);
    const names = FIELD_ORDER.filter((k) => errs[k]).map((k) => fieldNames[k]);
    setError(t("newItem.err.summary", { fields: names.join(", ") }));
    // Age fields live in the collapsed "details" section: open it first.
    if (errs.ageFrom || errs.ageTo) setDetailsOpen(true);
    requestAnimationFrame(() => revealFirst(errs));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setError("");
    const fd = new FormData(e.currentTarget);
    const photos = uploaded;

    const errs = validate(fd);
    if (Object.keys(errs).length > 0) {
      showErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true);

    const list = (key: string) =>
        String(fd.get(key) || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    const wantCategories = wantCats;
    const num = (key: string) => {
      const v = String(fd.get(key) || "").trim();
      return v === "" ? undefined : Number(v);
    };
    const ageFrom = num("ageFrom");
    const ageTo = num("ageTo");

    try {
      const data = await api<{ item: { id: string } }>("/api/items", {
        method: "POST",
        body: JSON.stringify({
          title: fd.get("title"),
          description: fd.get("description"),
          category,
          subcategory: fd.get("subcategory") || undefined,
          brand: fd.get("brand") || undefined,
          model: fd.get("model") || undefined,
          ageFrom,
          ageTo,
          tags: list("tags"),
          condition: fd.get("condition"),
          completeness: fd.get("completeness") || undefined,
          hasDamage: fd.get("hasDamage") === "on",
          damageNotes: fd.get("damageNotes") || undefined,
          missingParts: fd.get("missingParts") || undefined,
          isOriginal: fd.get("isOriginal") !== "off",
          city: fd.get("city") || user.city,
          district: fd.get("district") || undefined,
          wantType: fd.get("wantType") || "ANY",
          wantText: fd.get("wantText") || undefined,
          wantCategories,
          wantBrands: list("wantBrands"),
          defectsConfirmed: true,
          photos,
          videoUrl: videoUrl || undefined,
        }),
      });
      navigate(`/items/${data.item.id}`);
    } catch (err) {
      // Zod issues from the API name the field: show them in place instead of "invalid data".
      const issues = (err as { data?: { issues?: { path?: (string | number)[] }[] } }).data?.issues;
      const serverErrs: FieldErrors = {};
      for (const issue of issues ?? []) {
        const key = String(issue.path?.[0] ?? "") as FieldKey;
        if (FIELD_ORDER.includes(key) && !serverErrs[key]) serverErrs[key] = t("newItem.err.server");
      }
      if (Object.keys(serverErrs).length > 0) showErrors(serverErrs);
      else setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
      <div className="mx-auto max-w-2xl space-y-4 animate-rise sm:space-y-6">
        <div>
          <h1 className="font-display text-2xl text-forest sm:text-3xl">{t("newItem.title")}</h1>
          <p className="mt-1 text-sm text-ink/60">
            {t("newItem.subtitle")}
          </p>
        </div>

        <form
            noValidate
            onSubmit={onSubmit}
            onChange={(e) => clearFieldError((e.target as unknown as HTMLInputElement).name)}
            className="space-y-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-forest/10 sm:p-8"
        >
          {/* Фото */}
          <div className="space-y-3">
            <SectionTitle>{t("newItem.sectionPhotos")}</SectionTitle>
            <label data-field="photos" className="block space-y-3 text-sm">
            <span className="font-medium text-ink/80">
              {t("newItem.photosLabel")} <span className="text-coral">*</span>
            </span>

              <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                    fieldErrors.photos
                      ? "border-coral bg-coral/5"
                      : "border-forest/20 bg-cream/40 hover:border-forest/40 hover:bg-cream/60"
                  }`}
              >
              <span className="text-sm font-semibold text-forest">
                {uploading ? t("newItem.uploading") : t("newItem.pickPhotos")}
              </span>
                <span className="text-xs text-ink/45">{t("newItem.photoFormats")}</span>
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onUpload(e.target.files)}
                    className="hidden"
                />
              </label>

              {uploaded.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploaded.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={u}
                            src={mediaUrl(u)}
                            alt=""
                            className="h-16 w-16 rounded-xl object-cover ring-1 ring-forest/15"
                        />
                    ))}
                  </div>
              )}

              <FieldError message={fieldErrors.photos} />
              <span className="block text-xs text-ink/45">
              {t("newItem.photoHint")}
            </span>
            </label>

            <div className="space-y-2 text-sm">
              <span className="font-medium text-ink/80">{t("newItem.video")}</span>
              <p className="text-xs text-ink/45">
                {t("newItem.videoHint", { mb: MAX_VIDEO_MB })}
              </p>
              {videoUrl ? (
                  <div className="space-y-2">
                    <video
                        src={mediaUrl(videoUrl)}
                        controls
                        preload="metadata"
                        className="max-h-56 w-full rounded-2xl bg-black"
                    />
                    <button
                        type="button"
                        onClick={() => setVideoUrl("")}
                        className="text-xs font-bold text-coral hover:underline"
                    >
                      {t("newItem.deleteVideo")}
                    </button>
                  </div>
              ) : (
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-forest/20 bg-cream/40 px-4 py-4 text-sm font-semibold text-forest transition hover:border-forest/40">
                    {videoUploading ? t("newItem.uploadingVideo") : t("newItem.pickVideo")}
                    <input
                        type="file"
                        accept={VIDEO_ACCEPT}
                        disabled={videoUploading}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setVideoUploading(true);
                          setError("");
                          try {
                            setVideoUrl(await uploadMedia(file));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("newItem.videoError"));
                          } finally {
                            setVideoUploading(false);
                            e.target.value = "";
                          }
                        }}
                    />
                  </label>
              )}
            </div>
          </div>

          {/* Основная информация */}
          <div className="space-y-4">
            <SectionTitle>{t("newItem.sectionMain")}</SectionTitle>
            <Field label={t("newItem.name")} name="title" required error={fieldErrors.title} />
            <label data-field="description" className="block space-y-1.5 text-sm">
              <span className="font-medium text-ink/80">
                {t("newItem.description")} <span className="text-coral">*</span>
              </span>
              <textarea
                  name="description"
                  rows={4}
                  aria-invalid={Boolean(fieldErrors.description)}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-ink outline-none transition focus:bg-white focus:ring-2 ${
                    fieldErrors.description ? INPUT_BAD : INPUT_OK
                  }`}
              />
              <FieldError message={fieldErrors.description} />
            </label>
          </div>

          {/* Категория и состояние */}
          <div className="space-y-4">
            <SectionTitle>{t("newItem.sectionCategory")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-ink/80">{t("newItem.category")}</span>
                <FancySelect
                    value={category}
                    onChange={(v) => {
                      setCategory(v);
                      setSubcategory(CATEGORIES[v]?.[0] ?? "");
                    }}
                    options={Object.keys(CATEGORIES).map((c) => ({ value: c, label: labels.category(c) }))}
                    triggerClassName={FIELD_TRIGGER}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-ink/80">{t("newItem.subcategory")}</span>
                <FancySelect
                    name="subcategory"
                    value={subcategory}
                    onChange={setSubcategory}
                    options={subcats.map((sc) => ({ value: sc, label: labels.subcategory(sc) }))}
                    triggerClassName={FIELD_TRIGGER}
                />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-ink/80">{t("newItem.condition")}</span>
              <FancySelect
                  name="condition"
                  value={condition}
                  onChange={setCondition}
                  options={CONDITIONS.map((c) => ({ value: c, label: labels.condition(c) }))}
                  triggerClassName={FIELD_TRIGGER}
              />
            </label>

          </div>

          {/* Локация */}
          <div className="space-y-4">
            <SectionTitle>{t("newItem.sectionLocation")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("newItem.city")} name="city" defaultValue={user?.city} required error={fieldErrors.city} />
              <Field label={t("newItem.district")} name="district" />
            </div>
          </div>

          {/* Хочу получить */}
          <div className="space-y-4">
            <SectionTitle>{t("newItem.sectionWant")}</SectionTitle>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-ink/80">{t("newItem.wantType")}</span>
              <FancySelect
                  name="wantType"
                  value={wantType}
                  onChange={setWantType}
                  options={[
                    { value: "ANY", label: t("newItem.wantAny") },
                    { value: "CATEGORY", label: t("newItem.wantCategory") },
                    { value: "BRAND", label: t("newItem.wantBrand") },
                    { value: "SPECIFIC", label: t("newItem.wantSpecific") },
                  ]}
                  triggerClassName={FIELD_TRIGGER}
              />
            </label>
            <Field
                label={t("newItem.wantText")}
                name="wantText"
                placeholder={t("newItem.wantTextPlaceholder")}
            />
            <MoreSection
                open={wantMoreOpen}
                onToggle={setWantMoreOpen}
                title={t("newItem.moreWant")}
                hint={t("newItem.moreWantHint")}
            >
            {/* Chips instead of free text: the backend matches these values
                against subcategories, so they must stay exact (Russian) */}
            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-ink/80">{t("newItem.wantCategories")}</span>
              <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 pb-1">
                {ALL_SUBCATEGORIES.map((sc) => {
                  const on = wantCats.includes(sc);
                  return (
                      <button
                          key={sc}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                              setWantCats((prev) =>
                                  on ? prev.filter((x) => x !== sc) : [...prev, sc],
                              )
                          }
                          className={`btn-3d btn-3d-sm rounded-full px-3 py-1.5 text-xs font-bold ${
                              on ? "btn-3d-violet" : "btn-3d-white text-ink/70"
                          }`}
                      >
                        {labels.subcategory(sc)}
                      </button>
                  );
                })}
              </div>
            </div>
            <Field
                label={t("newItem.wantBrands")}
                name="wantBrands"
                placeholder="LEGO, Hot Wheels"
            />
            </MoreSection>
          </div>

          {/* Необязательные подробности */}
          <MoreSection
              open={detailsOpen}
              onToggle={setDetailsOpen}
              title={t("newItem.moreDetails")}
              hint={t("newItem.moreDetailsHint")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("newItem.brand")} name="brand" />
              <Field label={t("newItem.model")} name="model" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("newItem.ageFrom")} name="ageFrom" type="number" min={0} max={18} error={fieldErrors.ageFrom} />
              <Field label={t("newItem.ageTo")} name="ageTo" type="number" min={0} max={18} error={fieldErrors.ageTo} />
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-ink/80">{t("newItem.original")}</span>
              <FancySelect
                  name="isOriginal"
                  value={isOriginal}
                  onChange={setIsOriginal}
                  options={[
                    { value: "on", label: t("newItem.originalYes") },
                    { value: "off", label: t("newItem.originalNo") },
                  ]}
                  triggerClassName={FIELD_TRIGGER}
              />
            </label>

            <Field label={t("newItem.tags")} name="tags" placeholder={t("newItem.tagsPlaceholder")} />
            <Field label={t("newItem.completeness")} name="completeness" />

            <label className="flex items-center gap-2.5 rounded-2xl bg-cream/50 px-4 py-3 text-sm font-medium text-ink/80">
              <input
                  type="checkbox"
                  name="hasDamage"
                  className="h-5 w-5"
              />
              {t("newItem.hasDamage")}
            </label>
            <Field label={t("newItem.damageNotes")} name="damageNotes" />
            <Field label={t("newItem.missingParts")} name="missingParts" />
          </MoreSection>

          <div data-field="defectsConfirmed" className="space-y-1.5">
            <label
                className={`flex items-start gap-3 rounded-2xl p-4 text-sm ${
                  fieldErrors.defectsConfirmed ? "bg-coral/10 ring-1 ring-coral" : "bg-mist/50"
                }`}
            >
              <input
                  type="checkbox"
                  name="defectsConfirmed"
                  className="h-5 w-5 shrink-0"
              />
              <span className="text-ink/75">
              {t("newItem.defectsConfirm")}
            </span>
            </label>
            <FieldError message={fieldErrors.defectsConfirmed} />
          </div>

          {/* Right above the button, so it is seen where the user tapped */}
          {error && (
              <p role="alert" className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral ring-1 ring-coral/20">
                {error}
              </p>
          )}

          <button
              type="submit"
              disabled={busy}
              className="btn-3d btn-3d-coral btn-3d-lg min-h-12 w-full rounded-2xl py-3 font-extrabold"
          >
            {busy ? t("newItem.publishing") : t("newItem.publish")}
          </button>
        </form>
      </div>
  );
}

/**
 * Collapsible block for optional fields. A native <details> keeps its inputs
 * mounted while closed, so they are still part of the form's FormData.
 */
function MoreSection({
  open,
  onToggle,
  title,
  hint,
  children,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
      <details
          open={open}
          onToggle={(e) => onToggle(e.currentTarget.open)}
          className="group rounded-2xl bg-cream/50 ring-1 ring-forest/10"
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">{title}</span>
            <span className="block truncate text-xs text-ink/45">{hint}</span>
          </span>
          <ChevronDown
              size={18}
              aria-hidden
              className="shrink-0 text-ink/40 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-4 border-t border-forest/10 px-4 pb-4 pt-3">{children}</div>
      </details>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
      <h2 className="text-xs font-bold uppercase tracking-wide text-forest/60">
        {children}
      </h2>
  );
}


function Field({
                 label,
                 name,
                 required,
                 defaultValue,
                 placeholder,
                 type = "text",
                 min,
                 max,
                 error,
               }: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  error?: string;
}) {
  return (
      <label data-field={name} className="block space-y-1.5 text-sm">
        <span className="font-medium text-ink/80">
          {label}
          {required && <span className="text-coral"> *</span>}
        </span>
        <input
            name={name}
            type={type}
            min={min}
            max={max}
            inputMode={type === "number" ? "numeric" : undefined}
            defaultValue={defaultValue}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            className={`w-full rounded-2xl border px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:bg-white focus:ring-2 ${
              error ? INPUT_BAD : INPUT_OK
            }`}
        />
        <FieldError message={error} />
      </label>
  );
}