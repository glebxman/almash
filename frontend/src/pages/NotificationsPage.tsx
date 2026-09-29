import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { Link, useNavigate } from "react-router-dom";
import { CheckCheck, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dateLocale } from "@/lib/labels";

type N = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  tradeId?: string | null;
  createdAt: string;
  type: string;
};

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [items, setItems] = useState<N[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  async function load() {
    const d = await api<{ notifications: N[] }>("/api/notifications");
    setItems(d.notifications);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-forest">{t("pages.notifications.title")}</h1>
        <button
            type="button"
            className="btn-3d btn-3d-soft btn-3d-sm inline-flex items-center justify-center gap-1.5 rounded-full p-2.5 text-sm font-bold sm:px-4 sm:py-2"
            onClick={async () => {
              await api("/api/notifications", {
                method: "POST",
                body: JSON.stringify({}),
              });
              await load();
            }}
            aria-label={t("pages.notifications.markAll")}
        >
          <CheckCheck className="h-4 w-4 sm:hidden" strokeWidth={2} />
          <span className="hidden sm:inline">{t("pages.notifications.markAll")}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white/60 p-8 text-center text-ink/60">
          {t("pages.notifications.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={
                n.read
                  ? "rounded-2xl bg-white/50 p-4 text-sm ring-1 ring-forest/5"
                  : "rounded-2xl bg-white p-4 text-sm ring-1 ring-forest/20"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-ink/65">{n.body}</p>
                  <p className="mt-1 text-[10px] text-ink/40">
                    {new Date(n.createdAt).toLocaleString(dateLocale())} · {n.type}
                  </p>
                </div>
                {n.tradeId && (
                  <Link
                    to={`/trades/${n.tradeId}`}
                    className="btn-3d btn-3d-violet btn-3d-sm inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full pl-3.5 pr-2.5 text-xs font-bold"
                  >
                    {t("pages.notifications.open")}
                    <ChevronRight size={14} strokeWidth={2.8} />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
