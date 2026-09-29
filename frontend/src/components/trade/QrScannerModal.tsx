import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Smartphone, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onScan: (qrToken: string) => void;
};

function isMobileOrTelegram() {
  if (typeof window === "undefined") return false;

  // telegram-web-app.js creates window.Telegram.WebApp in any browser, so only
  // trust it when we are really inside Telegram (initData is set) and then
  // look at the platform: Telegram Desktop / Web can't scan with a camera.
  const tg = (
      window as typeof window & {
        Telegram?: { WebApp?: { initData?: string; platform?: string } };
      }
  ).Telegram?.WebApp;
  if (tg?.initData) {
    return ["ios", "android", "android_x"].includes(tg.platform ?? "");
  }

  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile/i.test(
      ua,
  );

  // Дополнительно проверяем touch + узкий экран, чтобы отсечь десктоп в responsive-режиме DevTools
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return isMobileUA && isTouch;
}

/** html5-qrcode reports raw English errors — show something a user can act on. */
function cameraErrorMessage(err: unknown): string {
  const text = String((err as { name?: string })?.name ?? "") + " " + String(err);
  if (/NotAllowed|Permission|denied/i.test(text)) {
    return i18n.t("qr.errNotAllowed");
  }
  if (/NotFound|DevicesNotFound|Requested device not found/i.test(text)) {
    return i18n.t("qr.errNotFound");
  }
  if (/NotReadable|TrackStart|Could not start/i.test(text)) {
    return i18n.t("qr.errBusy");
  }
  if (/secure|https|insecure/i.test(text)) {
    return i18n.t("qr.errHttps");
  }
  return i18n.t("qr.errGeneric");
}

export function QrScannerModal({ isOpen, onClose, onScan }: Props) {
  const [error, setError] = useState("");
  const elementId = "qr-reader-container";
  const [allowed] = useState(() => isMobileOrTelegram());

  const [attempt, setAttempt] = useState(0);
  const { t } = useTranslation();

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    if (!isOpen || !allowed) return;
    setError("");

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = document.getElementById(elementId);
      if (!el) return;

      try {
        scanner = new Html5Qrcode(elementId);
      } catch {
        setError(i18n.t("qr.errInit"));
        return;
      }

      const config = {
        fps: 10,
        // scan area = 70% of the camera view, whatever the phone size
        qrbox: (w: number, h: number) => {
          const size = Math.max(150, Math.floor(Math.min(w, h) * 0.7));
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
      };

      scanner
          .start(
              { facingMode: "environment" },
              config,
              (decodedText) => {
                if (cancelled) return;
                cancelled = true;
                scanner
                    ?.stop()
                    .then(() => scanner?.clear())
                    .catch(() => {})
                    .finally(() => {
                      onScanRef.current(decodedText);
                    });
              },
              () => {
                // ignore scan frames without QR
              },
          )
          .catch((err) => {
            if (cancelled) return;
            setError(cameraErrorMessage(err));
          });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (scanner) {
        try {
          if (scanner.isScanning) {
            scanner
                .stop()
                .then(() => scanner?.clear())
                .catch(() => {});
          } else {
            scanner.clear();
          }
        } catch {
          // сканер уже мог быть очищен — игнорируем
        }
      }
    };
  }, [isOpen, allowed, attempt]);

  // While open: lock page scroll behind the sheet, close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Portal to <body>: an ancestor with a CSS transform (page animations) would
  // otherwise turn "fixed" into "relative to that ancestor" and misplace it.
  return createPortal(
      <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
      >
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("qr.title")}
            className="relative flex max-h-[calc(100dvh-var(--app-inset-top))] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[90dvh] sm:max-w-sm sm:rounded-3xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-forest/10 bg-gradient-to-r from-forest to-forest/90 px-5 py-4">
            <div className="flex items-center gap-2.5 text-cream">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              {allowed ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                    <path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
              ) : (
                  <Smartphone size={18} />
              )}
            </span>
              <div>
                <h3 className="font-display text-base leading-tight">
                  {t("qr.title")}
                </h3>
                <p className="text-[11px] text-cream/70">{t("qr.subtitle")}</p>
              </div>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label={t("qr.close")}
                className="grid h-10 w-10 place-items-center rounded-full text-cream/80 transition hover:bg-white/15 hover:text-white active:scale-95"
            >
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,var(--app-inset-bottom))]">
            {!allowed ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest/10 text-forest">
                <Smartphone size={26} />
              </span>
                  <p className="text-sm font-medium text-ink">
                    {t("qr.phoneOnly")}
                  </p>
                  <p className="text-xs text-ink/50">
                    {t("qr.phoneOnlyHint")}
                  </p>
                </div>
            ) : (
                <>
                  <p className="mb-3 text-center text-xs text-ink/60">
                    {t("qr.aim")}
                  </p>

                  {error ? (
                      <div className="my-2 flex flex-col items-center gap-3 rounded-2xl bg-coral/10 p-4 text-center text-xs text-coral">
                        <span className="font-semibold">{error}</span>
                        <span className="text-ink/55">
                          {t("qr.useCode")}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                              setError("");
                              setAttempt((n) => n + 1);
                            }}
                            className="btn-3d btn-3d-coral btn-3d-sm rounded-xl px-4 py-2 text-xs font-bold"
                        >
                          {t("qr.retry")}
                        </button>
                      </div>
                  ) : (
                      <div className="relative mx-auto aspect-square w-full max-w-[min(100%,340px,52dvh)] overflow-hidden rounded-3xl bg-black ring-4 ring-forest/10">
                        <div id={elementId} className="qr-reader h-full w-full" />

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="relative h-[70%] w-[70%]">
                            <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-xl border-l-[3px] border-t-[3px] border-sand" />
                            <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-xl border-r-[3px] border-t-[3px] border-sand" />
                            <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-xl border-b-[3px] border-l-[3px] border-sand" />
                            <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-xl border-b-[3px] border-r-[3px] border-sand" />
                            <span className="absolute inset-x-0 top-0 h-0.5 animate-[scan_2.2s_ease-in-out_infinite] bg-sand shadow-[0_0_8px_2px_rgba(196,224,64,0.6)]" />
                          </div>
                        </div>
                      </div>
                  )}

                  <p className="mt-4 text-center text-[11px] text-ink/40">
                    {t("qr.fit")}
                  </p>
                </>
            )}

            <button
                type="button"
                onClick={onClose}
                className="btn-3d btn-3d-soft mt-4 min-h-12 w-full rounded-2xl py-3 text-sm font-bold"
            >
              {t("qr.cancel")}
            </button>
          </div>
        </div>

        <style>{`
        @keyframes scan {
          0% { top: 4%; opacity: 0.4; }
          50% { top: 92%; opacity: 1; }
          100% { top: 4%; opacity: 0.4; }
        }
        /* html5-qrcode injects its own video/canvas sizes — make them fill the square */
        .qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover;
        }
        .qr-reader #qr-shaded-region { border-color: transparent !important; }
        /* the library draws its own white corner marks — we have ours */
        .qr-reader #qr-shaded-region > div { display: none !important; }
      `}</style>
      </div>,
      document.body,
  );
}