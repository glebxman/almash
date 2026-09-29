import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "@/locales/ru";
import uz from "@/locales/uz";
import en from "@/locales/en";

export const LANGUAGES = ["ru", "uz", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "ru";

const STORAGE_KEY = "swaptoy_lang";

function savedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (LANGUAGES as readonly string[]).includes(v)) return v as Language;
  } catch {
    // storage may be blocked (private mode, Telegram webview) — use default
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
    en: { translation: en },
  },
  // Default is Russian regardless of the browser language; the user's
  // choice from the profile is remembered in localStorage.
  lng: savedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore — the choice just won't survive a reload
  }
});

export default i18n;
