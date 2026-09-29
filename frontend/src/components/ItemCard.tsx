import { mediaUrl } from "@/lib/env";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLabels } from "@/lib/labels";

export type ItemCardData = {
  id: string;
  title: string;
  condition: string;
  category: string;
  city: string;
  district?: string | null;
  wantText?: string | null;
  media: { url: string }[];
  matchScore?: number;
  matchReasons?: string[];
  owner: {
    id: string;
    name: string;
    rating: number;
    completedTrades: number;
    trustLevel: string;
  };
};

export function ItemCard({ item }: { item: ItemCardData }) {
  const { t } = useTranslation();
  const labels = useLabels();
  const trust = labels.trust(item.owner.trustLevel);

  return (
    <Link
      to={`/items/${item.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[1.4rem] bg-white shadow-[0_10px_0_rgba(23,21,31,0.06)] transition active:translate-y-0.5 active:shadow-none hover:-translate-y-0.5"
    >
      <div className="relative aspect-square shrink-0 overflow-hidden bg-lilac">
        <img
          src={mediaUrl(item.media[0]?.url) || "https://placehold.co/600x600"}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      {/* Every row has a fixed height so cards in a grid line up regardless of text length. */}
      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
        <p className="h-[2.75em] text-sm font-extrabold leading-snug text-ink line-clamp-2 sm:text-base">
          {item.title}
        </p>
        {typeof item.matchScore === "number" && (
          <p className="truncate text-[10px] leading-tight text-coral sm:text-[11px]">
            Match {item.matchScore}
            {item.matchReasons?.length
              ? ` · ${item.matchReasons.slice(0, 2).join(", ")}`
              : ""}
          </p>
        )}
        <p className="truncate text-[11px] text-ink/60 sm:text-xs">
          {labels.condition(item.condition)} · {item.city}
          {item.district ? `, ${item.district}` : ""}
        </p>
        <p className="hidden truncate text-xs text-forest/80 sm:block">
          {item.wantText ? (
            <>
              <span className="font-medium">{t("item.want")}</span> {item.wantText}
            </>
          ) : (
            " "
          )}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1 border-t border-forest/5 pt-2 text-[11px] sm:gap-2 sm:text-xs">
          <span className="truncate text-ink/70">{item.owner.name}</span>
          <span className="shrink-0 text-ink/50">
            ★ {item.owner.rating.toFixed(1)}
            <span className="hidden sm:inline"> · {trust}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
