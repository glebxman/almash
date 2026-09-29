import { randomInt } from "crypto";
import { deliverTelegram } from "./services/telegram-notify";
import { prisma } from "./db";

export async function writeAudit(params: {
  userId?: string | null;
  tradeId?: string | null;
  action: string;
  meta?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      tradeId: params.tradeId ?? null,
      action: params.action,
      metaJson: params.meta ? JSON.stringify(params.meta) : null,
    },
  });
}

export async function notify(params: {
  userId: string;
  tradeId?: string | null;
  type: string;
  title: string;
  body: string;
}) {
  const n = await prisma.notification.create({
    data: {
      userId: params.userId,
      tradeId: params.tradeId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
    },
  });
  // TZ §50: push to Telegram in the background — never slows down or fails the
  // request; the outbox loop retries transient errors.
  void deliverTelegram(n.id);
}

export function nextPublicTradeId(seq: number, year = new Date().getFullYear()) {
  return `EX-${year}-${String(seq).padStart(6, "0")}`;
}

export function randomCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) s += randomInt(10);
  return s;
}

export function randomToken(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[randomInt(chars.length)];
  return s;
}

export function calcTrustLevel(completed: number, rating: number, disputes: number) {
  if (completed >= 100 && rating >= 4.5 && disputes < 5) return "TRUSTED";
  if (completed >= 20 && rating >= 4.0) return "RELIABLE";
  if (completed >= 5) return "VERIFIED";
  return "NEW";
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function itemSnapshot(item: {
  id: string;
  title: string;
  description: string;
  condition: string;
  completeness: string | null;
  brand: string | null;
  model: string | null;
  hasDamage: boolean;
  damageNotes: string | null;
  missingParts: string | null;
  serialNumber: string | null;
  media?: { url: string; type: string; hash: string | null }[];
  // Listing details that change when the item moves to its new owner;
  // kept so an admin can hand the item back after a dispute.
  city?: string;
  district?: string | null;
  wantType?: string;
  wantText?: string | null;
  wantCategories?: string | null;
  wantBrands?: string | null;
}) {
  return JSON.stringify({
    id: item.id,
    title: item.title,
    description: item.description,
    condition: item.condition,
    completeness: item.completeness,
    brand: item.brand,
    model: item.model,
    hasDamage: item.hasDamage,
    damageNotes: item.damageNotes,
    missingParts: item.missingParts,
    serialNumber: item.serialNumber,
    media: item.media ?? [],
    city: item.city,
    district: item.district,
    wantType: item.wantType,
    wantText: item.wantText,
    wantCategories: item.wantCategories,
    wantBrands: item.wantBrands,
    frozenAt: new Date().toISOString(),
  });
}
