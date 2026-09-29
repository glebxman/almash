import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

type Match = {
  type: "DIRECT" | "CHAIN";
  score: number;
  reason: string;
  myItem?: { id: string; title: string };
  theirItem: {
    id: string;
    title: string;
    city: string;
    media: { url: string }[];
    owner: { id: string; name: string; rating: number; trustLevel: string };
  };
  chain?: { viaUserId: string; viaItemTitle: string }[];
};

type Mutual = {
  theirItem: {
    id: string;
    title: string;
    city: string;
    media: { url: string }[];
    owner: { id: string; name: string; avatarUrl: string | null; city: string };
  };
  myItem: { id: string; title: string; media: { url: string }[] };
};

export default function MatchesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [mutual, setMutual] = useState<Mutual[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    api<{ matches: Match[] }>("/api/matches").then((d) => setMatches(d.matches));
    api<{ mutualMatches: Mutual[] }>("/api/swipe/deck").then((d) =>
      setMutual(d.mutualMatches || []),
    );
  }, [user]);

  async function startFromMutual(m: Mutual) {
    setBusyId(m.theirItem.id);
    try {
      const d = await api<{ trade: { id: string } }>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          targetItemIds: [m.theirItem.id],
          offeredItemIds: [m.myItem.id],
          message: t("matches.swipeMessage"),
        }),
      });
      navigate(`/trades/${d.trade.id}`);
    } catch {
      setBusyId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-8 animate-rise">
      <div>
        <h1 className="font-display text-4xl text-ink">{t("matches.title")}</h1>
        <p className="text-ink/60">
          {t("matches.subtitle")}{" "}
          <Link to="/" className="text-coral underline-offset-2 hover:underline">
            {t("matches.keepSwiping")}
          </Link>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-forest">{t("matches.mutualTitle")}</h2>
        {mutual.length === 0 ? (
          <p className="rounded-2xl bg-white/60 p-6 text-center text-sm text-ink/60">
            {t("matches.mutualEmpty")}
          </p>
        ) : (
          <div className="space-y-3">
            {mutual.map((m) => (
              <div
                key={`${m.theirItem.id}-${m.myItem.id}`}
                className="flex flex-col gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-coral/20 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
              >
                <div className="flex gap-2">
                  <img
                    src={mediaUrl(m.myItem.media[0]?.url) || "https://placehold.co/80"}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  <span className="self-center text-coral">⇄</span>
                  <img
                    src={mediaUrl(m.theirItem.media[0]?.url) || "https://placehold.co/80"}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-coral">{t("matches.itsMatch")}</p>
                  <p className="font-medium">
                    {m.myItem.title} ⇄ {m.theirItem.title}
                  </p>
                  <p className="text-sm text-ink/60">
                    {t("matches.with", { name: m.theirItem.owner.name, city: m.theirItem.city })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === m.theirItem.id}
                  onClick={() => startFromMutual(m)}
                  className="btn-3d btn-3d-coral inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-bold sm:w-auto"
                >
                  {t("matches.start")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-forest">{t("matches.hintsTitle")}</h2>
        {matches.length === 0 ? (
          <p className="rounded-2xl bg-white/60 p-6 text-center text-sm text-ink/60">
            {t("matches.hintsEmpty")}
          </p>
        ) : (
          <div className="space-y-3">
            {matches.map((m, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-forest/10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:p-4"
              >
                <img
                  src={mediaUrl(m.theirItem.media[0]?.url) || "https://placehold.co/80"}
                  alt=""
                  className="h-20 w-full rounded-xl object-cover sm:h-16 sm:w-16"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-coral">
                    {m.type === "DIRECT" ? t("matches.direct") : t("matches.chain")} · score{" "}
                    {m.score}
                  </p>
                  <p className="font-medium">{m.reason}</p>
                  <p className="text-sm text-ink/60">
                    {m.myItem ? `${m.myItem.title} ⇄ ` : ""}
                    {m.theirItem.title} · {m.theirItem.owner.name} ·{" "}
                    {m.theirItem.city}
                  </p>
                  {m.chain && (
                    <p className="text-xs text-ink/45">
                      {t("matches.via", { path: m.chain.map((c) => c.viaItemTitle).join(" → ") })}
                    </p>
                  )}
                </div>
                <Link
                  to={`/items/${m.theirItem.id}`}
                  className="btn-3d btn-3d-violet inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-bold sm:w-auto"
                >
                  {t("matches.open")}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
