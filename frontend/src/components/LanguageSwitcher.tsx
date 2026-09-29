import type { ReactElement } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type Language } from "@/lib/i18n";


function FlagRU({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <rect width="20" height="6.67" fill="#FFFFFF" />
      <rect y="6.67" width="20" height="6.67" fill="#0039A6" />
      <rect y="13.33" width="20" height="6.67" fill="#D52B1E" />
    </svg>
  );
}

function FlagUZ({ className = "" }: { className?: string }) {
  const stars = [
    [11, 2], [12.6, 2], [14.2, 2],
    [9.4, 3.6], [11, 3.6], [12.6, 3.6], [14.2, 3.6],
    [11, 5.2], [12.6, 5.2], [14.2, 5.2],
  ];
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <rect width="20" height="20" fill="#FFFFFF" />
      <rect width="20" height="6.6" fill="#0099B5" />
      <rect y="13.4" width="20" height="6.6" fill="#1EB53A" />
      <rect y="6.6" width="20" height="0.35" fill="#CE1126" />
      <rect y="13.05" width="20" height="0.35" fill="#CE1126" />
      {/* crescent */}
      <circle cx="6.4" cy="3.6" r="2" fill="#FFFFFF" />
      <circle cx="7.1" cy="3.6" r="1.7" fill="#0099B5" />
      {stars.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.42" fill="#FFFFFF" />
      ))}
    </svg>
  );
}

function FlagGB({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <clipPath id="flag-gb-t">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-gb-t)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

const FLAGS: Record<Language, (p: { className?: string }) => ReactElement> = {
  ru: FlagRU,
  uz: FlagUZ,
  en: FlagGB,
};

function RoundFlag({ code, className = "h-5 w-5" }: { code: Language; className?: string }) {
  const Flag = FLAGS[code];
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 ${className}`}>
      <Flag className="block h-full w-full" />
    </span>
  );
}

function useLanguage() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language) as Language;
  const select = (code: Language) => void i18n.changeLanguage(code);
  return { t, current, select };
}

/**
 * Segmented language control: round flag + language name.
 * `tone="dark"` for coloured backgrounds, "light" otherwise.
 */
export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t, current, select } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t("lang.label")}
      className={`inline-flex items-center gap-1 rounded-full p-1 ${
        tone === "dark" ? "bg-white/15 ring-1 ring-white/20" : "bg-forest/10"
      }`}
    >
      {LANGUAGES.map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(`lang.${code}`)}
            title={t(`lang.${code}`)}
            onClick={() => select(code)}
            className={`flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition active:scale-95 ${
              active
                ? "bg-white text-ink shadow-sm"
                : tone === "dark"
                  ? "text-cream/80 hover:bg-white/10 hover:text-cream"
                  : "text-ink/60 hover:bg-white/60 hover:text-ink"
            }`}
          >
            <RoundFlag code={code} />
            <span>{t(`lang.${code}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Telegram-style settings list: one row per language, check on the active one. */
export function LanguageList() {
  const { t, current, select } = useLanguage();

  return (
    <div role="radiogroup" aria-label={t("lang.label")} className="divide-y divide-ink/[0.06]">
      {LANGUAGES.map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(code)}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-ink/[0.04]"
          >
            <RoundFlag code={code} className="h-8 w-8" />
            <span className="flex-1 text-[15px] font-semibold text-ink">{t(`lang.${code}`)}</span>
            {active && <Check size={20} strokeWidth={2.6} className="shrink-0 text-forest" />}
          </button>
        );
      })}
    </div>
  );
}
