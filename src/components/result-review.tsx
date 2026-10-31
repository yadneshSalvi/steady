"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Camera,
  Check,
  Heart,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Outcome } from "@/lib/contracts";
import { LOOKS } from "@/lib/catalog";
import { deleteSession } from "@/lib/client";
import { uploadPhoto } from "@/lib/upload-client";
import { StillCapture, usePhotoUrl } from "./camera";
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
  StepProgress,
} from "./ui";
import { useStudioSession } from "./use-studio-session";

const outcomeLabels: Record<Outcome["classification"], string> = {
  original_completed: "Original goal completed",
  adapted_completed: "Adapted goal completed",
  accepted_partial: "Current result accepted",
  stopped: "Session stopped",
};
const comfortLabels: Record<Outcome["comfort"], string> = {
  comfortable: "Comfortable",
  mixed: "A mix of both",
  difficult: "Difficult",
  not_assessed: "Not assessed",
};
const helpLabels: Record<Outcome["assistance"], string> = {
  none: "No human assistance",
  verbal: "Verbal guidance",
  physical: "Hands-on assistance",
  not_assessed: "Not assessed",
};

function OutcomeQuestion<T extends string>({
  title,
  name,
  options,
  value,
  onChange,
}: {
  title: string;
  name: string;
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="outcome-field">
      <legend>{title}</legend>
      <div className="outcome-options">
        {options.map((option) => (
          <label className="outcome-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ResultReview({ id }: { id: string }) {
  const studio = useStudioSession(id);
  const router = useRouter();
  const session = studio.session;
  const [file, setFile] = useState<File | null>(null);
  const fileUrl = usePhotoUrl(file);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [satisfaction, setSatisfaction] = useState<
    Outcome["satisfaction"] | ""
  >("");
  const [comfort, setComfort] = useState<Outcome["comfort"] | "">("");
  const [assistance, setAssistance] = useState<Outcome["assistance"] | "">("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = studio.busy || uploading || deleting;

  if (studio.loading)
    return <LoadingState>Making space for your result…</LoadingState>;
  if (!session)
    return (
      <ErrorState
        message={studio.error || "This session isn’t available anymore."}
        retry={() => void studio.refresh()}
      />
    );
  if (!["reviewing", "completed", "stopped"].includes(session.stage))
    return (
      <div className="wrap page-wrap">
        <Notice title="Your studio is still open">
          Return to your current instruction, or choose “Keep this result” in
          the mirror when you’d like to finish.
        </Notice>
        <div className="button-row" style={{ marginTop: 24 }}>
          <ButtonLink
            href={`/studio/${id}/${session.activePlan ? "mirror" : "looks"}`}
          >
            Return to my session <ArrowRight size={18} aria-hidden />
          </ButtonLink>
        </div>
      </div>
    );

  const isSample = session.mode === "sample";
  const look = LOOKS.find((item) => item.id === session.lookId) || LOOKS[0];
  const finalAsset =
    session.assets.find(
      (asset) => asset.id === session.outcome?.finalAssetId,
    ) ||
    session.assets
      .filter(
        (asset) =>
          asset.purpose === "final" && asset.provenance === "actual_capture",
      )
      .at(-1);
  const source = session.assets.find(
    (asset) => asset.id === session.sourceAssetId,
  );
  const preview = session.activePlan?.previewAsset;
  const allComplete =
    !!session.activePlan &&
    session.activePlan.actions.every((action) =>
      session.completedActionIds.includes(action.id),
    );
  const finished = session.stage === "completed" || session.stage === "stopped";

  async function finish() {
    if (!session || busy) return;
    if (!isSample && (!satisfaction || !comfort || !assistance)) {
      setLocalError(
        "Choose an answer for the three questions so your assessment is your own. “Not assessed” is available when you prefer.",
      );
      return;
    }
    if (
      !isSample &&
      allComplete &&
      satisfaction === "yes" &&
      !file &&
      !finalAsset
    ) {
      setLocalError(
        "Choose an actual final photo before recording a completed physical result. You can also keep a partial result without a photo.",
      );
      setCaptureOpen(true);
      return;
    }
    setUploading(true);
    setLocalError("");
    try {
      let finalAssetId = finalAsset?.id;
      if (file && !isSample) {
        const asset = await uploadPhoto(file, id, "final");
        finalAssetId = asset.id;
        await studio.refresh();
      }
      const next = await studio.run({
        type: "finish",
        satisfaction: satisfaction || "not_yet",
        comfort: comfort || "not_assessed",
        assistance: assistance || "not_assessed",
        note,
        finalAssetId,
      });
      if (next) {
        setCaptureOpen(false);
        setFile(null);
      }
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "Your assessment hasn’t been saved yet. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function remove() {
    setDeleting(true);
    setLocalError("");
    try {
      await deleteSession(id);
      router.push("/methods");
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "The session couldn’t be deleted yet. Please try again.",
      );
      setDeleting(false);
    }
  }

  return (
    <div className="wrap page-wrap review-page">
      <div className="page-top">
        <BackLink href={finished ? "/methods" : `/studio/${id}/mirror`}>
          {finished ? "Your methods" : "Your mirror"}
        </BackLink>
        <StepProgress active={3} />
      </div>
      <div className="page-intro">
        <p className="eyebrow">
          {isSample
            ? "The sample walkthrough"
            : "Your expression, your assessment"}
        </p>
        <h1>
          {isSample ? (
            <>
              A little closer
              <br /> <em>to your way.</em>
            </>
          ) : (
            <>
              Your look.
              <br /> <em>On your terms.</em>
            </>
          )}
        </h1>
        <p>
          {isSample
            ? "You’ve explored how a method can change with you. This is a walkthrough, not a participant result."
            : "The photo is real. How it feels is yours to say. Keep what you love, and tell us how the method felt."}
        </p>
      </div>
      {studio.error || localError ? (
        <div style={{ marginBottom: 24 }}>
          <Notice kind="error">{localError || studio.error}</Notice>
        </div>
      ) : null}
      <div className="review-grid">
        <div className="review-visual">
          {isSample ? (
            <div className="review-capture">
              <Image
                src="/images/studio-portrait.jpg"
                alt="Fictional AI-created adult sample portrait; not a participant result"
                width={1200}
                height={1500}
              />
              <ProvenanceLabel kind="synthetic_inspiration" />
            </div>
          ) : captureOpen && !finished ? (
            <div
              className="review-capture"
              style={{ padding: 20, minHeight: 380 }}
            >
              <StillCapture
                file={file}
                onSelected={setFile}
                label="Choose your actual final photo"
              />
            </div>
          ) : fileUrl || finalAsset ? (
            <div className="review-capture">
              <Image
                src={fileUrl || finalAsset!.url}
                alt="Your selected actual final makeup photo"
                width={1200}
                height={1500}
                unoptimized
              />
              <ProvenanceLabel kind="actual_capture" />
            </div>
          ) : (
            <div className="review-capture review-capture-empty">
              <Camera size={52} aria-hidden />
              <h2>
                Room for
                <br /> <em>the real thing.</em>
              </h2>
              <p>
                {finished
                  ? "No final photo was saved with this session. Its outcome reflects the recorded assessment."
                  : "Choose an actual photo of your result. A virtual preview can’t stand in for this moment."}
              </p>
              {!finished ? (
                <Button onClick={() => setCaptureOpen(true)}>
                  <Camera size={18} aria-hidden />
                  Capture my result
                </Button>
              ) : null}
            </div>
          )}
          {!isSample && !finished && (file || finalAsset || captureOpen) ? (
            <div className="review-capture-controls">
              <Button
                variant="secondary"
                onClick={() => {
                  setCaptureOpen(!captureOpen);
                  if (captureOpen) setFile(null);
                }}
              >
                {captureOpen
                  ? "Keep going without a new photo"
                  : "Choose another photo"}
              </Button>
            </div>
          ) : null}
          <div className="review-references">
            <div className="reference-thumb">
              <Image
                src={preview?.url || source?.url || look.image}
                alt={
                  preview
                    ? "Generated YouCam appearance reference"
                    : source?.provenance === "actual_capture"
                      ? "Your actual starting photo"
                      : "AI-created color inspiration"
                }
                width={180}
                height={220}
                unoptimized={!!preview || !!source}
              />
            </div>
            <div className="reference-label">
              <strong>
                {preview
                  ? "Your virtual color reference"
                  : source?.provenance === "actual_capture"
                    ? "Your starting reference"
                    : "Your color inspiration"}
              </strong>
              <ProvenanceLabel
                kind={
                  preview
                    ? "virtual_preview"
                    : source?.provenance || "synthetic_inspiration"
                }
                recordedAt={preview?.recordedAt}
              />
              <br />{" "}
              {preview
                ? "An appearance reference, not the physical outcome."
                : "No virtual preview is used as your result."}
            </div>
          </div>
        </div>
        <div className="review-form">
          {isSample ? (
            <div className="sample-completion">
              <Sparkles
                size={28}
                strokeWidth={1.3}
                aria-hidden
                style={{ color: "#6e875b", marginBottom: 20 }}
              />
              <h2>
                {finished ? (
                  <>
                    A walkthrough,
                    <br /> <em>not an outcome.</em>
                  </>
                ) : (
                  <>
                    You’ve seen
                    <br /> <em>another way.</em>
                  </>
                )}
              </h2>
              <p>
                The example portrait is synthetic. Exploring these steps does
                not represent actual makeup application or physical completion.
              </p>
              <p>
                Start your own studio with a photo and your choices when you’re
                ready.
              </p>
              <div className="button-row">
                {!finished ? (
                  <Button onClick={() => void finish()} busy={busy}>
                    Finish the walkthrough <Check size={17} aria-hidden />
                  </Button>
                ) : (
                  <ButtonLink href="/studio/new">
                    Start my own studio <ArrowRight size={17} aria-hidden />
                  </ButtonLink>
                )}
              </div>
              {finished && session.stage === "completed" ? (
                <Button
                  variant="secondary"
                  onClick={() => void studio.run({ type: "save_method" })}
                  disabled={session.savedMethod || busy}
                  style={{ marginTop: 15 }}
                >
                  {session.savedMethod ? (
                    <BookmarkCheck size={17} aria-hidden />
                  ) : (
                    <Bookmark size={17} aria-hidden />
                  )}
                  {session.savedMethod
                    ? "Sample method saved"
                    : "Save this sample method"}
                </Button>
              ) : null}
            </div>
          ) : session.outcome ? (
            <div className="outcome-saved">
              <p className="eyebrow">Your assessment is saved</p>
              <h2>
                {session.outcome.classification === "stopped" ? (
                  <>
                    You chose
                    <br /> <em>where to stop.</em>
                  </>
                ) : (
                  <>
                    Kept, just
                    <br /> <em>as you chose.</em>
                  </>
                )}
              </h2>
              <span className="badge">
                <Check size={13} aria-hidden />
                {outcomeLabels[session.outcome.classification]}
              </span>
              <dl className="outcome-summary">
                <div>
                  <dt>Your expression</dt>
                  <dd>
                    {session.outcome.classification === "stopped"
                      ? "Not assessed"
                      : session.outcome.satisfaction === "yes"
                        ? "Expresses my look"
                        : session.outcome.satisfaction === "partly"
                          ? "Partly expresses my look"
                          : "Not there yet"}
                  </dd>
                </div>
                <div>
                  <dt>Your comfort</dt>
                  <dd>{comfortLabels[session.outcome.comfort]}</dd>
                </div>
                <div>
                  <dt>Human assistance</dt>
                  <dd>{helpLabels[session.outcome.assistance]}</dd>
                </div>
                <div>
                  <dt>Your steps</dt>
                  <dd>{session.completedActionIds.length} user-confirmed</dd>
                </div>
              </dl>
              {session.outcome.note ? <p>{session.outcome.note}</p> : null}
              <p className="field-note">
                Your recorded assessment is kept separately from any AI
                observations.
              </p>
              {session.stage === "completed" ? (
                <Button
                  onClick={() => void studio.run({ type: "save_method" })}
                  disabled={session.savedMethod || busy}
                  busy={studio.busy}
                >
                  {session.savedMethod ? (
                    <BookmarkCheck size={18} aria-hidden />
                  ) : (
                    <Bookmark size={18} aria-hidden />
                  )}
                  {session.savedMethod
                    ? "Your method is saved"
                    : "Save my method"}
                </Button>
              ) : null}
              <div className="button-row" style={{ marginTop: 15 }}>
                <ButtonLink href="/methods" variant="quiet">
                  Go to your methods <ArrowRight size={16} aria-hidden />
                </ButtonLink>
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow">A moment for how it felt</p>
              <h2>
                How was
                <br /> <em>your way?</em>
              </h2>
              <p>
                Your choices describe this session. A result you accept with
                steps left is kept as a partial result.
              </p>
              <OutcomeQuestion
                title="Does your result express the look you wanted?"
                name="satisfaction"
                value={satisfaction}
                onChange={setSatisfaction}
                options={[
                  { value: "yes", label: "Yes, it does" },
                  { value: "partly", label: "Partly" },
                  { value: "not_yet", label: "Not yet" },
                ]}
              />
              <OutcomeQuestion
                title="How did the method feel?"
                name="comfort"
                value={comfort}
                onChange={setComfort}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "mixed", label: "A mix" },
                  { value: "difficult", label: "Difficult" },
                  { value: "not_assessed", label: "Not assessed" },
                ]}
              />
              <OutcomeQuestion
                title="Did someone help you?"
                name="assistance"
                value={assistance}
                onChange={setAssistance}
                options={[
                  { value: "none", label: "No help" },
                  { value: "verbal", label: "Verbal guidance" },
                  { value: "physical", label: "Hands-on help" },
                  { value: "not_assessed", label: "Not assessed" },
                ]}
              />
              <div className="form-field">
                <label htmlFor="outcome-note" className="label">
                  Anything to remember?
                  <span className="visually-required">Optional</span>
                </label>
                <textarea
                  className="textarea"
                  id="outcome-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  placeholder="A tool you liked, a movement to change, a moment that felt good…"
                />
              </div>
              <Button
                className="button--wide"
                onClick={() => void finish()}
                busy={busy}
              >
                <Heart size={18} aria-hidden />
                Save my result
              </Button>
              <p className="field-note">
                <ShieldCheck
                  size={13}
                  aria-hidden
                  style={{
                    display: "inline",
                    verticalAlign: "-2px",
                    marginRight: 5,
                  }}
                />
                Only the final still you choose is uploaded. A completed
                physical result requires all agreed steps and an actual final
                photo.
              </p>
            </>
          )}
          <div className="review-data-actions">
            <Button
              variant="quiet"
              onClick={() => setDeleteOpen(!deleteOpen)}
              disabled={busy}
            >
              <Trash2 size={15} aria-hidden />
              Delete this session
            </Button>
            <ButtonLink href="/settings/access#your-data" variant="quiet">
              Your data choices <ArrowRight size={14} aria-hidden />
            </ButtonLink>
          </div>
          {deleteOpen ? (
            <div className="delete-confirm">
              <h3>Delete this session?</h3>
              <p>
                STEADY will remove this session and its saved method, and queue
                deletion of its private photos. Photos already processed by
                YouCam follow the provider’s separate retention policy.
              </p>
              <div className="button-row">
                <Button
                  variant="danger"
                  onClick={() => void remove()}
                  busy={deleting}
                >
                  Yes, delete this session
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDeleteOpen(false)}
                  disabled={busy}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {session.activePlan ? (
        <details className="mirror-step-summary" style={{ marginTop: 40 }}>
          <summary>
            The method you chose <ArrowRight size={17} aria-hidden />
          </summary>
          <ActionList
            actions={session.activePlan.actions}
            completed={session.completedActionIds}
          />
          <DraftNote short />
        </details>
      ) : null}
    </div>
  );
}
