"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Hand,
  ImageIcon,
  LoaderCircle,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LOOKS, MOTION_LABELS, TOOL_LABELS } from "@/lib/catalog";
import { getConfig, requestPreviews } from "@/lib/client";
import type { CandidatePlan, PublicConfig } from "@/lib/contracts";
import {
  ActionList,
  BackLink,
  Button,
  ButtonLink,
  DraftNote,
  ErrorState,
  LoadingState,
  Notice,
  ProvenanceLabel,
  SampleDisclosure,
  StepProgress,
} from "./ui";
import { useStudioSession } from "./use-studio-session";
import { PreviewLadder } from "./preview-ladder";

function generationLabel(candidate: CandidatePlan) {
  const units =
    candidate.previewVariants?.filter(
      (variant) => variant.previewStatus !== "ready",
    ).length ?? 1;
  const retry = candidate.previewVariants?.some(
    (variant) => variant.previewStatus === "failed" && variant.previewRetryable,
  );
  return `${retry ? "Retry available previews" : "Generate fresh ladder"} · up to ${units} ${units === 1 ? "unit" : "units"}`;
}

function Preview({
  candidate,
  index,
}: {
  candidate: CandidatePlan;
  index: number;
}) {
  const waiting =
    candidate.previewStatus === "queued" ||
    candidate.previewStatus === "processing";
  return (
    <div
      className={`candidate-visual ${!candidate.previewAsset ? "candidate-visual--empty" : ""}`}
    >
      {candidate.previewAsset ? (
        <>
          <Image
            src={candidate.previewAsset.url}
            alt={`${candidate.selectedPreviewVariantId ?? "full"} YouCam target for ${candidate.name}`}
            width={1200}
            height={1500}
            unoptimized
          />
          <ProvenanceLabel
            kind="virtual_preview"
            recordedAt={candidate.previewAsset.recordedAt}
          />
        </>
      ) : (
        <div className="preview-placeholder">
          <div className="preview-silhouette" aria-hidden />
          {waiting ? (
            <>
              <LoaderCircle className="spin" size={21} aria-hidden />
              <strong>
                {candidate.previewStatus === "queued"
                  ? "Your preview is queued."
                  : "A preview is taking shape."}
              </strong>
              <p>
                YouCam is preparing the exact color recipe for this method. Your
                place is saved.
              </p>
            </>
          ) : candidate.previewStatus === "failed" ? (
            <>
              <ImageIcon size={23} aria-hidden />
              <strong>The preview needs a moment.</strong>
              <p>
                {candidate.previewError ||
                  "YouCam couldn’t complete this preview. You can still read the method or request previews again."}
              </p>
            </>
          ) : (
            <>
              <strong>A method, before a preview.</strong>
              <p>
                Request a YouCam preview to explore this recipe. No image has
                been generated yet.
              </p>
            </>
          )}
        </div>
      )}
      <span className="candidate-number">0{index + 1}</span>
    </div>
  );
}

