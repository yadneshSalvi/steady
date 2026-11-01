"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Camera,
  Check,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Outcome } from "@/lib/contracts";
import { LOOKS, TOOL_LABELS } from "@/lib/catalog";
import { deleteSession } from "@/lib/client";
import { uploadPhoto } from "@/lib/upload-client";
import { StillCapture, usePhotoUrl } from "./camera";
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
import { CheckpointHistory } from "./checkpoint-history";
import { ShoppingNote } from "./shopping-note";

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

  if (studio.loading) return <LoadingState>Opening your result…</LoadingState>;
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
          Continue your method, or choose Make this easier → Finish here.
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
      return next;
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
  async function saveMethod() {
    if (busy || session?.savedMethod) return;
    if (!finished && !(await finish())) return;
    await studio.run({ type: "save_method" });
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

  const changes = session.events.filter(
    (event) => event.type === "accept_adaptation",
  ).length;
  const methodTools = [
    ...new Set(
      session.activePlan?.actions.map((action) => TOOL_LABELS[action.tool]) ??
        [],
    ),
  ];
  const canSave =
    session.stage !== "stopped" && (isSample || !!session.outcome);
  return (
    <div className="wrap page-wrap review-page r3-review">
      <div className="page-top">
        <BackLink href={finished ? "/methods" : `/studio/${id}/mirror`}>
          {finished ? "Your methods" : "Your mirror"}
        </BackLink>
        <StepProgress active={3} />
      </div>
      <div className="review-title-row">
        <div className="page-intro">
          {isSample ? <SampleBadge /> : null}
          <h1>Review</h1>
        </div>
        {canSave ? (
          <div className="review-primary-actions">
            <Button
              onClick={() => void saveMethod()}
              disabled={session.savedMethod || busy}
              busy={studio.busy}
            >
              {session.savedMethod ? (
                <BookmarkCheck size={18} aria-hidden />
              ) : (
                <Bookmark size={18} aria-hidden />
              )}
              {session.savedMethod ? "Method saved" : "Save my method"}
            </Button>
            {finished ? (
              <ButtonLink href="/methods" variant="secondary">
                Finish
              </ButtonLink>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void finish()}
                disabled={busy}
              >
                Finish
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {studio.error || localError ? (
        <Notice kind="error">{localError || studio.error}</Notice>
      ) : null}
      <div className="review-summary-grid">
        <figure className="review-reference">
          <figcaption>Before</figcaption>
          <Image
            src={source?.url || look.image}
            alt={
              source?.provenance === "actual_capture"
                ? "Your actual starting photo"
                : "Fictional adult sample portrait before YouCam rendering"
            }
            width={source?.width || 1024}
            height={source?.height || 1280}
            sizes="(max-width: 740px) 42vw, 240px"
            unoptimized={source?.provenance === "actual_capture"}
          />
        </figure>
        <ArrowRight className="review-flow-arrow" size={24} aria-hidden />
        <figure className="review-reference">
          <figcaption>{preview ? "Target" : "Color inspiration"}</figcaption>
          <Image
            src={preview?.url || look.image}
            alt={
              preview
                ? "Generated YouCam appearance reference"
                : "AI-created color inspiration"
            }
            width={preview?.width || 1024}
            height={preview?.height || 1280}
            sizes="(max-width: 740px) 42vw, 240px"
            unoptimized={!!preview && !preview.recordedAt}
          />
        </figure>
        <CheckpointHistory session={session} />
      </div>
      {session.activePlan ? (
        <p className="review-method-diff">
          {changes
            ? `${methodTools.join(" → ")} · ${changes} method ${changes === 1 ? "change" : "changes"}`
            : session.activePlan.name}
        </p>
      ) : null}
      {!isSample ? (
        <div className="review-personal-grid">
          <div className="review-visual">
            {captureOpen && !finished ? (
              <StillCapture
                file={file}
                onSelected={setFile}
                label="Choose your actual final photo"
              />
            ) : fileUrl || finalAsset ? (
              <figure className="review-final-photo">
                <Image
                  src={fileUrl || finalAsset!.url}
                  alt="Your selected actual final makeup photo"
                  width={finalAsset?.width || 1024}
                  height={finalAsset?.height || 1280}
                  unoptimized
                />
                <figcaption>Your result</figcaption>
              </figure>
            ) : (
              <div className="review-capture-empty">
                <Camera size={36} aria-hidden />
                <p>No final photo saved.</p>
                {!finished ? (
                  <Button
                    variant="secondary"
                    onClick={() => setCaptureOpen(true)}
                  >
                    Capture my result
                  </Button>
                ) : null}
              </div>
            )}
            {!finished && (file || finalAsset || captureOpen) ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setCaptureOpen(!captureOpen);
                  if (captureOpen) setFile(null);
                }}
              >
                {captureOpen
                  ? "Continue without a new photo"
                  : "Choose another photo"}
              </Button>
            ) : null}
          </div>
          <div className="review-form">
            {session.outcome ? (
              <div className="outcome-saved">
                <span className="badge">
                  <Check size={14} aria-hidden />
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
                    <dd>{session.completedActionIds.length} confirmed</dd>
                  </div>
                </dl>
                {session.outcome.note ? <p>{session.outcome.note}</p> : null}
              </div>
            ) : (
              <>
                <h2>Your assessment</h2>
                <OutcomeQuestion
                  title="Does this express your look?"
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
                    Anything to remember?{" "}
                    <span className="visually-required">Optional</span>
                  </label>
                  <textarea
                    className="textarea"
                    id="outcome-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={1000}
                  />
                </div>
                <Button onClick={() => void finish()} busy={busy}>
                  Save my result
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {session.activePlan ? (
        <ShoppingNote
          plan={session.activePlan}
          lookId={session.lookId}
          completed={session.completedActionIds}
        />
      ) : null}
      <div className="review-data-actions">
        <Button
          variant="quiet"
          onClick={() => setDeleteOpen(!deleteOpen)}
          disabled={busy}
        >
          <Trash2 size={15} aria-hidden />
          Delete this session
        </Button>
      </div>
      {deleteOpen ? (
        <div className="delete-confirm">
          <h3>Delete this session?</h3>
          <p>Removes this session, its method and its photos.</p>
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
  );
}
