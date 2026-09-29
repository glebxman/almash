import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { Link, useNavigate } from "react-router-dom";
import { mediaUrl } from "@/lib/env";
import { isVideoUrl } from "@/lib/media";
import { useTranslation } from "react-i18next";
import { dateLocale, useLabels } from "@/lib/labels";
import { ExternalLink, Loader2, Play } from "lucide-react";

function parseEvidence(json?: string | null): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

const TABS = ["overview", "users", "items", "trades", "disputes", "reports", "moderation", "antifraud", "forbidden"];

/* Shared mobile-first building blocks: full-width cards, wrapping touch-size buttons. */
const card = "space-y-2.5 rounded-2xl bg-white p-3.5 text-sm shadow-sm ring-1 ring-forest/5";
const actions = "flex flex-wrap gap-2";
const btnBase =
  "btn-3d btn-3d-sm inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold sm:flex-none";
const btn = {
  neutral: `${btnBase} btn-3d-soft`,
  danger: `${btnBase} btn-3d-coral`,
  primary: `${btnBase} btn-3d-violet`,
};

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" | "ok" }) {
  const cls =
    tone === "danger" ? "bg-coral/15 text-coral" : tone === "ok" ? "bg-forest/10 text-forest" : "bg-ink/[0.06] text-ink/60";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

function statusTone(status: string): "neutral" | "danger" | "ok" {
  if (["BLOCKED", "LIMITED", "WARNED", "PENDING_MODERATION", "OPEN"].includes(status)) return "danger";
  if (["ACTIVE", "COMPLETED", "REVIEWED", "RESOLVED"].includes(status)) return "ok";
  return "neutral";
}

