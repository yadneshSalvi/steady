"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Circle,
  Hand,
  ImageIcon,
  LoaderCircle,
  Paintbrush,
  PenLine,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LOOKS, PRODUCT_LABELS } from "@/lib/catalog";
import { getConfig, requestPreviews } from "@/lib/client";
import type { CandidatePlan, PublicConfig } from "@/lib/contracts";
import {
  BackLink,
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
  Notice,
  SampleBadge,
  StepProgress,
} from "./ui";
import { useStudioSession } from "./use-studio-session";
import { PreviewLadder, publicRecording } from "./preview-ladder";
import { RegionPhoto } from "./region-image";
import { methodCrop, useSourceLandmarks } from "./use-source-landmarks";

function generationLabel(candidate: CandidatePlan) {
  const units =
    candidate.previewVariants?.filter(
      (variant) => variant.previewStatus !== "ready",
    ).length ?? 1;
  const retry = candidate.previewVariants?.some(
    (variant) => variant.previewStatus === "failed" && variant.previewRetryable,
  );
  return `${retry ? "Retry previews" : "Generate previews"} · ≤${units} ${units === 1 ? "unit" : "units"}`;
}

/** Methods share one target unless they paint different effects (liner vs shadow). */
function lookKey(candidate: CandidatePlan) {
  return candidate.recipe
    .filter((effect) => effect.category !== "skin_smooth")
    .map((effect) => effect.category)
    .sort()
    .join("+");
}

