import { useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { useTranslation } from "react-i18next";
import { dateLocale, useLabels } from "@/lib/labels";

type Version = {
  version: number;
  note?: string | null;
  createdAt: string;
  items: {
    side: string;
    title: string;
    snapshot: {
      title?: string;
      condition?: string;
      description?: string;
      media?: { url: string }[];
      frozenAt?: string;
    } | null;
  }[];
};

export function SnapshotTimeline({ tradeId }: { tradeId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const { t } = useTranslation();
  const labels = useLabels();

  useEffect(() => {
    if (!open) return;
    api<{ versions: Version[] }>(`/api/trades/${tradeId}/versions`)
      .then((d) => setVersions(d.versions))
      .catch((e) => setError(e.message));
  }, [open, tradeId]);

  return (
    <section className="overflow-hidden rounded-3xl bg-white/70 ring-1 ring-forest/10">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("snapshots.hide") : t("snapshots.show")}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-forest/[0.04]"
      >
        <span className="btn-3d btn-3d-violet btn-3d-sm pointer-events-none grid h-9 w-9 shrink-0 place-items-center rounded-xl">
          <History size={18} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-ink">{t("snapshots.title")}</span>
          <span className="block truncate text-xs font-semibold text-ink/45">{t("snapshots.hint")}</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-forest/10 px-3 pb-3 pt-2.5">
          {error && <p className="px-1 text-sm text-coral">{error}</p>}
          {versions.map((v) => (
            <div key={v.version} className="rounded-2xl bg-cream/60 p-2.5">
              <p className="flex flex-wrap items-center gap-x-1.5 px-1 pb-2 text-xs">
                <span className="rounded-full bg-forest px-2 py-0.5 font-extrabold text-white">
                  {t("snapshots.version", { n: v.version })}
                </span>
                {v.note && <span className="font-semibold text-ink/70">{v.note}</span>}
                <span className="text-ink/40">{new Date(v.createdAt).toLocaleString(dateLocale())}</span>
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {v.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 rounded-xl bg-white p-2 text-sm">
                    {it.snapshot?.media?.[0]?.url ? (
                      <img
                        src={mediaUrl(it.snapshot.media[0].url)}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-lg bg-mist" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">
                        <span className="text-ink/45">{it.side}:</span> {it.snapshot?.title || it.title}
                      </p>
                      <p className="truncate text-[11px] text-ink/45">
                        {it.snapshot?.condition && labels.condition(it.snapshot.condition)}
                        {it.snapshot?.condition && it.snapshot?.frozenAt && " · "}
                        {it.snapshot?.frozenAt &&
                          `${t("snapshots.frozen")} ${new Date(it.snapshot.frozenAt).toLocaleString(dateLocale())}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {versions.length === 0 && !error && (
            <p className="px-1 text-sm text-ink/50">{t("pages.loading")}</p>
          )}
        </div>
      )}
    </section>
  );
}
