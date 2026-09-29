import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/env";
import { isVideoUrl, uploadMedia, VIDEO_ACCEPT } from "@/lib/media";
import { DISPUTE_REASONS, REVIEW_TAGS } from "@/lib/constants";
import { CounterOfferPanel } from "@/components/trade/CounterOfferPanel";
import { SnapshotTimeline } from "@/components/trade/SnapshotTimeline";
import { QrScannerModal } from "@/components/trade/QrScannerModal";
import { TradeChat, type ChatMsg } from "@/components/trade/TradeChat";
import { FancySelect } from "@/components/FancySelect";
import { ReportButton } from "@/components/ReportButton";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Star } from "lucide-react";
import QRCode from "qrcode";
import type {ItemCardData} from "@/components/ItemCard.tsx";
import { useTranslation } from "react-i18next";
import { dateLocale, useLabels } from "@/lib/labels";

type Trade = {
  id: string;
  publicId: string;
  status: string;
  currentVersion: number;
  meetingAt?: string | null;
  meetingPlace?: string | null;
  confirmCodeA?: string | null;
  confirmCodeB?: string | null;
  qrToken?: string | null;
  partyAConfirmedAt?: string | null;
  partyBConfirmedAt?: string | null;
  mySide?: string | null;
  initiatorId: string;
  recipientId: string;
  parties: {
    side: string;
    userId: string;
    confirmedTerms: boolean;
    viewedItemsAck: boolean;
    user: { id: string; name: string; avatarUrl?: string | null };
  }[];
  items: {
    side: string;
    itemId: string;
    item: {
      id: string;
      title: string;
      media: { url: string }[];
    };
  }[];
  disputes: { id: string; reason: string; status: string }[];
  reviews: { authorId: string }[];
  auditLogs: { action: string; createdAt: string; metaJson?: string | null }[];
};

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrByCode, setQrByCode] = useState<Record<string, string>>({});

  // QR is rendered locally from MY one-time code — the other party scans it
  // to confirm; nothing on my own screen can confirm my side.
  const ownCode =
    trade?.mySide === "A" ? trade?.confirmCodeA : trade?.confirmCodeB;
  useEffect(() => {
    if (!trade?.publicId || !ownCode) return;
    const key = `${trade.publicId}:${ownCode}`;
    if (qrByCode[key]) return;
    QRCode.toDataURL(`SWAPTOY:${key}`, { width: 320, margin: 1 })
      .then((url) => setQrByCode((m) => ({ ...m, [key]: url })))
      .catch(() => {});
  }, [trade?.publicId, ownCode, qrByCode]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [disputeReason, setDisputeReason] = useState(DISPUTE_REASONS[0]);
  const [disputeDesc, setDisputeDesc] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const { t } = useTranslation();
  const labels = useLabels();

  const reload = useCallback(async () => {
    const [tr, m] = await Promise.all([
      api<{ trade: Trade }>(`/api/trades/${id}`),
      api<{ messages: ChatMsg[] }>(`/api/trades/${id}/messages`),
    ]);
    setTrade(tr.trade);
    setMessages(m.messages);
  }, [id]);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) reload().catch((e) => setError(e.message));
  }, [user, reload]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      api<{ messages: ChatMsg[] }>(`/api/trades/${id}/messages`)
        .then((m) => setMessages(m.messages))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [user, id]);

  const sideA = useMemo(
    () => trade?.items.filter((i) => i.side === "A") || [],
    [trade],
  );
  const sideB = useMemo(
    () => trade?.items.filter((i) => i.side === "B") || [],
    [trade],
  );

  async function act(payload: Record<string, unknown>) {
    setError("");
    try {
      await api(`/api/trades/${id}/actions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!trade || !user) {
    return <p className="text-ink/50">{t("trade.loading")}</p>;
  }

  const myParty = trade.parties.find((p) => p.userId === user.id);
  const isRecipient = trade.recipientId === user.id;
  const myCode = trade.mySide === "A" ? trade.confirmCodeA : trade.confirmCodeB;
  // No separate meeting step: once terms are agreed the parties can hand off.
  const canHandoff = [
    "TERMS_AGREED",
    "MEETING_SCHEDULED",
    "HANDOFF_PENDING",
    "PARTY_A_CONFIRMED",
    "PARTY_B_CONFIRMED",
  ].includes(trade.status);
  const hasMyReview = trade.reviews.some((r) => r.authorId === user.id);
  const qrDataUrl = canHandoff ? qrByCode[`${trade.publicId}:${myCode}`] : undefined;

  const myConfirmed = Boolean(
    trade.mySide === "A" ? trade.partyAConfirmedAt : trade.mySide === "B" ? trade.partyBConfirmedAt : null,
  );

  return (
    <div className="space-y-4 animate-rise sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink/50">{t("trade.deal")}</p>
          <h1 className="break-all font-display text-2xl text-forest sm:text-3xl">
            {trade.publicId}
          </h1>
          <p className="text-sm text-ink/60">
            {labels.tradeStatus(trade.status)} ·{" "}
            {t("trade.version", { n: trade.currentVersion })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <ReportButton
            tradeId={trade.id}
            targetUserId={
              user.id === trade.initiatorId
                ? trade.recipientId
                : trade.initiatorId
            }
          />
          <Link
            to="/trades"
            className="btn-3d btn-3d-white btn-3d-sm inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-forest"
          >
            <ArrowLeft size={14} strokeWidth={2.6} />
            {t("trade.back")}
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>
      )}

      {/* Contract */}
      <section className="grid gap-4 rounded-2xl bg-white/80 p-4 ring-1 ring-forest/10 sm:rounded-3xl sm:p-5 md:grid-cols-2">
        <div>
          <h2 className="font-display text-lg text-forest sm:text-xl">{t("trade.sideA")}</h2>
          <ItemList items={sideA} />
        </div>
        <div>
          <h2 className="font-display text-lg text-forest sm:text-xl">{t("trade.sideB")}</h2>
          <ItemList items={sideB} />
        </div>
        <p className="text-sm text-ink/60 md:col-span-2">
          {t("trade.condition")}
        </p>
      </section>

      {/* Actions */}
      <section className="stack-actions">
        {/* Accept locks the terms and opens the QR handoff right away. */}
        {isRecipient && ["OFFER_SENT", "NEGOTIATION"].includes(trade.status) && !myParty?.confirmedTerms && (
          <>
            <Btn onClick={() => act({ action: "accept" })}>{t("trade.accept")}</Btn>
            <Btn tone="danger" onClick={() => act({ action: "reject", reason: t("trade.rejectReason") })}>
              {t("trade.reject")}
            </Btn>
          </>
        )}
        {/* Only needed when the recipient changed the composition: the initiator must agree to it. */}
        {trade.status === "NEGOTIATION" && !isRecipient && myParty && !myParty.confirmedTerms && (
          <Btn
            onClick={() =>
              act({ action: "confirm_terms", viewedItemsAck: true })
            }
          >
            {t("trade.confirmTerms")}
          </Btn>
        )}
        {trade.status === "NEGOTIATION" && (
          <p className="w-full text-xs text-ink/50">
            {t("trade.confirmations")}{" "}
            {trade.parties
              .map((p) => `${p.side}:${p.confirmedTerms ? "✓" : "…"}`)
              .join(" · ")}
          </p>
        )}
        {trade.meetingAt && (
          <p className="w-full rounded-xl bg-forest/5 px-3 py-2 text-sm">
            {t("trade.meeting", {
              date: new Date(trade.meetingAt).toLocaleString(dateLocale()),
              place: labels.place(trade.meetingPlace),
            })}
          </p>
        )}
        {["TERMS_AGREED", "MEETING_SCHEDULED"].includes(trade.status) && (
          <Btn onClick={() => act({ action: "start_handoff" })}>
            {t("trade.startHandoff")}
          </Btn>
        )}
        {["OFFER_SENT", "NEGOTIATION", "TERMS_AGREED"].includes(trade.status) && (
          <Btn tone="muted" onClick={() => setShowCounter((v) => !v)}>
            {showCounter ? t("trade.hideCounter") : t("trade.showCounter")}
          </Btn>
        )}
        {!["COMPLETED", "CANCELLED", "BLOCKED"].includes(trade.status) && (
          <Btn
            tone="danger"
            onClick={() =>
              act({ action: "cancel", reason: t("trade.cancelReason") })
            }
          >
            {t("trade.cancel")}
          </Btn>
        )}
        {["MEETING_SCHEDULED", "HANDOFF_PENDING"].includes(trade.status) && (
          <Btn tone="muted" onClick={() => act({ action: "no_show" })}>
            {t("trade.noShow")}
          </Btn>
        )}
      </section>

      {showCounter && (
        <CounterOfferPanel
          tradeId={trade.id}
          initiatorId={trade.initiatorId}
          recipientId={trade.recipientId}
          currentOfferedIds={sideA.map((i) => i.item.id)}
          currentTargetIds={sideB.map((i) => i.item.id)}
          onDone={async () => {
            setShowCounter(false);
            await reload();
          }}
        />
      )}

      <SnapshotTimeline tradeId={trade.id} />

      {/* QR / code confirmation */}
      {canHandoff && (
          <section className="space-y-5 rounded-[2rem] bg-forest p-5 text-cream shadow-[0_20px_60px_-15px_rgba(106,92,224,0.5)] sm:p-8">
            <div>
              <h2 className="font-display text-2xl">{t("trade.handoffTitle")}</h2>
              <p className="mt-1 text-sm text-cream/70">{t("trade.handoffHint")}</p>
            </div>

            {/* How it works, in three short steps */}
            <ol className="grid gap-2 sm:grid-cols-3">
              {[t("trade.handoffStep1"), t("trade.handoffStep2"), t("trade.handoffStep3")].map((step, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-semibold">
                    <span className="btn-3d btn-3d-lime btn-3d-sm pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black">
                      {i + 1}
                    </span>
                    {step}
                  </li>
              ))}
            </ol>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* My QR: the other person scans it */}
              {myCode && (
                  <div className="card-3d flex flex-col items-center rounded-3xl p-5 text-center text-ink">
                    <p className="text-sm font-extrabold">{t("trade.myQrTitle")}</p>
                    <p className="text-xs font-semibold text-ink/50">{t("trade.myQrHint")}</p>
                    <div className="mt-3 grid aspect-square w-full max-w-[12rem] place-items-center rounded-2xl bg-white p-2 ring-1 ring-forest/10">
                      {qrDataUrl ? (
                          <img src={qrDataUrl} alt={t("trade.qrAlt")} className="h-full w-full" />
                      ) : (
                          <span className="text-xs text-ink/40">{t("pages.loading")}</span>
                      )}
                    </div>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink/40">
                      {t("trade.orTellCode")}
                    </p>
                    <p className="max-w-full break-all font-display text-3xl tracking-[0.2em] text-forest sm:text-4xl">{myCode}</p>
                  </div>
              )}

              {/* Confirm receipt: scan their QR (main way) or type their code */}
              <div className="flex flex-col gap-3 rounded-3xl bg-white/10 p-5">
                {myConfirmed ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
                      <span className="btn-3d btn-3d-lime pointer-events-none grid h-12 w-12 place-items-center rounded-full">
                        <Check size={24} strokeWidth={3} />
                      </span>
                      <p className="font-extrabold">{t("trade.youConfirmed")}</p>
                      <p className="text-sm text-cream/70">{t("trade.waitingPeer")}</p>
                    </div>
                ) : (
                    <>
                      <p className="text-sm font-extrabold">{t("trade.confirmTitle")}</p>
                      <button
                          type="button"
                          onClick={() => setScannerOpen(true)}
                          className="btn-3d btn-3d-lime btn-3d-lg flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-extrabold sm:text-base"
                      >
                        <Camera size={20} strokeWidth={2.4} />
                        {t("trade.scan")}
                      </button>

                      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-cream/50">
                        <span className="h-px flex-1 bg-white/15" />
                        {t("trade.orEnterCode")}
                        <span className="h-px flex-1 bg-white/15" />
                      </div>

                      <div className="flex flex-col gap-2.5 pb-1">
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder={t("trade.codePlaceholder")}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-center font-display text-xl tracking-[0.25em] text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-ink/30 focus:ring-2 focus:ring-sand"
                        />
                        <button
                            type="button"
                            disabled={!code.trim()}
                            onClick={() => act({ action: "confirm_handoff", code })}
                            className="btn-3d btn-3d-white min-h-12 w-full rounded-2xl px-4 text-sm font-extrabold text-forest"
                        >
                          {t("trade.confirmCode")}
                        </button>
                      </div>
                      <p className="text-xs text-cream/60">{t("trade.received")}</p>
                    </>
                )}
              </div>
            </div>

            {/* Who has confirmed so far */}
            <div className="grid grid-cols-2 gap-2">
              {trade.parties
                  .slice()
                  .sort((a, b) => (a.userId === user.id ? -1 : b.userId === user.id ? 1 : 0))
                  .map((p) => {
                    const done = Boolean(p.side === "A" ? trade.partyAConfirmedAt : trade.partyBConfirmedAt);
                    return (
                        <div
                            key={p.userId}
                            className={`flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm ${
                              done ? "bg-sand text-ink" : "bg-white/10 text-cream/70"
                            }`}
                        >
                          {done ? <Check size={16} strokeWidth={3} className="shrink-0" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-cream/40" />}
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate font-bold">
                              {p.userId === user.id ? t("trade.you") : p.user.name}
                            </span>
                            <span className="block truncate text-[11px] font-semibold opacity-70">
                              {done ? t("trade.statusDone") : t("trade.statusWaiting")}
                            </span>
                          </span>
                        </div>
                    );
                  })}
            </div>

            <QrScannerModal
                isOpen={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScan={(scannedToken) => {
                  setScannerOpen(false);
                  act({ action: "confirm_handoff", qrToken: scannedToken.trim() });
                }}
            />
          </section>
      )}

      {/* Chat */}
      <TradeChat
        tradeId={id!}
        publicId={trade.publicId}
        meId={user.id}
        peer={trade.parties.find((p) => p.userId !== user.id)?.user}
        messages={messages}
        closed={["COMPLETED", "CANCELLED", "BLOCKED", "EXPIRED"].includes(trade.status)}
        onSent={reload}
        onError={setError}
      />

      {/* Review */}
      {trade.status === "COMPLETED" && !hasMyReview && (
          <section className="space-y-5 rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_-25px_rgba(106,92,224,0.25)] ring-1 ring-forest/5 sm:p-8">
            <div>
              <h2 className="font-display text-xl text-forest sm:text-2xl">{t("trade.reviewTitle")}</h2>
              <p className="mt-1 text-sm text-ink/50">
                {t("trade.reviewHint")}
              </p>
            </div>

            {/* Рейтинг звёздами */}
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-forest/5 py-6">
              <div
                  className="flex gap-1 sm:gap-2"
                  role="radiogroup"
                  aria-label={t("trade.ratingLine")}
                  onPointerLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const lit = n <= (hoverRating || reviewRating);
                  return (
                      <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={n === reviewRating}
                          aria-label={t("trade.stars", { n })}
                          onClick={() => setReviewRating(n)}
                          onPointerEnter={(e) => {
                            if (e.pointerType === "mouse") setHoverRating(n);
                          }}
                          className="grid h-12 w-12 place-items-center rounded-2xl transition active:scale-90"
                      >
                        <Star
                            key={n === reviewRating ? `on-${reviewRating}` : "off"}
                            size={36}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            className={
                              lit
                                  ? `fill-forest text-forest drop-shadow-[0_3px_0_#6a5ce0] ${n === reviewRating ? "animate-pop-once" : ""}`
                                  : "fill-white text-forest/20"
                            }
                        />
                      </button>
                  );
                })}
              </div>
              <p className="text-sm font-semibold text-ink/60">
                <span className="font-extrabold text-forest">
                  {(t("trade.ratingWords", { returnObjects: true }) as string[])[hoverRating || reviewRating]}
                </span>{" "}
                · {hoverRating || reviewRating} {t("trade.ofFive")}
              </p>
            </div>

            {/* Теги */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                {t("trade.whatGood")}
              </p>
              <div className="flex flex-wrap gap-x-2 gap-y-2.5 pb-1">
                {REVIEW_TAGS.map((tag) => {
                  const on = reviewTags.includes(tag);
                  return (
                      <button
                          key={tag}
                          type="button"
                          onClick={() =>
                              setReviewTags((prev) =>
                                  on ? prev.filter((x) => x !== tag) : [...prev, tag],
                              )
                          }
                          aria-pressed={on}
                          className={`btn-3d btn-3d-sm rounded-full px-3.5 py-2 text-xs font-bold ${
                              on ? "btn-3d-violet" : "btn-3d-white text-ink/70"
                          }`}
                      >
                        {labels.reviewTag(tag)}
                      </button>
                  );
                })}
              </div>
            </div>

            {/* Текст отзыва */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                {t("trade.comment")}
              </p>
              <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={t("trade.commentPlaceholder")}
                  className="w-full rounded-2xl border border-forest/10 bg-forest/[0.03] p-4 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-forest/30 focus:bg-white focus:ring-2 focus:ring-forest/10"
                  rows={3}
              />
            </div>

            <button
                type="button"
                onClick={async () => {
                  setError("");
                  try {
                    await api(`/api/trades/${id}/reviews`, {
                      method: "POST",
                      body: JSON.stringify({
                        rating: reviewRating,
                        tags: reviewTags,
                        text: reviewText,
                      }),
                    });
                    await reload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("common.error"));
                  }
                }}
                className="btn-3d btn-3d-violet w-full rounded-2xl py-3.5 text-sm font-extrabold"
            >
              {t("trade.sendReview")}
            </button>
          </section>
      )}

      {/* Dispute */}
      {!["CANCELLED", "BLOCKED"].includes(trade.status) && (
          <section className="space-y-3 rounded-3xl bg-white/60 p-5 ring-1 ring-coral/20">
            <h2 className="font-display text-xl text-coral">{t("trade.disputeTitle")}</h2>
            <FancySelect
                value={disputeReason}
                onChange={(v) => setDisputeReason(v as typeof disputeReason)}
                options={DISPUTE_REASONS.map((r) => ({ value: r, label: labels.disputeReason(r) }))}
                triggerClassName={"border-forest/15 bg-white hover:border-forest/30 focus:ring-forest/30"}
            />


            <textarea
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
                placeholder={t("trade.disputePlaceholder")}
                className="w-full rounded-xl border border-forest/15 p-2 text-sm"
                rows={3}
            />
            {disputeDesc.length > 0 && disputeDesc.length < 10 && (
                <p className="text-xs text-coral">
                  {t("trade.moreChars", { n: 10 - disputeDesc.length })}
                </p>
            )}

            {/* TZ §21: photo/video evidence linked to this trade */}
            <div className="space-y-2">
              <label className="btn-3d btn-3d-coral btn-3d-sm inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold">
                <Camera size={14} />
                {evidenceUploading ? t("trade.uploading") : t("trade.addEvidence")}
                <input
                    type="file"
                    accept={`image/*,${VIDEO_ACCEPT}`}
                    multiple
                    disabled={evidenceUploading}
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setEvidenceUploading(true);
                      setError("");
                      try {
                        const urls: string[] = [];
                        for (const f of files) urls.push(await uploadMedia(f, trade.publicId));
                        setEvidence((prev) => [...prev, ...urls].slice(0, 10));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("trade.uploadError"));
                      } finally {
                        setEvidenceUploading(false);
                        e.target.value = "";
                      }
                    }}
                />
              </label>
              {evidence.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {evidence.map((url) => (
                        <div key={url} className="relative">
                          {isVideoUrl(url) ? (
                              <video src={mediaUrl(url)} muted className="h-16 w-16 rounded-lg bg-black object-cover" />
                          ) : (
                              <img src={mediaUrl(url)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                          )}
                          <button
                              type="button"
                              aria-label={t("trade.removeEvidence")}
                              onClick={() => setEvidence((prev) => prev.filter((u) => u !== url))}
                              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-coral text-[10px] font-bold text-white"
                          >
                            ×
                          </button>
                        </div>
                    ))}
                  </div>
              )}
            </div>
          <Btn
              tone="danger"
              onClick={async () => {
                if (disputeDesc.trim().length < 10) {
                  setError(t("trade.descTooShort"));
                  return;
                }
                setError("");
                try {
                  await api(`/api/trades/${id}/disputes`, {
                    method: "POST",
                    body: JSON.stringify({
                      reason: disputeReason,
                      description: disputeDesc,
                      evidence,
                    }),
                  });
                  setEvidence([]);
                  setDisputeDesc("");
                  await reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("trade.disputeError"));
                }
              }}
          >
            {t("trade.disputeTitle")}
          </Btn>
          {trade.disputes[0] && (
            <p className="text-sm text-ink/60">
              {t("trade.activeDispute", {
                reason: labels.disputeReason(trade.disputes[0].reason),
                status: trade.disputes[0].status,
              })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ItemList({
  items,
}: {
  items: { item: { id: string; title: string; media: { url: string }[] } }[];
}) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((ti) => (
        <li key={ti.item.id} className="flex items-center gap-2 text-sm">
          <img
            src={mediaUrl(ti.item.media[0]?.url) || "https://placehold.co/40"}
            alt=""
            className="h-10 w-10 rounded-lg object-cover"
          />
          <Link to={`/items/${ti.item.id}`} className="hover:underline">
            {ti.item.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Btn({
  children,
  onClick,
  tone = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "muted" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "btn-3d-violet"
      : tone === "danger"
        ? "btn-3d-coral"
        : "btn-3d-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-3d inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold sm:w-auto ${cls}`}
    >
      {children}
    </button>
  );
}
