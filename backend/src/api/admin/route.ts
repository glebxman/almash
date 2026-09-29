import type { AppRequest } from "@/lib/http";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { notify, writeAudit } from "@/lib/utils";
import {
  collectUserSignals,
  refreshUserRisk,
  SIGNAL_LABELS,
} from "@/lib/services/risk";

export async function GET(req: AppRequest) {
  try {
    await requireAdmin();
    const tab = new URL(req.url).searchParams.get("tab") || "overview";

    if (tab === "overview") {
      const [users, items, trades, disputes, reports, riskEvents] = await Promise.all([
        prisma.user.count(),
        prisma.item.count(),
        prisma.trade.count(),
        prisma.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
        prisma.report.count({ where: { status: "OPEN" } }),
        prisma.riskEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return jsonOk({ overview: { users, items, trades, openDisputes: disputes, openReports: reports, riskEvents } });
    }

    if (tab === "users") {
      // Explicit select: never ship passwordHash, device fingerprint, IP or telegramId to the browser.
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          city: true,
          role: true,
          status: true,
          trustLevel: true,
          rating: true,
          completedTrades: true,
          warningCount: true,
          riskScoreCached: true,
          createdAt: true,
        },
      });
      return jsonOk({ users });
    }

    if (tab === "items") {
      const items = await prisma.item.findMany({
        where: { status: { in: ["PENDING_MODERATION", "ACTIVE", "BLOCKED"] } },
        include: {
          owner: { select: { id: true, name: true, username: true } },
          media: { take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return jsonOk({ items });
    }

    if (tab === "trades") {
      const trades = await prisma.trade.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          parties: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      return jsonOk({ trades });
    }

    if (tab === "disputes") {
      const disputes = await prisma.dispute.findMany({
        include: {
          // not `trade: true` — that would leak both parties' handoff codes and QR token
          trade: { select: { id: true, publicId: true, status: true } },
          openedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return jsonOk({ disputes });
    }

    if (tab === "reports") {
      const reports = await prisma.report.findMany({
        include: {
          reporter: { select: { id: true, name: true } },
          targetUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return jsonOk({ reports });
    }

    // TZ §52 «Антифрод»: suspicious accounts & deals, mass actions,
    // repeated photos/descriptions, sale attempts.
    if (tab === "antifraud") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        riskyUsersRaw,
        riskyTrades,
        duplicates,
        saleAttempts,
        itemsByOwner,
        offersByUser,
      ] = await Promise.all([
        prisma.user.findMany({
          where: { riskScoreCached: { gte: 30 } },
          orderBy: { riskScoreCached: "desc" },
          take: 30,
          select: {
            id: true,
            name: true,
            username: true,
            status: true,
            riskScoreCached: true,
            warningCount: true,
            createdAt: true,
          },
        }),
        prisma.trade.findMany({
          where: { riskScore: { gte: 40 } },
          orderBy: { riskScore: "desc" },
          take: 30,
          include: {
            parties: { include: { user: { select: { id: true, name: true } } } },
          },
        }),
        prisma.moderationQueue.findMany({
          where: {
            type: { in: ["DUPLICATE_PHOTO", "DUPLICATE_DESCRIPTION"] },
            status: "OPEN",
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.riskEvent.findMany({
          where: { type: { in: ["MONEY_IN_LISTING", "CHAT_VIOLATION"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { id: true, name: true } } },
        }),
        prisma.item.groupBy({
          by: ["ownerId"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.trade.groupBy({
          by: ["initiatorId"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
      ]);

      const riskyUsers = [];
      for (const u of riskyUsersRaw) {
        const signals = await collectUserSignals(u.id);
        riskyUsers.push({
          ...u,
          signals: (Object.keys(signals) as (keyof typeof signals)[])
            .filter((k) => signals[k])
            .map((k) => SIGNAL_LABELS[k]),
        });
      }

      const massRaw = [
        ...itemsByOwner
          .filter((g) => g._count._all >= 5)
          .map((g) => ({ userId: g.ownerId, kind: "объявлений за 24ч", count: g._count._all })),
        ...offersByUser
          .filter((g) => g._count._all >= 5)
          .map((g) => ({ userId: g.initiatorId, kind: "предложений за 24ч", count: g._count._all })),
      ];
      const names = await prisma.user.findMany({
        where: { id: { in: massRaw.map((m) => m.userId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(names.map((n) => [n.id, n.name]));

      return jsonOk({
        antifraud: {
          riskyUsers,
          riskyTrades,
          duplicates,
          saleAttempts,
          massActions: massRaw.map((m) => ({ ...m, name: nameById.get(m.userId) || "—" })),
        },
      });
    }

    if (tab === "forbidden") {
      const categories = await prisma.forbiddenCategory.findMany({
        orderBy: { name: "asc" },
      });
      return jsonOk({ categories });
    }

    if (tab === "moderation") {
      const queue = await prisma.moderationQueue.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return jsonOk({ queue });
    }

    return jsonError("Unknown tab", 400);
  } catch (e) {
    return handleApiError(e);
  }
}

const DISPUTE_RESOLUTION_LABELS: Record<string, string> = {
  RESOLVED_A: "в пользу участника A",
  RESOLVED_B: "в пользу участника B",
  RETURNED: "сделка возвращена в переговоры",
  CLOSED: "закрыт без санкций",
};

/** TZ §42: 1 warning → WARNED, 2–3 → LIMITED, more → BLOCKED. */
async function applySanctions(userId: string, warnings: number, status: string) {
  if (status === "BLOCKED") return;
  const next = warnings >= 4 ? "BLOCKED" : warnings >= 2 ? "LIMITED" : "WARNED";
  if (next !== status) {
    await prisma.user.update({ where: { id: userId }, data: { status: next } });
  }
}

async function cancelTradeByAdmin(
  trade: {
    id: string;
    publicId: string;
    initiatorId: string;
    recipientId: string;
    currentVersion: number;
    items: { itemId: string; version: number }[];
  },
  adminId: string,
  reason: string,
  status = "CANCELLED",
) {
  const ids = trade.items
    .filter((i) => i.version === trade.currentVersion)
    .map((i) => i.itemId);
  await prisma.trade.update({
    where: { id: trade.id },
    data: { status, cancelReason: reason, cancelledById: adminId },
  });
  await prisma.item.updateMany({
    where: { id: { in: ids }, status: "IN_TRADE" },
    data: { status: "ACTIVE" },
  });
  await prisma.message.create({
    data: {
      tradeId: trade.id,
      senderId: adminId,
      body: `Сделка отменена администратором: ${reason}`,
      system: true,
    },
  });
  await writeAudit({
    userId: adminId,
    tradeId: trade.id,
    action: "ADMIN_CANCEL_TRADE",
    meta: { reason, status },
  });
  for (const uid of [trade.initiatorId, trade.recipientId]) {
    await notify({
      userId: uid,
      tradeId: trade.id,
      type: "TRADE_CANCELLED",
      title: "Сделка отменена администратором",
      body: `${trade.publicId}: ${reason}`,
    });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block_user"),
    userId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("warn_user"),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("unblock_user"),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("clear_risk"),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("moderate_item"),
    itemId: z.string(),
    decision: z.enum(["APPROVE", "BLOCK", "DELETE"]),
  }),
  z.object({
    action: z.literal("resolve_dispute"),
    disputeId: z.string(),
    resolution: z.enum(["RESOLVED_A", "RESOLVED_B", "RETURNED", "CLOSED"]),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("review_report"),
    reportId: z.string(),
    status: z.enum(["REVIEWED", "ACTION_TAKEN", "DISMISSED"]),
  }),
  z.object({
    action: z.literal("review_moderation"),
    queueId: z.string(),
    status: z.enum(["REVIEWED", "DISMISSED"]),
  }),
  z.object({
    action: z.literal("add_forbidden"),
    name: z.string().trim().min(2).max(60),
  }),
  z.object({
    action: z.literal("toggle_forbidden"),
    id: z.string(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("delete_forbidden"),
    id: z.string(),
  }),
  z.object({
    action: z.literal("cancel_trade"),
    tradeId: z.string(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("run_jobs"),
  }),
]);

export async function POST(req: AppRequest) {
  try {
    const admin = await requireAdmin();
    const body = actionSchema.parse(await req.json());

    switch (body.action) {
      case "block_user": {
        await prisma.user.update({
          where: { id: body.userId },
          data: { status: "BLOCKED" },
        });
        // A blocked user's open deals and listings must not stay live
        const openTrades = await prisma.trade.findMany({
          where: {
            OR: [{ initiatorId: body.userId }, { recipientId: body.userId }],
            status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED", "DISPUTED", "BLOCKED"] },
          },
          include: { items: true },
        });
        for (const t of openTrades) {
          await cancelTradeByAdmin(t, admin.id, "Участник заблокирован", "BLOCKED");
        }
        await prisma.item.updateMany({
          where: { ownerId: body.userId, status: { in: ["ACTIVE", "PENDING_MODERATION"] } },
          data: { status: "HIDDEN" },
        });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_BLOCK_USER",
          meta: { userId: body.userId, reason: body.reason },
        });
        break;
      }
      // TZ §33: moderator reviewed a high-risk account and allows it again
      case "clear_risk": {
        await prisma.user.update({
          where: { id: body.userId },
          data: { riskClearedAt: new Date() },
        });
        await prisma.moderationQueue.updateMany({
          where: { userId: body.userId, type: "HIGH_RISK_USER", status: "OPEN" },
          data: { status: "REVIEWED", reviewedAt: new Date(), reviewedBy: admin.id },
        });
        await refreshUserRisk(body.userId);
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_CLEAR_RISK",
          meta: { userId: body.userId },
        });
        break;
      }
      // TZ §42: temporary blocks / restrictions can be lifted by the admin
      case "unblock_user": {
        await prisma.user.update({
          where: { id: body.userId },
          data: { status: "ACTIVE", riskClearedAt: new Date() },
        });
        await refreshUserRisk(body.userId);
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_UNBLOCK_USER",
          meta: { userId: body.userId },
        });
        break;
      }
      case "warn_user": {
        const warned = await prisma.user.update({
          where: { id: body.userId },
          data: { warningCount: { increment: 1 } },
        });
        await applySanctions(warned.id, warned.warningCount, warned.status);
        await notify({
          userId: warned.id,
          type: "WARNING",
          title: "Предупреждение от администратора",
          body: "Повторные нарушения приведут к ограничению аккаунта.",
        });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_WARN_USER",
          meta: { userId: body.userId },
        });
        break;
      }
      case "moderate_item": {
        const status =
          body.decision === "APPROVE"
            ? "ACTIVE"
            : body.decision === "BLOCK"
              ? "BLOCKED"
              : "HIDDEN";
        await prisma.item.update({
          where: { id: body.itemId },
          data: { status },
        });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_MODERATE_ITEM",
          meta: { itemId: body.itemId, decision: body.decision },
        });
        break;
      }
      case "resolve_dispute": {
        const existing = await prisma.dispute.findUnique({
          where: { id: body.disputeId },
          include: { trade: { include: { items: true } } },
        });
        if (!existing) return jsonError("Спор не найден", 404);
        if (!["OPEN", "IN_REVIEW"].includes(existing.status)) {
          return jsonError("Спор уже закрыт", 400);
        }
        const trade = existing.trade;
        const currentIds = trade.items
          .filter((i) => i.version === trade.currentVersion)
          .map((i) => i.itemId);

        await prisma.dispute.update({
          where: { id: existing.id },
          data: {
            status: body.resolution,
            resolution: body.note,
            resolvedById: admin.id,
          },
        });

        if (body.resolution === "RETURNED") {
          // Back to negotiation: every confirmation has to be redone
          await prisma.trade.update({
            where: { id: trade.id },
            data: {
              status: "NEGOTIATION",
              termsLockedAt: null,
              partyAConfirmedAt: null,
              partyBConfirmedAt: null,
              codeAUsedAt: null,
              codeBUsedAt: null,
              qrUsedAt: null,
            },
          });
          await prisma.tradeParty.updateMany({
            where: { tradeId: trade.id },
            data: { confirmedTerms: false, viewedItemsAck: false },
          });
          // A completed trade already moved each item to the other party:
          // hand it back to its original owner with the frozen listing data.
          for (const ti of trade.items.filter((i) => i.version === trade.currentVersion)) {
            let snap: Record<string, unknown> = {};
            try {
              snap = ti.itemSnapshot ? JSON.parse(ti.itemSnapshot) : {};
            } catch {
              snap = {};
            }
            const str = (v: unknown) => (typeof v === "string" ? v : null);
            const original = await prisma.user.findUnique({
              where: { id: ti.ownerId },
              select: { city: true, district: true },
            });
            await prisma.item.updateMany({
              where: { id: ti.itemId, ownerId: { not: ti.ownerId } },
              data: {
                ownerId: ti.ownerId,
                city: str(snap.city) ?? original?.city ?? "",
                district: str(snap.district) ?? original?.district ?? null,
                wantType: str(snap.wantType) ?? "ANY",
                wantText: str(snap.wantText),
                wantCategories: str(snap.wantCategories),
                wantBrands: str(snap.wantBrands),
              },
            });
          }
          await prisma.item.updateMany({
            where: { id: { in: currentIds }, status: { in: ["ACTIVE", "TRADED", "RECEIVED"] } },
            data: { status: "IN_TRADE" },
          });
        } else {
          // RESOLVED_A / RESOLVED_B / CLOSED end the trade. If both sides had
          // confirmed the handoff the exchange physically happened.
          const handedOver = !!(trade.partyAConfirmedAt && trade.partyBConfirmedAt);
          await prisma.trade.update({
            where: { id: trade.id },
            data: handedOver
              ? { status: "COMPLETED" }
              : { status: "CANCELLED", cancelReason: `Спор: ${body.resolution}` },
          });
          if (!handedOver) {
            await prisma.item.updateMany({
              where: { id: { in: currentIds }, status: "IN_TRADE" },
              data: { status: "ACTIVE" },
            });
          }
        }

        if (body.resolution === "RESOLVED_A" || body.resolution === "RESOLVED_B") {
          const winnerId =
            body.resolution === "RESOLVED_A" ? trade.initiatorId : trade.recipientId;
          const loserId =
            winnerId === trade.initiatorId ? trade.recipientId : trade.initiatorId;
          await prisma.user.update({
            where: { id: winnerId },
            data: { disputesWon: { increment: 1 } },
          });
          const loser = await prisma.user.update({
            where: { id: loserId },
            data: {
              disputesLost: { increment: 1 },
              warningCount: { increment: 1 },
            },
          });
          await applySanctions(loser.id, loser.warningCount, loser.status);
          await refreshUserRisk(loser.id);
        }

        for (const uid of [trade.initiatorId, trade.recipientId]) {
          await notify({
            userId: uid,
            tradeId: trade.id,
            type: "DISPUTE_STATUS",
            title: "Статус спора изменён",
            body: `${trade.publicId}: ${DISPUTE_RESOLUTION_LABELS[body.resolution]}${
              body.note ? ` — ${body.note}` : ""
            }`,
          });
        }
        await prisma.message.create({
          data: {
            tradeId: trade.id,
            senderId: admin.id,
            body: `Администратор закрыл спор: ${DISPUTE_RESOLUTION_LABELS[body.resolution]}`,
            system: true,
          },
        });
        await writeAudit({
          userId: admin.id,
          tradeId: trade.id,
          action: "ADMIN_RESOLVE_DISPUTE",
          meta: { resolution: body.resolution, note: body.note },
        });
        break;
      }
      // TZ §34: the forbidden list is configured from the admin panel
      case "add_forbidden": {
        const exists = await prisma.forbiddenCategory.findFirst({
          where: { name: body.name },
        });
        if (exists) return jsonError("Такая категория уже есть", 400);
        await prisma.forbiddenCategory.create({ data: { name: body.name } });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_FORBIDDEN_ADD",
          meta: { name: body.name },
        });
        break;
      }
      case "toggle_forbidden": {
        await prisma.forbiddenCategory.update({
          where: { id: body.id },
          data: { enabled: body.enabled },
        });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_FORBIDDEN_TOGGLE",
          meta: { id: body.id, enabled: body.enabled },
        });
        break;
      }
      case "delete_forbidden": {
        const removed = await prisma.forbiddenCategory.delete({ where: { id: body.id } });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_FORBIDDEN_DELETE",
          meta: { name: removed.name },
        });
        break;
      }
      case "cancel_trade": {
        const trade = await prisma.trade.findUnique({
          where: { id: body.tradeId },
          include: { items: true },
        });
        if (!trade) return jsonError("Сделка не найдена", 404);
        if (["COMPLETED", "CANCELLED"].includes(trade.status)) {
          return jsonError("Сделку нельзя отменить", 400);
        }
        await cancelTradeByAdmin(trade, admin.id, body.reason);
        break;
      }
      case "review_report": {
        await prisma.report.update({
          where: { id: body.reportId },
          data: { status: body.status },
        });
        break;
      }
      case "review_moderation": {
        await prisma.moderationQueue.update({
          where: { id: body.queueId },
          data: {
            status: body.status,
            reviewedAt: new Date(),
            reviewedBy: admin.id,
          },
        });
        await writeAudit({
          userId: admin.id,
          action: "ADMIN_REVIEW_MODERATION",
          meta: { queueId: body.queueId, status: body.status },
        });
        break;
      }
      case "run_jobs": {
        const { runMaintenanceJobs } = await import("@/lib/jobs/maintenance");
        const result = await runMaintenanceJobs();
        await writeAudit({
          userId: admin.id,
          action: "JOBS_RUN",
          meta: result,
        });
        break;
      }
    }

    return jsonOk({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
