import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Flag, X } from "lucide-react";
import { api } from "@/lib/client";
import { FancySelect } from "@/components/FancySelect";
import { REPORT_REASONS } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

type Props = {
  targetUserId?: string;
  itemId?: string;
  tradeId?: string;
};

/** The button may sit inside a <Link> (item page owner card): keep clicks here. */
const swallow = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export function ReportButton({ targetUserId, itemId, tradeId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();
  const labels = useLabels();
  const [sentOpen, setSentOpen] = useState(false);

  // While open: lock the page behind the sheet, close on Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          reason,
          description,
          targetUserId,
          itemId,
          tradeId,
        }),
      });
      setDone(true);
      setOpen(false);
      setSentOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  // "Sent" confirmation: centred card that closes by itself (or on tap)
  useEffect(() => {
    if (!sentOpen) return;
    const timer = window.setTimeout(() => setSentOpen(false), 1800);
    return () => window.clearTimeout(timer);
  }, [sentOpen]);

  const sentModal =
    sentOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-6 backdrop-blur-[2px]"
        onClick={(e) => {
          swallow(e);
          setSentOpen(false);
        }}
      >
        <div
          role="status"
          className="flex w-full max-w-[17rem] animate-bouncein flex-col items-center gap-3 rounded-[1.75rem] bg-white px-6 py-7 text-center shadow-2xl"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-forest/15 text-forest">
            <CheckCircle2 size={36} strokeWidth={2.2} />
          </span>
          <p className="text-base font-extrabold leading-snug text-ink">{t("report.sent")}</p>
        </div>
      </div>,
      document.body,
    );

  if (done) {
    return (
      <>
        <p className="text-xs text-forest">{t("report.sent")}</p>
        {sentModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          swallow(e);
          setOpen(true);
        }}
        className="btn-3d btn-3d-coral btn-3d-sm inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold"
      >
        <Flag size={14} strokeWidth={2.6} />
        {t("report.button")}
      </button>

      {open &&
        // Portal: a transformed ancestor would misplace a fixed overlay, and an
        // absolutely positioned panel slid off-screen next to a left-aligned button.
        createPortal(
          <div
            className="fixed inset-0 z-[55] flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={(e) => {
              swallow(e);
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("report.button")}
              className="flex max-h-[calc(100dvh-var(--app-inset-top))] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[90dvh] sm:max-w-md sm:rounded-3xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-coral/15 px-5 py-4">
                <h3 className="font-display text-lg text-coral">{t("report.button")}</h3>
                <button
                  type="button"
                  aria-label={t("report.cancel")}
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,var(--app-inset-bottom))]">
                <FancySelect
                  value={reason}
                  onChange={(v) => setReason(v as typeof reason)}
                  options={REPORT_REASONS.map((r) => ({ value: r, label: labels.reportReason(r) }))}
                  triggerClassName="border-forest/15 bg-white hover:border-forest/30 focus:ring-forest/30"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("report.placeholder")}
                  className="w-full rounded-2xl border border-forest/15 p-3 text-sm outline-none focus:ring-2 focus:ring-coral/20"
                  rows={4}
                />
                {error && <p className="text-sm text-coral">{error}</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="btn-3d btn-3d-coral min-h-12 w-full rounded-2xl py-3 text-sm font-bold"
                >
                  {t("report.submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-3d btn-3d-soft btn-3d-sm min-h-11 w-full rounded-2xl py-2.5 text-sm font-bold"
                >
                  {t("report.cancel")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
