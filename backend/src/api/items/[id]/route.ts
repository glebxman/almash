import type { AppRequest } from "@/lib/http";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { parseJsonArray, writeAudit } from "@/lib/utils";
import { MONEY_REASONS, scanContent } from "@/lib/antifraud";
import { CONDITIONS } from "@/lib/constants";
import { findForbiddenCategory } from "@/lib/services/risk";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: AppRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            rating: true,
            ratingCount: true,
            completedTrades: true,
            trustLevel: true,
            city: true,
            district: true,
            createdAt: true,
          },
        },
      },
    });
    if (!item || item.status === "BLOCKED") return jsonError("Не найдено", 404);

    const session = await getSessionUser();
    let favorited = false;
    if (session) {
      const fav = await prisma.favorite.findUnique({
        where: { userId_itemId: { userId: session.id, itemId: id } },
      });
      favorited = !!fav;
    }

    // Evidence freeze: for non-owners in active trades, prefer snapshot if present
    let evidence = null;
    if (item.snapshotJson) {
      try {
        evidence = JSON.parse(item.snapshotJson);
      } catch {
        evidence = null;
      }
    }

    return jsonOk({
      item: {
        ...item,
        wantCategories: parseJsonArray(item.wantCategories),
        wantBrands: parseJsonArray(item.wantBrands),
        tags: parseJsonArray(item.tags),
        favorited,
        frozenEvidence: evidence,
        editable:
          !!session &&
          session.id === item.ownerId &&
          !["IN_TRADE", "TRADED"].includes(item.status),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(4000).optional(),
  wantText: z.string().optional(),
  condition: z.enum(CONDITIONS as unknown as [string, ...string[]]).optional(),
  // A toy received in a trade starts private; this lists it in the catalog.
  publish: z.literal(true).optional(),
});

export async function PATCH(req: AppRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return jsonError("Не найдено", 404);
    if (item.ownerId !== user.id && user.role !== "ADMIN") {
      return jsonError("Нет доступа", 403);
    }
    if (["IN_TRADE", "TRADED"].includes(item.status)) {
      return jsonError(
        "Нельзя менять описание/фото после начала сделки — доказательства зафиксированы",
        400,
      );
    }

    const { publish, ...body } = patchSchema.parse(await req.json());
    if (publish && item.status !== "RECEIVED") {
      return jsonError("Опубликовать можно только полученную в обмене игрушку", 400);
    }

    // Same money/contact filter as on creation — otherwise a clean listing
    // could be edited into "продам за 100 000 сум" afterwards.
    const text = [body.title, body.description, body.wantText]
      .filter(Boolean)
      .join("\n");
    const flag = scanContent(text);
    if (flag.blocked) {
      if (flag.reasons.some((r) => MONEY_REASONS.has(r))) {
        await prisma.riskEvent.create({
          data: {
            userId: user.id,
            type: "MONEY_IN_LISTING",
            score: 40,
            detail: `edit ${id}: ${flag.reasons.join(", ")}`,
          },
        });
        await prisma.moderationQueue.create({
          data: {
            type: "MONEY_LISTING",
            userId: user.id,
            itemId: id,
            detail: flag.reasons.join(", "),
            score: 40,
          },
        });
      }
      return jsonError(flag.message, 400, { reasons: flag.reasons });
    }
    const forbiddenHit = await findForbiddenCategory(text);
    if (forbiddenHit) {
      return jsonError(`Категория запрещена: ${forbiddenHit}`, 400);
    }
    const updated = await prisma.item.update({
      where: { id },
      data: publish ? { ...body, status: "ACTIVE" } : body,
    });
    await writeAudit({
      userId: user.id,
      action: publish ? "ITEM_PUBLISHED" : "ITEM_UPDATED",
      meta: { itemId: id, fields: Object.keys(body) },
    });
    return jsonOk({ item: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: AppRequest, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return jsonError("Не найдено", 404);
    if (item.ownerId !== user.id && user.role !== "ADMIN") {
      return jsonError("Нет доступа", 403);
    }
    if (item.status === "IN_TRADE") {
      return jsonError("Предмет участвует в сделке", 400);
    }
    await prisma.item.update({ where: { id }, data: { status: "HIDDEN" } });
    await writeAudit({
      userId: user.id,
      action: "ITEM_HIDDEN",
      meta: { itemId: id },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
