import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import {
  calcTrustLevel,
  itemSnapshot,
  nextPublicTradeId,
  notify,
  randomCode,
  randomToken,
  writeAudit,
} from "@/lib/utils";
import { refreshUserRisk, SIGNAL_LABELS } from "@/lib/services/risk";
import { OFFER_TTL_HOURS } from "@/lib/constants";
import { assertCanTransact, assertRateLimit } from "@/lib/services/rate-limit";

/** Deals at or above this score go to the moderators (TZ §33, §52). */
const SUSPICIOUS_TRADE_SCORE = 60;

export class TradeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function loadTradeOrThrow(id: string) {
  const trade = await prisma.trade.findFirst({
    where: { OR: [{ id }, { publicId: id }] },
    include: { parties: true, items: true },
  });
  if (!trade) throw new TradeError("Сделка не найдена", 404);
  return trade;
}

export function assertPartyAccess(
  trade: { initiatorId: string; recipientId: string },
  userId: string,
  role: string,
) {
  if (role === "ADMIN") return;
  if (trade.initiatorId !== userId && trade.recipientId !== userId) {
    throw new TradeError("Нет доступа", 403);
  }
}

export async function createOffer(params: {
  userId: string;
  targetItemIds: string[];
  offeredItemIds: string[];
  message?: string;
}) {
  await assertRateLimit(params.userId, "create_offer");
  const { risk: initiatorRisk } = await assertCanTransact(params.userId, "offer");

  const offered = await prisma.item.findMany({
    where: {
      id: { in: params.offeredItemIds },
      ownerId: params.userId,
      status: "ACTIVE",
    },
    include: { media: true },
  });
  if (offered.length !== params.offeredItemIds.length) {
    throw new TradeError("Некоторые ваши предметы недоступны");
  }

  const targets = await prisma.item.findMany({
    where: { id: { in: params.targetItemIds }, status: "ACTIVE" },
    include: { media: true },
  });
  if (targets.length !== params.targetItemIds.length) {
    throw new TradeError("Целевые предметы недоступны");
  }

  const ownerIds = [...new Set(targets.map((t) => t.ownerId))];
  if (ownerIds.length !== 1) {
    throw new TradeError(
      "Все целевые предметы должны принадлежать одному пользователю",
    );
  }
  const recipientId = ownerIds[0];
  if (recipientId === params.userId) {
    throw new TradeError("Нельзя предложить обмен самому себе");
  }

  const count = await prisma.trade.count();
  const publicId = nextPublicTradeId(count + 1);
  const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 60 * 60 * 1000);

  // TZ §33: deal risk = the riskier of the two parties
  const recipientRisk = await refreshUserRisk(recipientId);
  const riskScore = Math.max(initiatorRisk.score, recipientRisk.score);

  const trade = await prisma.trade.create({
    data: {
      publicId,
      status: "OFFER_SENT",
      initiatorId: params.userId,
      recipientId,
      expiresAt,
      riskScore,
      confirmCodeA: randomCode(),
      confirmCodeB: randomCode(),
      qrToken: randomToken(),
      parties: {
        create: [
          { userId: params.userId, side: "A" },
          { userId: recipientId, side: "B" },
        ],
      },
      items: {
        create: [
          ...offered.map((it) => ({
            itemId: it.id,
            ownerId: it.ownerId,
            side: "A",
            version: 1,
            itemSnapshot: itemSnapshot(it),
          })),
          ...targets.map((it) => ({
            itemId: it.id,
            ownerId: it.ownerId,
            side: "B",
            version: 1,
            itemSnapshot: itemSnapshot(it),
          })),
        ],
      },
      versions: {
        create: {
          version: 1,
          createdById: params.userId,
          note: "Первичное предложение",
          payloadJson: JSON.stringify({
            offeredItemIds: params.offeredItemIds,
            targetItemIds: params.targetItemIds,
          }),
        },
      },
      messages: params.message
        ? { create: { senderId: params.userId, body: params.message } }
        : undefined,
    },
  });

  await prisma.item.updateMany({
    where: { id: { in: [...params.offeredItemIds, ...params.targetItemIds] } },
    data: { status: "IN_TRADE" },
  });

  await prisma.message.create({
    data: {
      tradeId: trade.id,
      senderId: params.userId,
      body: `Создано предложение обмена ${publicId}`,
      system: true,
    },
  });

  await writeAudit({
    userId: params.userId,
    tradeId: trade.id,
    action: "OFFER_CREATED",
    meta: { publicId, riskScore },
  });
  if (riskScore >= SUSPICIOUS_TRADE_SCORE) {
    await prisma.moderationQueue.create({
      data: {
        type: "SUSPICIOUS_TRADE",
        tradeId: trade.id,
        userId: params.userId,
        score: riskScore,
        detail: [
          ...initiatorRisk.signals.map((s) => `A: ${SIGNAL_LABELS[s]}`),
          ...recipientRisk.signals.map((s) => `B: ${SIGNAL_LABELS[s]}`),
        ].join(", "),
      },
    });
  }
  await notify({
    userId: recipientId,
    tradeId: trade.id,
    type: "NEW_OFFER",
    title: "Новое предложение обмена",
    body: `Предложение ${publicId}`,
  });

  return trade;
}