export function LooksStudio({ id }: { id: string }) {
  const studio = useStudioSession(id);
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [selected, setSelected] = useState("");
  const session = studio.session;
  const refresh = studio.refresh;
  const previewPending = !!session?.candidates.some(
    (item) =>
      item.previewStatus === "queued" ||
      item.previewStatus === "processing" ||
      item.previewVariants?.some(
        (variant) =>
          variant.previewStatus === "queued" ||
          variant.previewStatus === "processing",
      ),
  );

  useEffect(() => {
    void getConfig()
      .then(setConfig)
      .catch(() => setConfigError(true));
  }, []);
  useEffect(() => {
    if (!previewPending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [previewPending, refresh]);

  if (studio.loading)
    return (
      <LoadingState>Finding your studio and its saved choices…</LoadingState>
    );
  if (!session)
    return (
      <ErrorState
        message={
          studio.error ||
          "This session is no longer available. You can start with a fresh setup."
        }
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
    <div className="wrap page-wrap comparison-page">
      <div className="page-top">
        <BackLink href={`/studio/new?edit=${encodeURIComponent(id)}`}>
          Your setup
        </BackLink>
        <StepProgress active={1} />
      </div>
      <div className="comparison-header">
        <div className="page-intro">
          <p className="eyebrow">Your look, your way</p>
          <h1>
            {session.candidates.length > 1 ? (
              <>
                {session.candidates.length === 2
                  ? "Two"
                  : session.candidates.length === 3
                    ? "Three"
                    : "Different"}{" "}
                ways.
                <br /> <em>Entirely yours.</em>
              </>
            ) : (
              <>
                A way to make
                <br /> <em>it your own.</em>
              </>
            )}
          </h1>
          <p>
            {session.candidates.length > 1
              ? "Compare the movements and tools, then choose your starting point."
              : "Here’s what fits your confirmed movements and tools. Your preferences stay yours to change."}
          </p>
          <div className="session-summary">
            <span className="pill" style={{ background: `${look.color}22` }}>
              <span
                style={{
                  height: 7,
                  width: 7,
                  borderRadius: "50%",
                  background: look.color,
                }}
                aria-hidden
              />
              {look.title}
            </span>
            {Object.entries(session.preferences.movements)
              .filter(([, value]) => value === "comfortable")
              .map(([motion]) => (
                <span className="pill" key={motion}>
                  {MOTION_LABELS[motion as keyof typeof MOTION_LABELS]}
                </span>
              ))}
            <span className="pill">Your pace</span>
          </div>
        </div>
        {session.activePlan ? (
          <ButtonLink
            href={`/studio/${id}/${session.stage === "completed" || session.stage === "reviewing" ? "review" : "mirror"}`}
            variant="secondary"
          >
            Return to your session <ArrowUpRight size={18} aria-hidden />
          </ButtonLink>
        ) : null}
      </div>
      {session.mode === "sample" ? <SampleDisclosure /> : null}
      {session.candidates.length ? (
        <div className="preview-explainer">
          <div>
            <strong>Find your color. Choose where to stop.</strong>
            <p>
              {previewPending
                ? "YouCam is preparing your chosen method's intensity ladder. Your place is saved."
                : session.mode === "sample"
                  ? `Compare ${session.lookId === "eyes" ? "Light and Full" : "Light, Build and Full"}. The mirror will measure toward the stopping point you choose.`
                  : config?.livePreviews
                    ? `Generate a YouCam ladder for the method you want to try. Each fresh ladder uses up to ${session.lookId === "eyes" ? 2 : 3} units.`
                    : configError
                      ? "Preview availability could not be checked. Refresh to try again."
                      : config?.livePreviewMessage ||
                        "Fresh previews are resting. Your methods are ready to explore."}
            </p>
          </div>
        </div>
      ) : null}
      {session.previewBatch?.deferred ? (
        <Notice>
          {session.previewBatch.message ||
            `${session.previewBatch.queued} previews queued; ${session.previewBatch.deferred} will wait for allowance to renew.`}
        </Notice>
      ) : null}
      {studio.error ? (
        <div style={{ marginTop: 23 }}>
          <Notice kind="error">{studio.error}</Notice>
        </div>
      ) : null}
      {!session.candidates.length ? (
        <div className="no-plan-panel">
          <h2>
            Let’s change the setup,
            <br /> <em>not your boundaries.</em>
          </h2>
          <p>
            There isn’t a method that meets every confirmed choice yet. Here’s
            what needs your decision.
          </p>
          <ul className="conflict-list">
            {session.conflicts.length ? (
              session.conflicts.map((conflict, index) => (
                <li key={`${conflict.code}-${index}`}>
                  <strong>{conflict.message}</strong>
                  <p>{conflict.resolution}</p>
                </li>
              ))
            ) : (
              <li>
                <strong>No confirmed route is available.</strong>
                <p>
                  Choose at least one comfortable movement and the matching
                  tools and products, or ask someone you trust to help you
                  choose.
                </p>
              </li>
            )}
          </ul>
          <div className="button-row">
            <ButtonLink
              href={`/studio/new?edit=${encodeURIComponent(id)}`}
              variant="primary"
            >
              Adjust my choices <ArrowRight size={18} aria-hidden />
            </ButtonLink>
            <ButtonLink href="/methods" variant="secondary">
              Return later
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`candidates-grid ${session.candidates.length === 1 ? "candidates-grid--single" : session.candidates.length === 3 ? "candidates-grid--three" : ""}`}
          >
            {session.candidates.map((candidate, index) => (
              <article className="candidate-card" key={candidate.id}>
                <Preview candidate={candidate} index={index} />
                <div className="candidate-body">
                  <PreviewLadder
                    candidate={candidate}
                    disabled={studio.busy || !canEdit}
                    onChoose={(level) =>
                      void studio.run({
                        type: "select_preview_level",
                        candidateId: candidate.id,
                        level,
                      })
                    }
                  />
                  {session.mode === "personal" &&
                  canEdit &&
                  !candidate.previewVariants?.every(
                    (variant) => variant.previewStatus === "ready",
                  ) ? (
                    <div className="method-generation">
                      <Button
                        variant="secondary"
                        disabled={
                          !canRequest ||
                          studio.busy ||
                          candidate.previewVariants?.every(
                            (variant) =>
                              variant.previewStatus === "ready" ||
                              variant.previewRetryable === false,
                          )
                        }
                        busy={
                          studio.busy && selected === `preview:${candidate.id}`
                        }
                        onClick={() => {
                          setSelected(`preview:${candidate.id}`);
                          void studio
                            .perform((current) =>
                              requestPreviews(current, {
                                candidateId: candidate.id,
                              }),
                            )
                            .finally(() => setSelected(""));
                        }}
                      >
                        <WandSparkles size={16} aria-hidden />
                        {generationLabel(candidate)}
                      </Button>
                      {candidate.previewVariants?.some(
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
                  <p className="eyebrow">{candidate.tagline}</p>
                  <h2>{candidate.name}</h2>
                  <p className="candidate-description">
                    {candidate.description}
                  </p>
                  <div className="tag-row">
                    {candidate.attributes.map((attribute) => (
                      <span className="pill" key={attribute}>
                        {attribute}
                      </span>
                    ))}
                  </div>
                  <div className="candidate-tools">
                    <Hand size={17} aria-hidden />
                    <strong style={{ fontWeight: 600 }}>Your tools</strong>
                    <span>·</span>
                    {candidate.tools
                      .map((tool) => TOOL_LABELS[tool])
                      .join(" + ")}
                  </div>
                  <ul className="candidate-facts">
                    {candidate.tradeoffs.map((tradeoff) => (
                      <li key={tradeoff}>
                        <Check size={15} aria-hidden />
                        <span>{tradeoff}</span>
                      </li>
                    ))}
                    <li>
                      <Check size={15} aria-hidden />
                      <span>
                        {candidate.actions.length} deliberate steps. You decide
                        when to move on.
                      </span>
                    </li>
                  </ul>
                  <div className="candidate-actions">
                    <Button
                      onClick={() => void choose(candidate)}
                      busy={studio.busy && selected === candidate.id}
                      disabled={studio.busy || !canEdit}
                    >
                      Choose this method <ArrowRight size={17} aria-hidden />
                    </Button>
                  </div>
                  <details className="method-details">
                    <summary>
                      What this method asks of you{" "}
                      <ChevronDown size={18} aria-hidden />
                    </summary>
                    <ActionList actions={candidate.actions} />
                  </details>
                </div>
              </article>
            ))}
          </div>
          {session.candidates.length === 1 ? (
            <Notice>
              One method fits your choices. You can adjust your setup to compare
              another movement or tool.
            </Notice>
          ) : null}
          <DraftNote />
        </>
      )}
    </div>
  );
}
