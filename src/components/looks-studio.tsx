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
  RefreshCw,
  Sparkles,
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
            alt={`YouCam virtual preview for ${candidate.name}; generated appearance, not an actual result`}
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
      item.previewStatus === "queued" || item.previewStatus === "processing",
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
  const requested = session.candidates.some((item) => !!item.previewJobId);
  const hasRecordedPreviews = session.candidates.some(
    (item) => !!item.previewAsset?.recordedAt,
  );
  const allFreshReady =
    session.candidates.length > 0 &&
    session.candidates.every(
      (item) =>
        item.previewStatus === "ready" &&
        !!item.previewAsset &&
        !item.previewAsset.recordedAt,
    );
  const hasFailedPreview = session.candidates.some(
    (item) =>
      item.previewStatus === "failed" || item.previewStatus === "cancelled",
  );
  const canRequest =
    !!config?.livePreviews &&
    !previewPending &&
    !!session.candidates.length &&
    !allFreshReady;

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
            <strong>
              <Sparkles
                size={15}
                aria-hidden
                style={{
                  display: "inline",
                  verticalAlign: "-3px",
                  marginRight: 6,
                }}
              />
              A glimpse of the color, not a promise.
            </strong>
            <p>
              {previewPending
                ? "YouCam is preparing your previews. You can keep exploring the methods while you wait."
                : hasRecordedPreviews
                  ? "Recorded YouCam renders of this synthetic sample portrait. These are appearance references, not physical results."
                  : config?.livePreviews
                    ? "YouCam renders each color recipe on your selected photo. Skin smoothing stays off."
                    : configError
                      ? "Preview availability couldn’t be checked. Your method choices are still here. Refresh this page to try again."
                      : "Live previews are currently unavailable. Your methods are ready to explore."}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!canRequest || studio.busy}
            busy={studio.busy && !selected}
            onClick={() => void studio.perform(requestPreviews)}
          >
            {previewPending ? (
              <LoaderCircle size={16} className="spin" aria-hidden />
            ) : requested ? (
              <RefreshCw size={16} aria-hidden />
            ) : (
              <WandSparkles size={16} aria-hidden />
            )}
            {previewPending
              ? "Previews in progress"
              : allFreshReady
                ? "Previews ready"
                : hasFailedPreview
                  ? "Retry previews"
                  : hasRecordedPreviews
                    ? "Generate fresh previews"
                    : "Create my previews"}
          </Button>
        </div>
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
                      disabled={studio.busy}
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
              Only one distinct method currently fits these confirmed choices.
              We won’t present a duplicate as an alternative. You can confirm
              another comfortable movement or available tool in a fresh setup.
            </Notice>
          ) : null}
          <DraftNote />
        </>
      )}
    </div>
  );
}