export async function counterOffer(params: {
  tradeId: string;
  userId: string;
  offeredItemIds: string[];
  targetItemIds: string[];
  note?: string;
}) {
  const trade = await loadTradeOrThrow(params.tradeId);
  assertPartyAccess(trade, params.userId, "USER");

  if (!["OFFER_SENT", "NEGOTIATION", "TERMS_AGREED"].includes(trade.status)) {
    throw new TradeError("Нельзя изменить состав");
  }

  const allIds = [...params.offeredItemIds, ...params.targetItemIds];
  const items = await prisma.item.findMany({
    where: { id: { in: allIds } },
    include: { media: true },
  });
  if (items.length !== allIds.length) throw new TradeError("Предметы недоступны");

  for (const iid of params.offeredItemIds) {
    const it = items.find((i) => i.id === iid)!;
    if (it.ownerId !== trade.initiatorId) {
      throw new TradeError("Сторона A: неверные предметы");
    }
  }
  for (const iid of params.targetItemIds) {
    const it = items.find((i) => i.id === iid)!;
    if (it.ownerId !== trade.recipientId) {
      throw new TradeError("Сторона B: неверные предметы");
    }
  }

  // Newly added items must be free; items already in this trade stay allowed.
  const inThisTrade = new Set(
    trade.items
      .filter((i) => i.version === trade.currentVersion)
      .map((i) => i.itemId),
  );
  const unavailable = items.filter(
    (it) => !inThisTrade.has(it.id) && it.status !== "ACTIVE",
  );
  if (unavailable.length) {
    throw new TradeError(
      `Предметы недоступны для обмена: ${unavailable.map((i) => i.title).join(", ")}`,
    );
  }

  const newVersion = trade.currentVersion + 1;
  const oldItems = trade.items.filter((i) => i.version === trade.currentVersion);
  const release = oldItems
    .map((i) => i.itemId)
    .filter((oid) => !allIds.includes(oid));

  if (release.length) {
    await prisma.item.updateMany({
      where: { id: { in: release }, status: "IN_TRADE" },
      data: { status: "ACTIVE" },
    });
  }
  await prisma.item.updateMany({
    where: { id: { in: allIds } },
    data: { status: "IN_TRADE" },
  });

  await prisma.tradeItem.createMany({
    data: [
      ...params.offeredItemIds.map((itemId) => {
        const it = items.find((i) => i.id === itemId)!;
        return {
          tradeId: trade.id,
          itemId,
          ownerId: it.ownerId,
          side: "A",
          version: newVersion,
          itemSnapshot: itemSnapshot(it),
        };
      }),
      ...params.targetItemIds.map((itemId) => {
        const it = items.find((i) => i.id === itemId)!;
        return {
          tradeId: trade.id,
          itemId,
          ownerId: it.ownerId,
          side: "B",
          version: newVersion,
          itemSnapshot: itemSnapshot(it),
        };
      }),
    ],
  });

  await prisma.tradeVersion.create({
    data: {
      tradeId: trade.id,
      version: newVersion,
      createdById: params.userId,
      note: params.note || "Изменение состава",
      payloadJson: JSON.stringify({
        offeredItemIds: params.offeredItemIds,
        targetItemIds: params.targetItemIds,
      }),
    },
  });

  await prisma.tradeParty.updateMany({
    where: { tradeId: trade.id },
    data: { confirmedTerms: false, viewedItemsAck: false },
  });

  await prisma.trade.update({
    where: { id: trade.id },
    data: {
      currentVersion: newVersion,
      status: "NEGOTIATION",
      termsLockedAt: null,
    },
  });

  await prisma.message.create({
    data: {
      tradeId: trade.id,
      senderId: params.userId,
      body: `Состав обмена изменён (версия ${newVersion}). Требуется повторное подтверждение условий.`,
      system: true,
    },
  });
  await writeAudit({
    userId: params.userId,
    tradeId: trade.id,
    action: "TRADE_COMPOSITION_CHANGED",
    meta: { version: newVersion },
  });

  return newVersion;
}