function MethodPreview({ candidate }: { candidate: CandidatePlan }) {
  const asset = candidate.previewAsset;
  const waiting = ["queued", "processing"].includes(candidate.previewStatus);
  return (
    <div
      className={`candidate-visual ${!asset ? "candidate-visual--empty" : ""}`}
    >
      {asset ? (
        <Image
          src={asset.url}
          alt={`${candidate.selectedPreviewVariantId ?? "full"} YouCam target for ${candidate.name}`}
          width={asset.width}
          height={asset.height}
          sizes="(max-width: 740px) 88vw, 360px"
          unoptimized={!publicRecording(asset)}
        />
      ) : (
        <div className="preview-placeholder">
          {waiting ? (
            <>
              <LoaderCircle className="spin" size={24} aria-hidden />
              <strong>Preparing preview…</strong>
            </>
          ) : (
            <>
              <ImageIcon size={28} aria-hidden />
              <strong>
                {candidate.previewStatus === "failed"
                  ? "Preview unavailable"
                  : "No preview yet"}
              </strong>
              {candidate.previewError ? (
                <p role="alert">{candidate.previewError}</p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MethodIcon({ candidate }: { candidate: CandidatePlan }) {
  const tool = candidate.tools[0];
  const Icon =
    tool === "fingertips"
      ? Hand
      : tool === "sponge"
        ? Circle
        : tool === "liner_pen"
          ? PenLine
          : Paintbrush;
  return <Icon size={32} strokeWidth={1.3} aria-hidden />;
}

export function LooksStudio({ id }: { id: string }) {
  const studio = useStudioSession(id);
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [selected, setSelected] = useState("");
  const [viewedId, setViewedId] = useState("");
  const session = studio.session;
  const refresh = studio.refresh;
  const landmarks = useSourceLandmarks(
    session?.assets.find((asset) => asset.id === session.sourceAssetId)?.url,
  );
  const previewPending = !!session?.candidates.some(
    (item) =>
      ["queued", "processing"].includes(item.previewStatus) ||
      item.previewVariants?.some((variant) =>
        ["queued", "processing"].includes(variant.previewStatus),
      ),
  );
  useEffect(() => {
    void getConfig()
      .then(setConfig)
      .catch(() => setConfigError(true));
  }, []);
  useEffect(() => {
    if (!previewPending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 4000);
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [previewPending, refresh]);
  if (studio.loading) return <LoadingState>Opening your methods…</LoadingState>;
  if (!session)
    return (
      <ErrorState
        message={studio.error || "This session is no longer available."}
        retry={() => void studio.refresh()}
      />
    );
  const look = LOOKS.find((item) => item.id === session.lookId) || LOOKS[0];
  const canEdit = ["choosing", "ready"].includes(session.stage);
  const canRequest =
    session.mode === "personal" &&
    !!config?.livePreviews &&
    canEdit &&
    !previewPending;
  const viewed =
    session.candidates.find((candidate) => candidate.id === viewedId) ??
    session.candidates[0];
  const distinctLooks =
    new Set(session.candidates.map((candidate) => lookKey(candidate))).size > 1;
  const cropFor = (candidate: CandidatePlan) =>
    methodCrop(
      landmarks,
      candidate.actions.map((action) => action.region),
    );
  const viewedCrop = viewed ? cropFor(viewed) : null;
  async function choose(candidate: CandidatePlan) {
    setSelected(candidate.id);
    const next = await studio.run({
      type: "approve_candidate",
      candidateId: candidate.id,
    });
    if (next) router.push(`/studio/${id}/mirror`);
    setSelected("");
  }
  return (
    <div className="wrap page-wrap comparison-page r3-methods">
      <div className="page-top">
        <BackLink href={`/studio/new?edit=${encodeURIComponent(id)}`}>
          Your setup
        </BackLink>
        <StepProgress active={1} />
      </div>
      <div className="comparison-header">
        <div className="page-intro">
          {session.mode === "sample" ? <SampleBadge /> : null}
          <h1>Methods</h1>
        </div>
        {session.activePlan ? (
          <ButtonLink
            href={`/studio/${id}/${["completed", "reviewing"].includes(session.stage) ? "review" : "mirror"}`}
            variant="secondary"
          >
            Return to your session
          </ButtonLink>
        ) : null}
      </div>
      {studio.error ? <Notice kind="error">{studio.error}</Notice> : null}
      {session.previewBatch?.deferred ? (
        <Notice>
          {session.previewBatch.message ||
            `${session.previewBatch.queued} queued; ${session.previewBatch.deferred} waiting for allowance.`}
        </Notice>
      ) : null}
      {!viewed ? (
        <div className="no-plan-panel">
          <h2>No method fits yet</h2>
          <ul className="conflict-list">
            {session.conflicts.map((conflict, index) => (
              <li key={`${conflict.code}-${index}`}>
                <strong>{conflict.message}</strong>
                <p>{conflict.resolution}</p>
              </li>
            ))}
          </ul>
          <ButtonLink href={`/studio/new?edit=${encodeURIComponent(id)}`}>
            Adjust my choices <ArrowRight size={18} aria-hidden />
          </ButtonLink>
        </div>
      ) : (
        <>
          <section
            className="method-target-stage"
            aria-label="Your shared color target"
          >
            <MethodPreview candidate={viewed} />
            <div className="method-target-controls">
              <h2>
                <span
                  className="target-color-dot"
                  style={{ background: look.color }}
                  aria-hidden
                />
                {look.title}
              </h2>
              <PreviewLadder
                candidate={viewed}
                crop={viewedCrop === undefined ? "loading" : viewedCrop}
                disabled={studio.busy || !canEdit}
                onChoose={(level) =>
                  void studio.run({
                    type: "select_preview_level",
                    candidateId: viewed.id,
                    level,
                  })
                }
              />
              {session.mode === "personal" &&
              canEdit &&
              !viewed.previewVariants?.every(
                (variant) => variant.previewStatus === "ready",
              ) ? (
                <div className="method-generation">
                  <Button
                    variant="secondary"
                    disabled={
                      !canRequest ||
                      studio.busy ||
                      viewed.previewVariants?.every(
                        (variant) =>
                          variant.previewStatus === "ready" ||
                          variant.previewRetryable === false,
                      )
                    }
                    busy={studio.busy && selected === `preview:${viewed.id}`}
                    onClick={() => {
                      setSelected(`preview:${viewed.id}`);
                      void studio
                        .perform((current) =>
                          requestPreviews(current, { candidateId: viewed.id }),
                        )
                        .finally(() => setSelected(""));
                    }}
                  >
                    <WandSparkles size={16} aria-hidden />
                    {generationLabel(viewed)}
                  </Button>
                  {!config?.livePreviews ? (
                    <p className="small" role="status">
                      {configError
                        ? "Preview availability could not be checked."
                        : "Fresh previews are paused."}
                    </p>
                  ) : null}
                  {viewed.previewVariants?.some(
                    (variant) =>
                      variant.previewRetryable === false &&
                      variant.previewStatus === "failed",
                  ) ? (
                    <p className="small">
                      This preview couldn’t be created.{" "}
                      <a href="/studio/new">Try a new photo.</a>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
          <div
            className={`method-options method-options--${Math.min(3, session.candidates.length)} ${distinctLooks ? "method-options--looks" : ""}`}
            aria-label="Available methods"
          >
            {session.candidates.map((candidate) => (
              <article
                key={candidate.id}
                className={`candidate-card method-option ${viewed.id === candidate.id ? "is-viewed" : ""}`}
              >
                {distinctLooks && candidate.previewAsset ? (
                  <RegionPhoto
                    className="method-option-target"
                    src={candidate.previewAsset.url}
                    alt={`${candidate.selectedPreviewVariantId ?? "full"} target for ${candidate.name}`}
                    width={candidate.previewAsset.width}
                    height={candidate.previewAsset.height}
                    crop={cropFor(candidate)}
                    unoptimized={!publicRecording(candidate.previewAsset)}
                  />
                ) : null}
                <div className="method-option-top">
                  <MethodIcon candidate={candidate} />
                  <h2>{candidate.name}</h2>
                </div>
                <p>
                  {[
                    ...new Set(
                      candidate.actions.map(
                        (action) => PRODUCT_LABELS[action.product],
                      ),
                    ),
                  ].join(" + ")}
                </p>
                <div className="method-option-actions">
                  <Button
                    variant={
                      viewed.id === candidate.id ? "primary" : "secondary"
                    }
                    disabled={studio.busy || !canEdit}
                    busy={studio.busy && selected === candidate.id}
                    onClick={() => void choose(candidate)}
                  >
                    Choose <ArrowRight size={17} aria-hidden />
                  </Button>
                  <Button
                    variant="quiet"
                    aria-pressed={viewed.id === candidate.id}
                    onClick={() => setViewedId(candidate.id)}
                  >
                    View target
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