function Empty() {
  const { t } = useTranslation();
  return <p className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm font-semibold text-ink/45">{t("admin.noData")}</p>;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [newForbidden, setNewForbidden] = useState("");
  const { t } = useTranslation();
  const labels = useLabels();

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    setError("");
    setData({});
    setFetching(true);
    api<Record<string, unknown>>(`/api/admin?tab=${tab}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")))
      .finally(() => setFetching(false));
  }, [user, tab]);

  if (!user || user.role !== "ADMIN") return null;

  async function run(payload: Record<string, unknown>) {
    setError("");
    try {
      await api("/api/admin", { method: "POST", body: JSON.stringify(payload) });
      const d = await api<Record<string, unknown>>(`/api/admin?tab=${tab}`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const list = <T,>(key: string) => (Array.isArray(data[key]) ? (data[key] as T[]) : null);

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate font-display text-2xl text-ink sm:text-3xl">{t("admin.title")}</h1>
        <button
          type="button"
          className="btn-3d btn-3d-violet btn-3d-sm inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold"
          onClick={() => run({ action: "run_jobs" })}
        >
          <Play size={14} />
          <span className="hidden min-[380px]:inline">{t("admin.runJobs")}</span>
        </button>
      </div>

      {/* One scrollable row of tabs instead of a wrapped block */}
      <div className="-mx-3 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5 rounded-2xl bg-white p-1 shadow-sm">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`min-h-9 shrink-0 rounded-xl px-3.5 text-sm font-bold transition ${
                tab === tb ? "bg-ink text-cream" : "text-ink/55 hover:bg-ink/[0.04]"
              }`}
            >
              {t(`admin.tabs.${tb}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}

      {fetching && (
        <div className="grid place-items-center py-12">
          <Loader2 size={26} className="animate-spin text-forest" />
        </div>
      )}

      {tab === "overview" && data.overview != null && <OverviewView data={data.overview as OverviewData} />}

      {tab === "users" &&
        (() => {
          const users = list<{ id: string; name: string; status: string; username: string }>("users");
          if (!users) return null;
          if (users.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className={card}>
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/users/${u.id}`} className="min-w-0">
                      <p className="truncate font-bold text-ink">{u.name}</p>
                      <p className="truncate text-xs text-ink/50">@{u.username}</p>
                    </Link>
                    <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                  </div>
                  <div className={actions}>
                    <button type="button" className={btn.neutral} onClick={() => run({ action: "warn_user", userId: u.id })}>
                      {t("admin.warn")}
                    </button>
                    <button
                      type="button"
                      className={btn.danger}
                      onClick={() => run({ action: "block_user", userId: u.id, reason: "admin" })}
                    >
                      {t("admin.block")}
                    </button>
                    {u.status !== "ACTIVE" && (
                      <button type="button" className={btn.primary} onClick={() => run({ action: "unblock_user", userId: u.id })}>
                        {t("admin.unblock")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      {tab === "items" &&
        (() => {
          const items = list<{
            id: string;
            title: string;
            status: string;
            owner: { name: string };
            media?: { url: string }[];
          }>("items");
          if (!items) return null;
          if (items.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className={card}>
                  <div className="flex items-start gap-3">
                    <Link to={`/items/${it.id}`} className="shrink-0">
                      <img
                        src={mediaUrl(it.media?.[0]?.url) || "https://placehold.co/56x56"}
                        alt=""
                        className="h-14 w-14 rounded-xl object-cover"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/items/${it.id}`} className="line-clamp-2 font-bold text-ink hover:underline">
                        {it.title}
                      </Link>
                      <p className="truncate text-xs text-ink/50">{it.owner.name}</p>
                    </div>
                    <Badge tone={statusTone(it.status)}>{it.status}</Badge>
                  </div>
                  <div className={actions}>
                    <button
                      type="button"
                      className={btn.primary}
                      onClick={() => run({ action: "moderate_item", itemId: it.id, decision: "APPROVE" })}
                    >
                      {t("admin.approve")}
                    </button>
                    <button
                      type="button"
                      className={btn.danger}
                      onClick={() => run({ action: "moderate_item", itemId: it.id, decision: "BLOCK" })}
                    >
                      {t("admin.block")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      {tab === "disputes" &&
        (() => {
          const disputes = list<{
            id: string;
            reason: string;
            status: string;
            description: string;
            evidenceJson?: string | null;
            trade: { id: string; publicId: string };
            openedBy: { name: string };
          }>("disputes");
          if (!disputes) return null;
          if (disputes.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {disputes.map((d) => {
                const evidence = parseEvidence(d.evidenceJson);
                return (
                  <div key={d.id} className={card}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/trades/${d.trade.id}`} className="break-all font-bold text-forest hover:underline">
                          {d.trade.publicId}
                        </Link>
                        <p className="text-xs text-ink/60">
                          {labels.disputeReason(d.reason)} · {d.openedBy.name}
                        </p>
                      </div>
                      <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs text-ink/70">{d.description}</p>
                    {evidence.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {evidence.map((url) => (
                          <a key={url} href={mediaUrl(url)} target="_blank" rel="noreferrer">
                            {isVideoUrl(url) ? (
                              <video src={mediaUrl(url)} muted className="h-16 w-16 rounded-lg bg-black object-cover" />
                            ) : (
                              <img src={mediaUrl(url)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {(["RESOLVED_A", "RESOLVED_B", "RETURNED", "CLOSED"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={btn.neutral}
                          onClick={() => run({ action: "resolve_dispute", disputeId: d.id, resolution: r, note: r })}
                        >
                          {t(`admin.resolution.${r}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {tab === "antifraud" && data.antifraud != null && (
        <AntifraudView
          data={data.antifraud as AntifraudData}
          onClearRisk={(userId) => run({ action: "clear_risk", userId })}
        />
      )}

      {tab === "forbidden" &&
        (() => {
          const categories = list<{ id: string; name: string; enabled: boolean }>("categories");
          if (!categories) return null;
          return (
            <div className="space-y-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newForbidden.trim();
                  if (name.length < 2) return;
                  run({ action: "add_forbidden", name }).then(() => setNewForbidden(""));
                }}
              >
                <input
                  value={newForbidden}
                  onChange={(e) => setNewForbidden(e.target.value)}
                  placeholder={t("admin.forbiddenPlaceholder")}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-forest/15 bg-white px-3 text-sm outline-none focus:border-forest/40"
                />
                <button type="submit" className="btn-3d btn-3d-violet btn-3d-sm min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold">
                  {t("admin.add")}
                </button>
              </form>
              {categories.length === 0 && <Empty />}
              {categories.map((c) => (
                <div key={c.id} className={`${card} flex items-center justify-between gap-2 space-y-0`}>
                  <span className={`min-w-0 break-words font-semibold ${c.enabled ? "" : "text-ink/40 line-through"}`}>
                    {c.name}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={btn.neutral}
                      onClick={() => run({ action: "toggle_forbidden", id: c.id, enabled: !c.enabled })}
                    >
                      {c.enabled ? t("admin.disable") : t("admin.enable")}
                    </button>
                    <button
                      type="button"
                      className={btn.danger}
                      onClick={() => {
                        if (window.confirm(t("admin.confirmDelete", { name: c.name }))) {
                          run({ action: "delete_forbidden", id: c.id });
                        }
                      }}
                    >
                      {t("admin.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      {tab === "trades" &&
        (() => {
          const trades = list<{
            id: string;
            publicId: string;
            status: string;
            updatedAt: string;
            parties: { side: string; user: { id: string; name: string } }[];
          }>("trades");
          if (!trades) return null;
          if (trades.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {trades.map((tr) => {
                const partyA = tr.parties.find((p) => p.side === "A")?.user?.name || "A";
                const partyB = tr.parties.find((p) => p.side === "B")?.user?.name || "B";
                return (
                  <div key={tr.id} className={card}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all font-bold text-forest">{tr.publicId}</p>
                        <p className="truncate text-xs text-ink/70">
                          {partyA} ⇄ {partyB}
                        </p>
                      </div>
                      <Badge>{labels.tradeStatus(tr.status)}</Badge>
                    </div>
                    <p className="text-[11px] text-ink/45">{new Date(tr.updatedAt).toLocaleString(dateLocale())}</p>
                    <div className={actions}>
                      <Link to={`/trades/${tr.id}`} className={btn.primary}>
                        <ExternalLink size={13} />
                        {t("admin.open")}
                      </Link>
                      {!["COMPLETED", "CANCELLED"].includes(tr.status) && (
                        <button
                          type="button"
                          className={btn.danger}
                          onClick={() => {
                            const reason = window.prompt(t("admin.cancelReason"));
                            if (reason && reason.trim().length >= 3) {
                              run({ action: "cancel_trade", tradeId: tr.id, reason: reason.trim() });
                            }
                          }}
                        >
                          {t("admin.cancel")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {tab === "reports" &&
        (() => {
          const reports = list<{
            id: string;
            reason: string;
            description: string | null;
            status: string;
            createdAt: string;
            reporter: { id: string; name: string };
            targetUser: { id: string; name: string } | null;
          }>("reports");
          if (!reports) return null;
          if (reports.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className={card}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-coral">{labels.reportReason(r.reason)}</p>
                      <p className="text-xs text-ink/60">
                        {t("admin.reportFrom", { name: r.reporter.name })}{" "}
                        {r.targetUser ? t("admin.reportOn", { name: r.targetUser.name }) : ""}
                      </p>
                    </div>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </div>
                  {r.description && <p className="break-words text-xs text-ink/70">{r.description}</p>}
                  <p className="text-[11px] text-ink/40">{new Date(r.createdAt).toLocaleString(dateLocale())}</p>
                  {r.targetUser && (
                    <div className={actions}>
                      <button
                        type="button"
                        className={btn.danger}
                        onClick={() =>
                          run({
                            action: "block_user",
                            userId: r.targetUser!.id,
                            reason: t("admin.reportBlockReason", { reason: r.reason }),
                          })
                        }
                      >
                        {t("admin.blockUser", { name: r.targetUser.name })}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

      {tab === "moderation" &&
        (() => {
          const queue = list<{ id: string; type: string; status: string; detail: string | null; score: number }>("queue");
          if (!queue) return null;
          if (queue.length === 0) return <Empty />;
          return (
            <div className="space-y-2">
              {queue.map((q) => (
                <div key={q.id} className={card}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{q.type}</Badge>
                    <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                    <span className="text-xs font-semibold text-ink/50">score {q.score}</span>
                  </div>
                  {q.detail && <p className="break-all text-xs text-ink/55">{q.detail}</p>}
                  <div className={actions}>
                    <button
                      type="button"
                      className={btn.primary}
                      onClick={() => run({ action: "review_moderation", queueId: q.id, status: "REVIEWED" })}
                    >
                      {t("admin.reviewed")}
                    </button>
                    <button
                      type="button"
                      className={btn.neutral}
                      onClick={() => run({ action: "review_moderation", queueId: q.id, status: "DISMISSED" })}
                    >
                      {t("admin.dismiss")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
    </div>
  );
}

type OverviewData = {
  users: number;
  items: number;
  trades: number;
  openDisputes: number;
  openReports: number;
  riskEvents: { id: string; type: string; score: number; detail?: string | null; createdAt: string }[];
};

function OverviewView({ data }: { data: OverviewData }) {
  const { t } = useTranslation();
  const stats: [string, number, boolean][] = [
    ["users", data.users, false],
    ["items", data.items, false],
    ["trades", data.trades, false],
    ["openDisputes", data.openDisputes, data.openDisputes > 0],
    ["openReports", data.openReports, data.openReports > 0],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([key, value, alert]) => (
          <div key={key} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-forest/5">
            <p className={`font-display text-2xl ${alert ? "text-coral" : "text-ink"}`}>{value}</p>
            <p className="text-xs font-semibold text-ink/50">{t(`admin.ov.${key}`)}</p>
          </div>
        ))}
      </div>
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-ink/45">{t("admin.ov.riskEvents")}</h2>
        {data.riskEvents.length === 0 ? (
          <Empty />
        ) : (
          <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl bg-white shadow-sm">
            {data.riskEvents.map((e) => (
              <div key={e.id} className="space-y-1 px-3.5 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-ink">{e.type}</span>
                  <Badge tone="danger">+{e.score}</Badge>
                </div>
                {e.detail && <p className="break-all text-xs text-ink/55">{e.detail}</p>}
                <p className="text-[11px] text-ink/40">{new Date(e.createdAt).toLocaleString(dateLocale())}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type AntifraudData = {
  riskyUsers: {
    id: string;
    name: string;
    username?: string | null;
    status: string;
    riskScoreCached: number;
    warningCount: number;
    signals: string[];
  }[];
  riskyTrades: {
    id: string;
    publicId: string;
    status: string;
    riskScore: number;
    parties: { side: string; user: { name: string } }[];
  }[];
  duplicates: { id: string; type: string; itemId?: string | null; detail?: string | null; createdAt: string }[];
  saleAttempts: {
    id: string;
    type: string;
    detail?: string | null;
    createdAt: string;
    user?: { id: string; name: string } | null;
  }[];
  massActions: { userId: string; name: string; kind: string; count: number }[];
};

function AfSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-ink/45">{title}</h2>
      {empty ? <Empty /> : <div className="space-y-2">{children}</div>}
    </section>
  );
}

function AntifraudView({
  data,
  onClearRisk,
}: {
  data: AntifraudData;
  onClearRisk: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const labels = useLabels();
  const when = (d: string) => new Date(d).toLocaleString(dateLocale());
  return (
    <div className="space-y-6">
      <AfSection title={t("admin.af.riskyUsers")} empty={data.riskyUsers.length === 0}>
        {data.riskyUsers.map((u) => (
          <div key={u.id} className={card}>
            <div className="flex items-start justify-between gap-2">
              <Link to={`/users/${u.id}`} className="min-w-0">
                <p className="truncate font-bold text-forest hover:underline">{u.name}</p>
                {u.username && <p className="truncate text-xs text-ink/50">@{u.username}</p>}
              </Link>
              <Badge tone="danger">risk {u.riskScoreCached}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink/60">
              <Badge tone={statusTone(u.status)}>{u.status}</Badge>
              <span>{t("admin.af.warnings", { count: u.warningCount })}</span>
            </div>
            {u.signals.length > 0 && <p className="text-xs text-coral">{u.signals.join(" · ")}</p>}
            <div className={actions}>
              <button
                type="button"
                className={btn.primary}
                title={t("admin.af.checkedHint")}
                onClick={() => onClearRisk(u.id)}
              >
                {t("admin.af.checked")}
              </button>
            </div>
          </div>
        ))}
      </AfSection>

      <AfSection title={t("admin.af.riskyTrades")} empty={data.riskyTrades.length === 0}>
        {data.riskyTrades.map((tr) => (
          <Link key={tr.id} to={`/trades/${tr.id}`} className={`${card} block`}>
            <div className="flex items-start justify-between gap-2">
              <span className="break-all font-bold text-forest">{tr.publicId}</span>
              <Badge tone="danger">risk {tr.riskScore}</Badge>
            </div>
            <p className="text-xs text-ink/70">
              {tr.parties.map((p) => p.user.name).join(" ⇄ ")} · {labels.tradeStatus(tr.status)}
            </p>
          </Link>
        ))}
      </AfSection>

      <AfSection title={t("admin.af.mass")} empty={data.massActions.length === 0}>
        {data.massActions.map((m) => (
          <div key={`${m.userId}-${m.kind}`} className={`${card} flex items-center justify-between gap-2 space-y-0`}>
            <Link to={`/users/${m.userId}`} className="min-w-0 truncate font-bold text-forest hover:underline">
              {m.name}
            </Link>
            <span className="shrink-0 text-xs font-semibold text-ink/60">
              {m.count} {m.kind}
            </span>
          </div>
        ))}
      </AfSection>

      <AfSection title={t("admin.af.duplicates")} empty={data.duplicates.length === 0}>
        {data.duplicates.map((d) => (
          <div key={d.id} className={card}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{d.type === "DUPLICATE_PHOTO" ? t("admin.af.photo") : t("admin.af.description")}</Badge>
              {d.itemId && (
                <Link to={`/items/${d.itemId}`} className="text-xs font-bold text-forest hover:underline">
                  {t("admin.af.listing")}
                </Link>
              )}
              <span className="text-[11px] text-ink/45">{when(d.createdAt)}</span>
            </div>
            {d.detail && <p className="break-all text-xs text-ink/60">{d.detail}</p>}
          </div>
        ))}
      </AfSection>

      <AfSection title={t("admin.af.sales")} empty={data.saleAttempts.length === 0}>
        {data.saleAttempts.map((e) => (
          <div key={e.id} className={card}>
            <div className="flex flex-wrap items-center gap-2">
              {e.user ? (
                <Link to={`/users/${e.user.id}`} className="font-bold text-forest hover:underline">
                  {e.user.name}
                </Link>
              ) : (
                <span>—</span>
              )}
              <Badge>{e.type === "MONEY_IN_LISTING" ? t("admin.af.inListing") : t("admin.af.inChat")}</Badge>
              <span className="text-[11px] text-ink/45">{when(e.createdAt)}</span>
            </div>
            {e.detail && <p className="break-words text-xs text-coral">{e.detail}</p>}
          </div>
        ))}
      </AfSection>
    </div>
  );
}
