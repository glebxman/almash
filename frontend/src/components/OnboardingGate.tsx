import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { ToyMascot } from "@/components/ToyMascot";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

type Tip = { title: string; body: string };
const TIP_COUNT = 3;

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (user && user.onboardingDone === false) setShow(true);
    else setShow(false);
  }, [user]);

  if (!show || !user) return <>{children}</>;

  const tips = t("onboarding.tips", { returnObjects: true }) as Tip[];
  const tip = tips[step] ?? tips[0];

  async function finish() {
    // Close right away; a failed save must not trap the user in the sheet
    // (it will simply show again on the next visit).
    setShow(false);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ onboardingDone: true }),
      });
      await refresh();
    } catch (e) {
      console.warn("onboarding: could not save progress", e);
    }
  }

  return (
    <>
      {children}
      {/* Phone: edge-to-edge bottom sheet (no side/bottom gaps). sm+: centred card. */}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 pt-[var(--app-inset-top)] sm:items-center sm:p-4">
        <div className="max-h-full w-full max-w-md animate-bouncein overflow-y-auto overscroll-contain rounded-t-[2rem] bg-cream px-5 pt-5 pb-[max(1.25rem,var(--app-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-6 sm:pb-6">
          <ToyMascot className="mx-auto w-24" mood={step === TIP_COUNT - 1 ? "yay" : "wave"} />
          <p className="text-center text-xs font-extrabold uppercase tracking-wide text-forest">
            {t("onboarding.welcome", { step: step + 1, total: TIP_COUNT })}
          </p>
          <h2 className="mt-2 text-center font-display text-2xl text-ink sm:text-3xl">{tip.title}</h2>
          <p className="mt-2 text-center text-sm font-semibold text-ink/70">{tip.body}</p>
          <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row">
            {step < TIP_COUNT - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full py-3 text-sm font-extrabold btn-3d btn-3d-violet"
              >
                {t("onboarding.next")}
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full py-3 text-sm font-extrabold btn-3d btn-3d-lime"
              >
                {t("onboarding.start")}
              </button>
            )}
            <Link
              to="/items/new"
              onClick={finish}
              className="btn-3d btn-3d-white inline-flex min-h-11 items-center justify-center rounded-full px-4 py-3 text-sm font-bold"
            >
              {t("onboarding.addToy")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