export async function confirmHandoff(params: {
  tradeId: string;
  userId: string;
  side: "A" | "B";
  code?: string;
  qrToken?: string;
}) {
  const trade = await loadTradeOrThrow(params.tradeId);

  if (
    ![
      "TERMS_AGREED",
      "MEETING_SCHEDULED",
      "HANDOFF_PENDING",
      "PARTY_A_CONFIRMED",
      "PARTY_B_CONFIRMED",
    ].includes(trade.status)
  ) {
    throw new TradeError("Подтверждение недоступно");
  }

  const side = params.side;
  if (side === "A" && trade.partyAConfirmedAt) {
    throw new TradeError("Вы уже подтвердили");
  }
  if (side === "B" && trade.partyBConfirmedAt) {
    throw new TradeError("Вы уже подтвердили");
  }

  // You confirm with the OTHER party's one-time code: typed in, or scanned from
  // the QR on their screen (payload "SWAPTOY:<publicId>:<code>"). Your own
  // screen never holds a token that could confirm your side on its own.
  const expectedCode = side === "A" ? trade.confirmCodeB : trade.confirmCodeA;
  const codeFieldUsed = side === "A" ? trade.codeBUsedAt : trade.codeAUsedAt;

  let submitted = params.code?.trim();
  let via: "code" | "qr" = "code";
  if (params.qrToken) {
    const m = /^SWAPTOY:([^:]+):(\d+)$/.exec(params.qrToken.trim());
    if (!m || m[1] !== trade.publicId) {
      throw new TradeError("Этот QR не относится к данной сделке");
    }
    submitted = m[2];
    via = "qr";
  }
  if (!submitted) throw new TradeError("Введите код или отсканируйте QR");
  if (codeFieldUsed) throw new TradeError("Этот код уже был использован");

  // Throttle guessing of the 4-digit code
  await assertRateLimit(params.userId, "handoff_code");
  if (!expectedCode || !safeEqual(submitted, expectedCode)) {
    await writeAudit({
      userId: params.userId,
      tradeId: trade.id,
      action: "HANDOFF_CODE_INVALID",
      meta: { side, via },
    });
    throw new TradeError("Неверный код или QR сделки");
  }

  const now = new Date();
  const data: Record<string, unknown> = {};

  if (side === "A") data.codeBUsedAt = now;
  else data.codeAUsedAt = now;
  if (via === "qr") data.qrUsedAt = now;

  if (side === "A") data.partyAConfirmedAt = now;
  else data.partyBConfirmedAt = now;

  const otherConfirmed =
    side === "A" ? !!trade.partyBConfirmedAt : !!trade.partyAConfirmedAt;

  data.status = otherConfirmed
    ? "COMPLETED"
    : side === "A"
      ? "PARTY_A_CONFIRMED"
      : "PARTY_B_CONFIRMED";

  await prisma.trade.update({ where: { id: trade.id }, data });
  await writeAudit({
    userId: params.userId,
    tradeId: trade.id,
    action: "HANDOFF_CONFIRMED",
    meta: { side, via },
  });
  await prisma.message.create({
    data: {
      tradeId: trade.id,
      senderId: params.userId,
      body: `Участник ${side} подтвердил получение предметов.`,
      system: true,
    },
  });

  if (otherConfirmed) {
    await completeTrade(trade.id);
  } else {
    // TZ §17: the other side must confirm too — tell them right away
    await notify({
      userId: side === "A" ? trade.recipientId : trade.initiatorId,
      tradeId: trade.id,
      type: "HANDOFF_CONFIRMED",
      title: "Партнёр подтвердил получение",
      body: `${trade.publicId}: подтвердите и вы — обмен завершится после подтверждения обеих сторон.`,
    });
  }

  return loadTradeOrThrow(trade.id);
}

