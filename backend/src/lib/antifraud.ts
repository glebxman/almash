/** Content scanning for money talk / contact leaks — Cyrillic-aware. */

type Pattern = {
  reason: string;
  re: RegExp;
  /** Soft reasons alone don't block unless combined with money signals. */
  soft?: boolean;
};

// JS `\b` only understands ASCII word chars, so Cyrillic/Uzbek words use an
// explicit "no letter before" look-behind instead.
const L = "a-zа-яёўқғҳʻʼ'";
const W = (body: string) => new RegExp(`(?<![${L}])(?:${body})`, "iu");
const Q = "['ʻʼ‘]?"; // Uzbek o‘/g‘ apostrophe variants

const MONEY_PATTERNS: Pattern[] = [
  {
    reason: "сумма",
    re: /\d{1,3}([  .,]?\d{3})*\s*(сум|сўм|so['ʻʼ‘]?m|руб|usd|eur|\$|₽|тыс|минг|ming)/iu,
  },
  { reason: "валюта", re: W("доллар|евро|рубл|dollar|yevro") },
  { reason: "карта", re: /(?<!\d)\d{4}([\s-]?\d{4}){3}(?!\d)/ },
  { reason: "доплата", re: W(`допла[тч]|qo${Q}shimcha\\s+pul|ustiga\\s+pul`) },
  {
    reason: "перевод денег",
    re: W(
      `перевед[иьу]|перекин|скинь\\s+деньг|отправь\\s+деньг|кинь\\s+деньг|pul\\s+(?:o${Q}tkaz|tashla|yubor)|o${Q}tkazib\\s+ber`,
    ),
  },
  {
    reason: "продажа",
    re: W("прода[мюеё]|продаж|куплю|покупа|цен[аыуе]|стоимост|sotaman|sotib\\s+ol|sotuv|narx"),
  },
  { reason: "оплата", re: W(`оплат|заплат|плат[её]ж|to${Q}lov|to${Q}la`) },
  { reason: "деньги", re: W("деньг|денеж|pul(?![a-z])") },
  {
    reason: "платёжная система",
    re: /(click\.uz|payme|uzum\s*bank|paypal|qiwi|crypto|bitcoin|usdt|trc20|humo|uzcard)/iu,
  },
  {
    reason: "кошелёк",
    re: /(кошел[её]к|wallet|hamyon|(?<![a-z0-9])(?:T[1-9A-HJ-NP-Za-km-z]{33}|0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,39})(?![a-z0-9]))/iu,
  },
];

export const MONEY_REASONS = new Set(MONEY_PATTERNS.map((p) => p.reason));

const CONTACT_PATTERNS: Pattern[] = [
  { reason: "телефон", re: /(\+?998[\s-]?)?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/ },
  { reason: "telegram", re: /(@[a-zA-Z][a-zA-Z0-9_]{3,}|t\.me\/\w+)/i },
  { reason: "WhatsApp", re: /(whatsapp|ватсап|вацап)/iu },
];

export type ContentFlag = {
  blocked: boolean;
  reasons: string[];
  message: string;
  severity: "none" | "soft" | "hard";
};

export function scanContent(
  text: string,
  opts: { allowContacts?: boolean } = {},
): ContentFlag {
  const reasons: string[] = [];
  let hard = false;

  for (const p of MONEY_PATTERNS) {
    // Reset lastIndex for safety
    p.re.lastIndex = 0;
    if (p.re.test(text)) {
      reasons.push(p.reason);
      if (!p.soft) hard = true;
    }
  }

  if (!opts.allowContacts) {
    for (const p of CONTACT_PATTERNS) {
      p.re.lastIndex = 0;
      if (p.re.test(text)) {
        reasons.push(p.reason);
        hard = true;
      }
    }
  }

  const unique = [...new Set(reasons)];
  if (unique.length === 0) {
    return { blocked: false, reasons: [], message: "", severity: "none" };
  }

  const moneyHit = unique.some((r) => MONEY_REASONS.has(r));

  return {
    blocked: hard,
    reasons: unique,
    severity: hard ? "hard" : "soft",
    message: moneyHit
      ? "Внутри платформы запрещены денежные расчёты."
      : "Обмен контактами до подтверждения сделки ограничен.",
  };
}

/** TZ §33 risk signals. */
export type RiskSignals = {
  isNewAccount?: boolean;
  manyListings?: boolean;
  moneyTalk?: boolean;
  externalContact?: boolean;
  manyCancels?: boolean;
  manyDisputes?: boolean;
  duplicatePhotos?: boolean;
  duplicateDescriptions?: boolean;
  manyReports?: boolean;
  noShows?: boolean;
  burstActivity?: boolean;
};

export function computeRiskScore(signals: RiskSignals): number {
  let score = 0;
  if (signals.isNewAccount) score += 15;
  if (signals.manyListings) score += 10;
  if (signals.moneyTalk) score += 40;
  if (signals.externalContact) score += 25;
  if (signals.manyCancels) score += 20;
  if (signals.manyDisputes) score += 25;
  if (signals.duplicatePhotos) score += 35;
  if (signals.duplicateDescriptions) score += 30;
  if (signals.manyReports) score += 25;
  if (signals.noShows) score += 15;
  if (signals.burstActivity) score += 15;
  return Math.min(100, score);
}

/** Pure helpers exported for unit tests — trade status transitions. */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["OFFER_SENT", "CANCELLED"],
  OFFER_SENT: ["NEGOTIATION", "CANCELLED", "EXPIRED"],
  NEGOTIATION: ["TERMS_AGREED", "CANCELLED", "EXPIRED"],
  // Meeting step is optional: parties agree time/place in chat and can hand off right away.
  TERMS_AGREED: [
    "MEETING_SCHEDULED",
    "HANDOFF_PENDING",
    "PARTY_A_CONFIRMED",
    "PARTY_B_CONFIRMED",
    "NEGOTIATION",
    "CANCELLED",
    "EXPIRED",
    "DISPUTED",
  ],
  MEETING_SCHEDULED: ["HANDOFF_PENDING", "PARTY_A_CONFIRMED", "PARTY_B_CONFIRMED", "CANCELLED", "DISPUTED"],
  HANDOFF_PENDING: ["PARTY_A_CONFIRMED", "PARTY_B_CONFIRMED", "CANCELLED", "DISPUTED"],
  PARTY_A_CONFIRMED: ["COMPLETED", "DISPUTED", "CANCELLED"],
  PARTY_B_CONFIRMED: ["COMPLETED", "DISPUTED", "CANCELLED"],
  COMPLETED: ["DISPUTED"],
  DISPUTED: ["NEGOTIATION", "CANCELLED", "COMPLETED"],
  CANCELLED: [],
  BLOCKED: [],
  EXPIRED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}
