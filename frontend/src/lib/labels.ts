import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  CATEGORIES,
  CONDITIONS,
  DISPUTE_REASONS,
  REPORT_REASONS,
  REVIEW_TAGS,
  SAFE_MEETING_PLACES,
} from "@/lib/constants";

/*
 * Option values (conditions, categories, reasons…) are stored and validated
 * by the backend in Russian, so the VALUE never changes — only the label shown
 * to the user is translated. Labels live in locales/*.ts as arrays in the same
 * order as the source lists in constants.ts.
 */
const SOURCES = {
  conditions: CONDITIONS as readonly string[],
  categories: Object.keys(CATEGORIES),
  subcategories: Object.values(CATEGORIES).flat(),
  disputeReasons: DISPUTE_REASONS as readonly string[],
  reportReasons: REPORT_REASONS as readonly string[],
  reviewTags: REVIEW_TAGS as readonly string[],
  places: SAFE_MEETING_PLACES as readonly string[],
};
export type OptionGroup = keyof typeof SOURCES;

export function useLabels() {
  const { t } = useTranslation();

  const option = useCallback(
    (group: OptionGroup, value?: string | null) => {
      if (!value) return "";
      const i = SOURCES[group].indexOf(value);
      if (i < 0) return value; // free text or legacy value
      const list = t(`options.${group}`, { returnObjects: true }) as unknown;
      return Array.isArray(list) && typeof list[i] === "string" ? list[i] : value;
    },
    [t],
  );

  return {
    option,
    condition: (v?: string | null) => option("conditions", v),
    category: (v?: string | null) => option("categories", v),
    subcategory: (v?: string | null) => option("subcategories", v),
    disputeReason: (v?: string | null) => option("disputeReasons", v),
    reportReason: (v?: string | null) => option("reportReasons", v),
    reviewTag: (v?: string | null) => option("reviewTags", v),
    place: (v?: string | null) => option("places", v),
    tradeStatus: (s: string) => t(`tradeStatus.${s}`, { defaultValue: s }),
    trust: (s: string) => t(`trust.${s}`, { defaultValue: s }),
  };
}

/** Locale for Intl/Date formatting that follows the interface language. */
export function dateLocale() {
  if (i18n.language === "uz") return "uz-Latn-UZ";
  if (i18n.language === "en") return "en-GB";
  return "ru-RU";
}