export async function completeTrade(tradeId: string) {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { items: true, parties: true },
  });
  if (!trade) return;

  const current = trade.items.filter((i) => i.version === trade.currentVersion);
  const currentIds = current.map((i) => i.itemId);

  // Each item moves to the other party. It lands in their profile as
  // RECEIVED (not public) with their location and no "want" wishes of the
  // previous owner; they can publish it later to trade it on.
  const owners = await prisma.user.findMany({
    where: { id: { in: [trade.initiatorId, trade.recipientId] } },
    select: { id: true, city: true, district: true },
  });
  for (const ti of current) {
    const newOwner = owners.find(
      (u) => u.id === (ti.ownerId === trade.initiatorId ? trade.recipientId : trade.initiatorId),
    );
    if (!newOwner) continue;
    await prisma.item.update({
      where: { id: ti.itemId },
      data: {
        ownerId: newOwner.id,
        status: "RECEIVED",
        city: newOwner.city,
        district: newOwner.district,
        wantType: "ANY",
        wantText: null,
        wantCategories: null,
        wantBrands: null,
      },
    });
  }
  // Likes on / offers of these items belonged to the old listing and owner;
  // left in place they could produce matches for the wrong person.
  await prisma.swipe.deleteMany({
    where: { OR: [{ itemId: { in: currentIds } }, { offeredItemId: { in: currentIds } }] },
  });

  for (const p of trade.parties) {
    const u = await prisma.user.update({
      where: { id: p.userId },
      data: { completedTrades: { increment: 1 } },
    });
    const trustLevel = calcTrustLevel(
      u.completedTrades,
      u.rating,
      u.disputesCount,
    );
    await prisma.user.update({
      where: { id: p.userId },
      data: { trustLevel },
    });
    await notify({
      userId: p.userId,
      tradeId,
      type: "TRADE_COMPLETED",
      title: "Обмен завершён",
      body: `${trade.publicId} успешно завершён. Полученные игрушки уже в вашем профиле — оставьте отзыв.`,
    });
  }

  await prisma.message.create({
    data: {
      tradeId,
      senderId: trade.initiatorId,
      body: "Обмен подтверждён обеими сторонами. Сделка завершена.",
      system: true,
    },
  });
  await writeAudit({ tradeId, action: "TRADE_COMPLETED" });
}

export async function cancelTrade(params: {
  tradeId: string;
  userId: string;
  reason: string;
  status?: string;
}) {
  const trade = await prisma.trade.findUnique({
    where: { id: params.tradeId },
    include: { items: true },
  });
  if (!trade) return;

  const currentIds = trade.items
      .filter((i) => i.version === trade.currentVersion)
      .map((i) => i.itemId);

  await prisma.trade.update({
    where: { id: params.tradeId },
    data: {
      status: params.status || "CANCELLED",
      cancelledById: params.userId,
      cancelReason: params.reason,
    },
  });

  if (currentIds.length) {
    await prisma.item.updateMany({
      where: { id: { in: currentIds }, status: "IN_TRADE" },
      data: { status: "ACTIVE" },
    });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { cancelledTrades: { increment: 1 } },
  });

  await prisma.message.create({
    data: {
      tradeId: params.tradeId,
      senderId: params.userId,
      body: `Сделка отменена: ${params.reason}`,
      system: true,
    },
  });
  await writeAudit({
    userId: params.userId,
    tradeId: params.tradeId,
    action: "TRADE_CANCELLED",
    meta: { reason: params.reason },
  });

  const otherId =
      params.userId === trade.initiatorId ? trade.recipientId : trade.initiatorId;
  await notify({
    userId: otherId,
    tradeId: params.tradeId,
    type: "TRADE_CANCELLED",
    title: "Сделка отменена",
    body: `${trade.publicId}: ${params.reason}`,
  });
}