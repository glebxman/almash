import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  /** Red confirm button for destructive actions (default true). */
  danger?: boolean;
};

type FeedbackApi = {
  /** In-app replacement for window.confirm: one sheet, resolves true/false. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second call while one is open answers the first with "no" — never two sheets.
        setDialog((prev) => {
          prev?.resolve(false);
          return { ...options, resolve };
        });
      }),
    [],
  );

  const api = useRef<FeedbackApi>({ confirm }).current;

  const close = (ok: boolean) => {
    dialog?.resolve(ok);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {dialog && createPortal(<ConfirmSheet {...dialog} onClose={close} />, document.body)}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

function ConfirmSheet({
  title,
  message,
  confirmText,
  danger = true,
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 pt-[var(--app-inset-top)] backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={() => onClose(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-bouncein rounded-t-[1.75rem] bg-white px-5 pt-5 pb-[max(1.25rem,var(--app-inset-bottom))] shadow-2xl sm:rounded-[1.75rem] sm:pb-5"
      >
        <h2 id="confirm-title" className="text-center text-lg font-extrabold text-ink">
          {title}
        </h2>
        {message && <p className="mt-1.5 text-center text-sm text-ink/60">{message}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="btn-3d btn-3d-soft min-h-12 rounded-2xl text-sm font-bold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onClose(true)}
            className={`btn-3d min-h-12 rounded-2xl text-sm font-extrabold ${
              danger ? "btn-3d-coral" : "btn-3d-violet"
            }`}
          >
            {confirmText ?? t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
