"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  Coffee,
  Hand,
  Heart,
  Leaf,
  LoaderCircle,
  Mic,
  Paintbrush,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TOOL_LABELS } from "@/lib/catalog";
import { uploadPhoto } from "@/lib/upload-client";
import type {
  CandidatePlan,
  Preferences,
  StudioSession,
} from "@/lib/contracts";
import { api, requestPreviews } from "@/lib/client";
import { applicationPreviewTarget } from "@/lib/planner";
import { displayInstruction } from "@/lib/instruction-copy";
import { useCheckpointMeasurement } from "./use-checkpoint-measurement";
import {
  CheckpointImage,
  HeatmapLegend,
  MeasurementVisual,
  RegionTarget,
} from "./measurement-visual";
import { StaticFaceGuide } from "./static-face-guide";
import { PreviewLadder } from "./preview-ladder";
import { ShoppingNote } from "./shopping-note";
import { stalledCheckpoint } from "@/lib/vision/measurement-guidance";
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
import { StillCapture, useCamera, usePhotoUrl } from "./camera";
import { MovementFields } from "./setup-wizard";
import { VoiceControls } from "./voice-controls";
import { useStudioSession } from "./use-studio-session";

const FaceGuide = dynamic(
  () => import("./face-guide").then((module) => module.FaceGuide),
  { ssr: false },
);

function MethodTargetRequest({
  candidate,
  pending,
  disabled,
  onGenerate,
}: {
  candidate: CandidatePlan;
  pending: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="method-target-request">
      {candidate.previewError ? (
        <p role="alert" className="small">
          {candidate.previewError}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={disabled || candidate.previewRetryable === false}
        busy={pending}
        onClick={onGenerate}
      >
        {pending ? "Preparing target…" : "Generate target"}
      </Button>
    </div>
  );
}

export function GuidedMirror({ id }: { id: string }) {
  const studio = useStudioSession(id);
  const {
    videoRef,
    active: cameraActive,
    starting: cameraStarting,
    cameraError,
    start: startCamera,
    stop: stopCamera,
  } = useCamera();
  const router = useRouter();
  const session = studio.session;
  const action = session?.activePlan?.actions.find(
    (item) => !session.completedActionIds.includes(item.id),
  );
  const actionId = action?.id;
  const instructionText = action ? displayInstruction(action) : undefined;
  const primaryInstruction = instructionText;
  const stoppingCueText = action?.region.endsWith("_eye")
    ? "Keep product out of the eye and off the waterline."
    : "";
  const [localPause, setLocalPause] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const controlsDialogRef = useRef<HTMLDialogElement>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [confirmedState, setConfirmedState] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointFile, setCheckpointFile] = useState<File | null>(null);
  const [checkpointRecorded, setCheckpointRecorded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [checkpointAssetId, setCheckpointAssetId] = useState<
    string | undefined
  >();
  const [localError, setLocalError] = useState("");
  const [clearAreaConfirmed, setClearAreaConfirmed] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);
  const [online, setOnline] = useState(true);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<Preferences | null>(
    null,
  );
  const [audioSupported, setAudioSupported] = useState(false);
  const checkedArrival = useRef(false);
  const instructionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const checkpointHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const stopHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const checkpointUrl = usePhotoUrl(checkpointFile);
  const isSample = session?.mode === "sample";
  const paused =
    !!session &&
    (session.stage === "paused" || localPause || session.resumeRequired);
  const adapting = adaptOpen || session?.stage === "adapting";
  const measurement = useCheckpointMeasurement({
    session,
    action,
    videoRef,
    cameraActive,
    enabled:
      !!session &&
      ["ready", "applying"].includes(session.stage) &&
      !paused &&
      !adapting &&
      !checkpointOpen,
  });
  const blocked =
    studio.busy || uploading || analyzing || measurement.measuring;
  const requestedPlan = session?.adaptation?.candidate ?? session?.activePlan;
  const refreshSession = studio.refresh;
  const pendingPreview =
    requestedPlan?.previewStatus === "queued" ||
    requestedPlan?.previewStatus === "processing";

  useEffect(() => {
    if (!pendingPreview || !online) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") await refreshSession();
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pendingPreview, requestedPlan?.id, online, refreshSession]);

  useEffect(() => {
    queueMicrotask(() => {
      setAudioSupported("speechSynthesis" in window);
      setOnline(navigator.onLine);
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      window.speechSynthesis?.cancel();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!session || checkedArrival.current) return;
    checkedArrival.current = true;
    queueMicrotask(() => {
      setDraftPreferences({
        ...session.preferences,
        movements: { ...session.preferences.movements },
      });
      if (session.stage === "applying") setLocalPause(true);
    });
  }, [session]);

  useEffect(() => {
    if (!audioSupported) return;
    window.speechSynthesis.cancel();
    if (
      session?.preferences.audio &&
      session.stage === "applying" &&
      !paused &&
      !adapting &&
      !checkpointOpen &&
      actionId
    ) {
      const speech = new SpeechSynthesisUtterance(
        `${instructionText} ${stoppingCueText}`,
      );
      speech.rate = 0.9;
      window.speechSynthesis.speak(speech);
    }
    return () => window.speechSynthesis.cancel();
  }, [
    audioSupported,
    actionId,
    instructionText,
    stoppingCueText,
    session?.preferences.audio,
    session?.stage,
    paused,
    adapting,
    checkpointOpen,
  ]);

  useEffect(() => {
    const dialog = controlsDialogRef.current;
    if (prefsOpen && dialog && !dialog.open) dialog.showModal();
    if (!prefsOpen && dialog?.open) dialog.close();
  }, [prefsOpen]);

  if (studio.loading) return <LoadingState>Opening your mirror…</LoadingState>;
  if (!session)
    return (
      <ErrorState
        message={studio.error || "This session couldn’t be found."}
        retry={() => void studio.refresh()}
      />
    );
  if (!session.activePlan)
    return (
      <div className="wrap page-wrap">
        <Notice title="Choose your starting method">
          Choose a method before opening the mirror.
        </Notice>
        <div className="button-row" style={{ marginTop: 25 }}>
          <ButtonLink href={`/studio/${id}/looks`}>
            See my methods <ArrowRight size={19} aria-hidden />
          </ButtonLink>
        </div>
      </div>
    );
  if (
    session.stage === "completed" ||
    session.stage === "reviewing" ||
    session.stage === "stopped"
  )
    return (
      <div className="wrap page-wrap">
        <div className="page-top">
          <BackLink href="/methods">Your methods</BackLink>
          <StepProgress active={3} />
        </div>
        <div className="empty-state">
          <Check
            size={36}
            strokeWidth={1.2}
            aria-hidden
            style={{ color: "#6d8759" }}
          />
          {isSample ? <SampleBadge /> : null}
          <h1 ref={instructionHeadingRef} tabIndex={-1}>
            Your review is ready
          </h1>
          <ButtonLink href={`/studio/${id}/review`}>
            View my result <ArrowRight size={19} aria-hidden />
          </ButtonLink>
        </div>
      </div>
    );

  const plan = session.activePlan;
  const finishedCount = plan.actions.filter((item) =>
    session.completedActionIds.includes(item.id),
  ).length;
  const observation = session.observations
    .filter((item) => item.actionId === action?.id)
    .at(-1);

  function stopSpeech() {
    window.speechSynthesis?.cancel();
  }
  function readStep() {
    if (!action || !audioSupported) return;
    stopSpeech();
    const speech = new SpeechSynthesisUtterance(
      `${displayInstruction(action)} ${stoppingCueText}`,
    );
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
  }
  async function pause() {
    stopSpeech();
    setLocalPause(true);
    setConfirmedState(false);
    setCheckpointOpen(false);
    requestAnimationFrame(() => {
      panelHeadingRef.current?.focus();
      panelHeadingRef.current?.scrollIntoView({ block: "nearest" });
    });
    if (session?.stage === "applying") await studio.run({ type: "pause" });
  }
  async function resume() {
    if (!isSample && !confirmedState) {
      setLocalError(
        "Confirm that the completed steps still describe your makeup before continuing.",
      );
      return;
    }
    if (session?.stage === "applying" && localPause) {
      const pausedSession = await studio.run({ type: "pause" });
      if (!pausedSession) return;
    }
    if (
      session?.stage === "paused" ||
      (session?.stage === "applying" && localPause)
    ) {
      const next = await studio.run({
        type: "resume",
        confirmedPhysicalState: true,
      });
      if (!next) return;
    }
    setLocalPause(false);
    setConfirmedState(false);
    setLocalError("");
    setHelpRequested(false);
    requestAnimationFrame(() => instructionHeadingRef.current?.focus());
  }
  async function openAdaptation(suggestedReason?: "tool") {
    stopSpeech();
    setLocalPause(true);
    setAdaptOpen(true);
    setCheckpointOpen(false);
    requestAnimationFrame(() => {
      panelHeadingRef.current?.focus();
      panelHeadingRef.current?.scrollIntoView({ block: "nearest" });
    });
    if (session?.stage === "applying") {
      const next = await studio.run({ type: "pause" });
      if (!next) return;
    }
    if (suggestedReason) await propose(suggestedReason);
  }
  async function propose(reason: "movement" | "tool" | "softer") {
    setLocalError("");
    await studio.run({ type: "propose_adaptation", reason });
  }
  async function acceptAdaptation() {
    if (!session?.adaptation) return;
    const next = await studio.run({
      type: "accept_adaptation",
      proposalId: session.adaptation.id,
    });
    if (next) {
      setAdaptOpen(false);
      setLocalPause(true);
      setConfirmedState(false);
    }
  }
  async function declineAdaptation() {
    const next = await studio.run({ type: "decline_adaptation" });
    if (next) {
      setAdaptOpen(false);
      setLocalPause(true);
    }
  }
  async function otherAdaptationChoices() {
    if (session?.adaptation) {
      const next = await studio.run({ type: "decline_adaptation" });
      if (!next) return;
    }
    setLocalPause(true);
    setAdaptOpen(true);
  }
  async function generateMethodTarget() {
    await studio.perform((current) => {
      const selected = applicationPreviewTarget(current);
      if (!selected)
        throw new Error(
          "Choose the remaining method before requesting its target.",
        );
      return requestPreviews(current, selected);
    });
  }
  async function recordMeasurement(reportedPass: boolean) {
    if (!action) return;
    const measured = await measurement.measureNow(reportedPass);
    if (measured) {
      setCheckpointFile(measured.file ?? null);
      setCheckpointAssetId(undefined);
      const next = await studio.run({
        type: "checkpoint",
        actionId: action.id,
        measurement: measured.measurement,
      });
      if (next) setCheckpointRecorded(true);
    }
  }
  async function checkStep() {
    measurement.clearCheckpoint();
    setShowHeatmap(true);
    setLocalError("");
    stopSpeech();
    setCheckpointRecorded(false);
    setCheckpointFile(null);
    setAiConsent(false);
    setCheckpointAssetId(undefined);
    setCheckpointOpen(true);
    requestAnimationFrame(() => {
      checkpointHeadingRef.current?.focus();
      checkpointHeadingRef.current?.scrollIntoView({ block: "nearest" });
    });
    if (isSample || cameraActive) await recordMeasurement(false);
  }
  async function saveCheckpoint() {
    if (!action || !session || uploading) return;
    if (!checkpointFile) {
      setLocalError(
        "Choose a checkpoint photo first, or use your judgment without uploading a still.",
      );
      return;
    }
    setUploading(true);
    setLocalError("");
    try {
      const assetId =
        checkpointAssetId ||
        (await uploadPhoto(checkpointFile, id, "checkpoint")).id;
      setCheckpointAssetId(assetId);
      await studio.refresh();
      const next = await studio.run({
        type: "checkpoint",
        actionId: action.id,
        assetId,
      });
      if (next) setCheckpointRecorded(true);
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "The checkpoint wasn’t saved. Your step is still here.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function analyzeCheckpoint() {
    if (!action || !checkpointFile || !aiConsent || blocked) return;
    setAnalyzing(true);
    setLocalError("");
    try {
      const assetId =
        checkpointAssetId ||
        (await uploadPhoto(checkpointFile, id, "checkpoint")).id;
      setCheckpointAssetId(assetId);
      const current = await studio.refresh();
      if (!current || current.stage !== "applying")
        throw new Error(
          "The studio is paused. Continue when you’re ready, then request a fresh checkpoint.",
        );
      await api<StudioSession>(
        `/api/sessions/${encodeURIComponent(id)}/checkpoint-analysis`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: current.revision,
            actionId: action.id,
            assetId,
            consent: true,
            measurement: measurement.summary ?? undefined,
          }),
        },
      );
      const next = await studio.refresh();
      if (next?.stage === "applying") setCheckpointRecorded(true);
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "The AI couldn’t assess this still. You can continue using your own judgment.",
      );
    } finally {
      setAnalyzing(false);
    }
  }
  async function completeStep() {
    if (!action) return;
    stopSpeech();
    const next = await studio.run({
      type: "complete_action",
      actionId: action.id,
    });
    if (next) {
      setCheckpointOpen(false);
      setCheckpointFile(null);
      setCheckpointRecorded(false);
      if (next.stage === "reviewing") {
        stopCamera();
        router.push(`/studio/${id}/review`);
      } else
        requestAnimationFrame(() => instructionHeadingRef.current?.focus());
    }
  }
  async function review() {
    stopSpeech();
    const next = await studio.run({ type: "review" });
    if (next) {
      stopCamera();
      router.push(`/studio/${id}/review`);
    }
  }
  async function stopSession() {
    stopSpeech();
    const next = await studio.run({ type: "stop" });
    if (next) {
      stopCamera();
      router.push(`/studio/${id}/review`);
    }
  }
  async function savePreferences() {
    if (!draftPreferences) return;
    stopSpeech();
    const next = await studio.run({
      type: "set_preferences",
      preferences: draftPreferences,
    });
    if (next) {
      setPrefsOpen(false);
      setLocalPause(next.stage === "paused");
    }
  }
  function openStopConfirmation() {
    stopSpeech();
    setStopConfirm(true);
    requestAnimationFrame(() => {
      stopHeadingRef.current?.focus();
      stopHeadingRef.current?.scrollIntoView({ block: "nearest" });
    });
  }
  async function handleVoice(
    command: "pause" | "repeat" | "check" | "help" | "next" | "stop",
  ) {
    setPrefsOpen(false);
    if (command === "pause") {
      await pause();
      return;
    }
    if (command === "repeat") {
      if (audioSupported) readStep();
      else
        setLocalError(
          "Spoken instructions aren’t available in this browser. The current instruction is shown as text.",
        );
      return;
    }
    if (command === "stop") {
      openStopConfirmation();
      return;
    }
    if (command === "help") {
      if (session?.stage === "applying" || session?.stage === "paused")
        await openAdaptation();
      else
        setLocalError(
          "Choose your method or finish reviewing the proposed change before asking for another way.",
        );
      return;
    }
    if (command === "check") {
      if (
        session?.stage === "applying" &&
        !paused &&
        !adapting &&
        !analyzing &&
        action
      )
        await checkStep();
      else
        setLocalError(
          "Start or resume your method, then ask to check the current step.",
        );
      return;
    }
    if (command === "next") {
      if (
        session?.stage === "applying" &&
        !paused &&
        !adapting &&
        !analyzing &&
        action
      )
        await completeStep();
      else
        setLocalError(
          "Start or resume your current step before saying “next”.",
        );
    }
  }

  const eyeStep =
    action?.region === "left_eye" || action?.region === "right_eye";
  const showingCheckpoint = checkpointOpen && action && !paused && !adapting;
  const stalled = action && stalledCheckpoint(session, action.id);
  return (
    <div className="wrap mirror-page r3-mirror">
      <div className="page-top">
        <BackLink href={`/studio/${id}/looks`}>Your methods</BackLink>
        <StepProgress active={2} compact />
      </div>
      <div className="mirror-title-row">
        <div className="page-intro">
          {isSample ? <SampleBadge /> : null}
          <h1>Mirror</h1>
        </div>
        <Button
          variant="secondary"
          onClick={() => void pause()}
          disabled={blocked || session.stage === "ready" || paused || adapting}
        >
          <Pause size={16} aria-hidden />
          Pause
        </Button>
      </div>
      {!online ? (
        <Notice kind="error" title="You’re offline">
          Changes can’t be saved until you reconnect.
        </Notice>
      ) : null}
      <div
        className={`mirror-layout ${session.preferences.hand === "left" ? "mirror-layout--left" : ""} ${session.stage === "applying" && !paused && !adapting && action ? "mirror-layout--applying" : ""} ${showingCheckpoint ? "mirror-layout--checkpoint" : ""}`}
      >
        <div className="mirror-view">
          {cameraActive ? (
            <>
              <video
                ref={videoRef}
                className={session.preferences.mirror ? "is-mirrored" : ""}
                autoPlay
                muted
                playsInline
                aria-label={
                  session.preferences.mirror
                    ? "Live camera in mirror view, unretouched"
                    : "Live camera in photo view, unretouched"
                }
              />
              {action ? (
                <FaceGuide
                  videoRef={videoRef}
                  enabled={
                    !paused &&
                    !adapting &&
                    !checkpointOpen &&
                    ["ready", "applying"].includes(session.stage)
                  }
                  onTracking={measurement.onTracking}
                  region={action.region}
                  mirrored={session.preferences.mirror}
                />
              ) : null}
              <div className="mirror-top-controls" hidden={!!showingCheckpoint}>
                <span className="mirror-camera-status">
                  <span />
                  Live
                </span>
                <button
                  className="mirror-icon-button"
                  onClick={stopCamera}
                  aria-label="Turn camera off"
                >
                  <CameraOff size={20} aria-hidden />
                </button>
              </div>
            </>
          ) : isSample ? (
            <>
              <Image
                className="mirror-sample-image"
                src="/images/studio-portrait.jpg"
                alt="AI-created adult portrait for the sample walkthrough"
                width={1024}
                height={1280}
                sizes="(max-width: 740px) 94vw, 60vw"
              />
              {action &&
              measurement.source?.eligible &&
              !paused &&
              !adapting &&
              !checkpointOpen ? (
                <StaticFaceGuide
                  points={measurement.source.landmarks}
                  region={action.region}
                  width={measurement.source.image.width}
                  height={measurement.source.image.height}
                />
              ) : null}
            </>
          ) : (
            <div className="mirror-camera-placeholder">
              <Camera size={48} aria-hidden />
              <h2>Open your mirror</h2>
              <p>Prop up your device. Face a soft light.</p>
              <Button
                variant="secondary"
                onClick={() => void startCamera()}
                busy={cameraStarting}
              >
                <Camera size={18} aria-hidden />
                Open my camera
              </Button>
            </div>
          )}
          {showingCheckpoint && measurement.checkpoint ? (
            <div
              className={`mirror-checkpoint-layer ${cameraActive && session.preferences.mirror ? "is-mirrored" : ""}`}
            >
              <CheckpointImage
                local={measurement.checkpoint}
                heatmap={showHeatmap}
                full
              />
            </div>
          ) : null}
          {plan.previewAsset && action && !adapting ? (
            <div className="mirror-target-inset">
              <RegionTarget
                asset={plan.previewAsset}
                landmarks={measurement.source?.landmarks ?? []}
                region={action.region}
                level={plan.selectedPreviewVariantId ?? "full"}
              />
            </div>
          ) : null}
          {showingCheckpoint &&
          measurement.checkpoint?.result.heatmap.length ? (
            <div className="mirror-heatmap-control">
              <button
                type="button"
                className="mirror-heatmap-toggle"
                aria-pressed={showHeatmap}
                onClick={() => setShowHeatmap(!showHeatmap)}
              >
                {showHeatmap ? "Hide heatmap" : "Show heatmap"}
              </button>
              {showHeatmap ? <HeatmapLegend compact /> : null}
            </div>
          ) : null}
          {cameraError ? (
            <div className="camera-permission-error" role="alert">
              {cameraError}
            </div>
          ) : null}
          {paused && !adapting ? (
            <div className="pause-state-scrim" aria-hidden>
              <Pause size={35} strokeWidth={1.2} aria-hidden />
            </div>
          ) : null}
        </div>
        <section
          className={`instruction-panel ${adapting ? "adapt-panel" : ""}`}
          aria-label="Current makeup instruction"
        >
          {adapting ? (
            <>
              <div className="instruction-scroll">
                <h2 ref={panelHeadingRef} tabIndex={-1}>
                  Make this easier
                </h2>
                {session.adaptation ? (
                  <>
                    <h3>{session.adaptation.candidate.name}</h3>
                    <p>
                      {session.adaptation.preservedActionIds.length} confirmed;{" "}
                      {session.adaptation.removedActionIds.length} remaining{" "}
                      {session.adaptation.removedActionIds.length === 1
                        ? "step changes."
                        : "steps change."}
                    </p>
                    {session.adaptation.productChangeNote ? (
                      <Notice>
                        {session.lookId === "eyes"
                          ? "Liner and shadow: the two sides may differ."
                          : "Cream and powder may look different on each side."}
                      </Notice>
                    ) : null}
                    {session.adaptation.changesGoal ? (
                      <p>
                        {session.adaptation.reason === "softer"
                          ? "This changes your target to Light."
                          : "This changes your eye finish."}
                      </p>
                    ) : null}
                    {session.adaptation.candidate.previewAsset && action ? (
                      <RegionTarget
                        asset={session.adaptation.candidate.previewAsset}
                        landmarks={measurement.source?.landmarks ?? []}
                        region={action.region}
                        level={
                          session.adaptation.candidate
                            .selectedPreviewVariantId ?? "full"
                        }
                      />
                    ) : (
                      <p className="small">Preview not ready yet.</p>
                    )}
                    {session.mode === "personal" &&
                    applicationPreviewTarget(session) &&
                    !session.adaptation.candidate.previewAsset ? (
                      <MethodTargetRequest
                        candidate={session.adaptation.candidate}
                        pending={pendingPreview}
                        disabled={blocked || !online}
                        onGenerate={() => void generateMethodTarget()}
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    {session.conflicts.length ? (
                      <Notice>
                        {session.conflicts.map((conflict) => (
                          <p key={conflict.code}>
                            {conflict.message} {conflict.resolution}
                          </p>
                        ))}
                      </Notice>
                    ) : null}
                    <div className="adapt-options">
                      <button
                        className="adapt-option"
                        onClick={() => void propose("movement")}
                        disabled={blocked}
                      >
                        <Hand size={20} aria-hidden />A different movement
                        <ArrowRight size={16} aria-hidden />
                      </button>
                      <button
                        className="adapt-option"
                        onClick={() => void propose("tool")}
                        disabled={blocked}
                      >
                        <Paintbrush size={20} aria-hidden />A different tool
                        <ArrowRight size={16} aria-hidden />
                      </button>
                      <button
                        className="adapt-option"
                        onClick={() => void propose("softer")}
                        disabled={blocked}
                      >
                        <Leaf size={20} aria-hidden />A softer version
                        <ArrowRight size={16} aria-hidden />
                      </button>
                      <button
                        className="adapt-option"
                        onClick={() => {
                          setAdaptOpen(false);
                          setLocalPause(true);
                        }}
                        disabled={blocked}
                      >
                        <Coffee size={20} aria-hidden />
                        Just a rest
                        <ArrowRight size={16} aria-hidden />
                      </button>
                      <button
                        className="adapt-option"
                        onClick={() => {
                          setHelpRequested(true);
                          setAdaptOpen(false);
                          setLocalPause(true);
                        }}
                        disabled={blocked}
                      >
                        <Heart size={20} aria-hidden />
                        Help from someone
                        <ArrowRight size={16} aria-hidden />
                      </button>
                      <button
                        className="adapt-option"
                        onClick={() => void review()}
                        disabled={blocked}
                      >
                        <Check size={20} aria-hidden />
                        Finish here
                        <ArrowRight size={16} aria-hidden />
                      </button>
                    </div>
                  </>
                )}
                {studio.busy ? (
                  <p className="small" role="status">
                    <LoaderCircle className="spin" size={17} aria-hidden />
                    Checking changes…
                  </p>
                ) : null}
              </div>
              <div className="instruction-control-dock">
                {session.adaptation ? (
                  <div className="instruction-buttons">
                    <Button
                      onClick={() => void acceptAdaptation()}
                      busy={studio.busy}
                    >
                      Use this change <ArrowRight size={17} aria-hidden />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void otherAdaptationChoices()}
                      disabled={blocked}
                    >
                      Other changes
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => void declineAdaptation()}
                      disabled={blocked}
                    >
                      Keep my previous method
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="quiet"
                    onClick={() => setAdaptOpen(false)}
                    disabled={blocked}
                  >
                    <ArrowLeft size={16} aria-hidden />
                    Back to my pause
                  </Button>
                )}
              </div>
            </>
          ) : paused ? (
            <div className="pause-panel">
              <Coffee size={28} aria-hidden />
              <h2 ref={panelHeadingRef} tabIndex={-1}>
                Paused
              </h2>
              {helpRequested ? <p>Ask someone you trust for help.</p> : null}
              {!isSample ? (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={confirmedState}
                    onChange={(event) =>
                      setConfirmedState(event.target.checked)
                    }
                  />
                  <span>The confirmed steps still match my makeup.</span>
                </label>
              ) : null}
              <Button
                onClick={() => void resume()}
                busy={studio.busy}
                disabled={blocked || (!isSample && !confirmedState)}
              >
                <Play size={17} aria-hidden />
                {isSample ? "Continue sample" : "Continue at my pace"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void openAdaptation()}
                disabled={blocked}
              >
                Make this easier
              </Button>
            </div>
          ) : session.stage === "ready" ? (
            <div className="all-done">
              <Hand size={39} strokeWidth={1.1} aria-hidden />
              <h2>Ready to begin?</h2>
              <p>
                Have your{" "}
                {plan.tools
                  .map((tool) => TOOL_LABELS[tool].toLowerCase())
                  .join(" and ")}{" "}
                nearby.
              </p>
              <Button
                onClick={() => void studio.run({ type: "start" })}
                busy={studio.busy}
              >
                Begin {isSample ? "the walkthrough" : "my method"}
                <ArrowRight size={18} aria-hidden />
              </Button>
            </div>
          ) : !action ? (
            <div className="all-done">
              <Check size={42} strokeWidth={1.2} aria-hidden />
              <h2>Steps complete</h2>
              <Button onClick={() => void review()} busy={studio.busy}>
                Review my result
                <ArrowRight size={18} aria-hidden />
              </Button>
            </div>
          ) : (
            <>
              <div className="instruction-scroll">
                <div className="instruction-top">
                  <span className="step-label sr-only">
                    Step {String(finishedCount + 1).padStart(2, "0")} of{" "}
                    {String(plan.actions.length).padStart(2, "0")}
                  </span>
                  <div className="step-dots" aria-hidden>
                    {plan.actions.map((item) => (
                      <span
                        key={item.id}
                        className={
                          session.completedActionIds.includes(item.id)
                            ? "is-complete"
                            : item.id === action.id
                              ? "is-active"
                              : ""
                        }
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="read-step-button"
                    aria-label="Read this step"
                    onClick={readStep}
                    disabled={!audioSupported || blocked}
                  >
                    <Volume2 size={20} aria-hidden />
                  </button>
                </div>
                {showingCheckpoint ? (
                  <section
                    className="checkpoint-panel"
                    aria-label="Your checkpoint"
                  >
                    <div className="checkpoint-heading">
                      <h2 ref={checkpointHeadingRef} tabIndex={-1}>
                        Checkpoint
                      </h2>
                      <Button
                        variant="quiet"
                        aria-label="Close checkpoint"
                        disabled={blocked}
                        onClick={() => {
                          setCheckpointOpen(false);
                          setCheckpointFile(null);
                        }}
                      >
                        <X size={18} aria-hidden />
                      </Button>
                    </div>
                    {measurement.measuring ? (
                      <p role="status">
                        <LoaderCircle size={18} className="spin" aria-hidden />
                        Measuring…
                      </p>
                    ) : null}
                    {measurement.summary ? (
                      <MeasurementVisual
                        measurement={measurement.summary}
                        local={measurement.checkpoint}
                        action={action}
                        targetAsset={plan.previewAsset}
                        showImages={false}
                      />
                    ) : checkpointUrl ? (
                      <div className="checkpoint-still">
                        <Image
                          src={checkpointUrl}
                          width={1200}
                          height={1200}
                          unoptimized
                          alt="Your selected checkpoint photo"
                        />
                      </div>
                    ) : !isSample ? (
                      <StillCapture
                        file={checkpointFile}
                        onSelected={(file) => {
                          setCheckpointFile(file);
                          setAiConsent(false);
                          setCheckpointAssetId(undefined);
                        }}
                        label="Add a checkpoint photo"
                        showGuidelines={false}
                      />
                    ) : null}
                    {observation?.method === "vision_assistant_v1" ? (
                      <div className="second-opinion">
                        <strong>Second opinion</strong>
                        <p>{observation.reason}</p>
                      </div>
                    ) : null}
                    {!isSample && checkpointFile ? (
                      <details className="second-opinion-options">
                        <summary>Ask for a second opinion</summary>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={aiConsent}
                            onChange={(event) =>
                              setAiConsent(event.target.checked)
                            }
                            disabled={blocked}
                          />
                          <span>Send this still to Gemini or OpenAI.</span>
                        </label>
                        <div className="button-row">
                          <Button
                            variant="secondary"
                            onClick={() => void analyzeCheckpoint()}
                            busy={analyzing}
                            disabled={!aiConsent || studio.busy || uploading}
                          >
                            <Sparkles size={17} aria-hidden />
                            Ask AI about this step
                          </Button>
                          {!measurement.summary ? (
                            <Button
                              variant="secondary"
                              onClick={() => void saveCheckpoint()}
                              busy={uploading}
                              disabled={blocked}
                            >
                              Save checkpoint photo
                            </Button>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </section>
                ) : (
                  <>
                    <h2
                      key={action.id}
                      ref={instructionHeadingRef}
                      tabIndex={-1}
                    >
                      {primaryInstruction}
                    </h2>
                    {eyeStep ? (
                      <p className="stopping-cue">
                        Keep product out of the eye and off the waterline.
                      </p>
                    ) : null}
                    {!plan.previewAsset ? (
                      <div>
                        {applicationPreviewTarget(session) ? (
                          <MethodTargetRequest
                            candidate={plan}
                            pending={pendingPreview}
                            disabled={blocked || !online}
                            onGenerate={() => void generateMethodTarget()}
                          />
                        ) : (
                          <p className="small">No target yet.</p>
                        )}
                      </div>
                    ) : null}
                    <PreviewLadder
                      candidate={plan}
                      compact
                      disabled={blocked}
                      onChoose={(level) =>
                        void studio.run({
                          type: "select_preview_level",
                          candidateId: plan.id,
                          level,
                        })
                      }
                    />
                    {!isSample && cameraActive ? (
                      <div className="baseline-status" role="status">
                        <strong>
                          {measurement.baselineReady
                            ? "✓ Baseline captured"
                            : measurement.baselineBlocked
                              ? "Original baseline is no longer in memory"
                              : "Hold still · capturing baseline"}
                        </strong>
                        {measurement.baselineBlocked ||
                        measurement.baselineReady ? (
                          <details>
                            <summary>Start the baseline again</summary>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={clearAreaConfirmed}
                                onChange={(event) =>
                                  setClearAreaConfirmed(event.target.checked)
                                }
                              />
                              <span>
                                I haven’t applied product to this area yet.
                              </span>
                            </label>
                            <Button
                              variant="secondary"
                              disabled={!clearAreaConfirmed || blocked}
                              onClick={() => {
                                measurement.resetBaseline();
                                setClearAreaConfirmed(false);
                              }}
                            >
                              Capture a new baseline
                            </Button>
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
                {stalled ? (
                  <Notice title="A broader tool may help">
                    Your recent readings changed very little.
                    <Button
                      variant="secondary"
                      onClick={() => void openAdaptation("tool")}
                    >
                      Try a broader tool
                    </Button>
                  </Notice>
                ) : null}
              </div>
              <div className="instruction-control-dock">
                <div className="instruction-buttons">
                  <Button
                    onClick={() => void completeStep()}
                    disabled={blocked || !online}
                  >
                    Done with this step
                    <ArrowRight size={18} aria-hidden />
                  </Button>
                  {showingCheckpoint ? (
                    (isSample || cameraActive) && (
                      <Button
                        variant="secondary"
                        disabled={blocked || measurement.preparing}
                        onClick={() =>
                          void recordMeasurement(checkpointRecorded)
                        }
                        aria-label={
                          checkpointRecorded
                            ? "I made a pass · check again"
                            : "Check again"
                        }
                      >
                        Check again
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => void checkStep()}
                      disabled={blocked || (isSample && measurement.preparing)}
                    >
                      <Camera size={18} aria-hidden />
                      {isSample
                        ? measurement.preparing
                          ? "Preparing…"
                          : "Measure the sample"
                        : "Measure this step"}
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    onClick={() => void openAdaptation()}
                    disabled={blocked}
                  >
                    Make this easier
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {studio.error || localError || measurement.error ? (
        <div className="mirror-message">
          <Notice kind="error">
            {localError || studio.error || measurement.error}
          </Notice>
        </div>
      ) : null}
      {stopConfirm ? (
        <div className="delete-confirm">
          <h3 ref={stopHeadingRef} tabIndex={-1}>
            End here?
          </h3>
          <div className="button-row">
            <Button
              variant="danger"
              onClick={() => void stopSession()}
              busy={studio.busy}
            >
              End without a result
            </Button>
            <Button
              variant="secondary"
              onClick={() => setStopConfirm(false)}
              disabled={blocked}
            >
              Keep my session open
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mirror-support">
        <Button
          variant="quiet"
          onClick={() => {
            setDraftPreferences({
              ...session.preferences,
              movements: { ...session.preferences.movements },
            });
            setPrefsOpen(true);
          }}
        >
          <SlidersHorizontal size={15} aria-hidden />
          Comfort &amp; controls
          {voiceEnabled ? <Mic size={16} aria-label="Microphone on" /> : null}
        </Button>
      </div>
      {draftPreferences ? (
        <dialog
          className="controls-drawer"
          ref={controlsDialogRef}
          aria-labelledby="controls-title"
          onCancel={() => setPrefsOpen(false)}
        >
          <div className="drawer-heading">
            <h2 id="controls-title">Comfort &amp; controls</h2>
            <Button
              variant="quiet"
              onClick={() => setPrefsOpen(false)}
              aria-label="Close controls"
            >
              <X size={20} aria-hidden />
            </Button>
          </div>
          <MovementFields
            preferences={draftPreferences}
            onChange={setDraftPreferences}
          />
          <div className="preference-row">
            <label className="label" htmlFor="mirror-toggle">
              Mirror view
            </label>
            <label className="switch">
              <input
                id="mirror-toggle"
                type="checkbox"
                checked={draftPreferences.mirror}
                onChange={(event) =>
                  setDraftPreferences({
                    ...draftPreferences,
                    mirror: event.target.checked,
                  })
                }
              />
              <span />
            </label>
          </div>
          <div className="preference-row">
            <label className="label" htmlFor="audio-toggle">
              Read each instruction
            </label>
            <label className="switch">
              <input
                id="audio-toggle"
                type="checkbox"
                checked={draftPreferences.audio}
                disabled={!audioSupported}
                onChange={(event) =>
                  setDraftPreferences({
                    ...draftPreferences,
                    audio: event.target.checked,
                  })
                }
              />
              <span />
            </label>
          </div>
          <VoiceControls
            contextKey={`${session.revision}:${action?.id || "none"}:${paused}:${checkpointOpen}:${checkpointRecorded}:${analyzing}`}
            blocked={blocked || !online}
            onCommand={handleVoice}
            onEnabledChange={setVoiceEnabled}
          />
          <ShoppingNote
            plan={plan}
            lookId={session.lookId}
            completed={session.completedActionIds}
          />
          <div className="button-row">
            <Button onClick={() => void savePreferences()} busy={studio.busy}>
              Save my controls
            </Button>
            <Button variant="quiet" onClick={() => setPrefsOpen(false)}>
              Close
            </Button>
          </div>
        </dialog>
      ) : null}
      {session.preferences.pace === "offer_breaks" &&
      finishedCount > 0 &&
      !paused &&
      !adapting ? (
        <div className="mirror-message">
          <Button
            variant="secondary"
            onClick={() => void pause()}
            disabled={blocked}
          >
            <Coffee size={17} aria-hidden />
            Take a break
          </Button>
        </div>
      ) : null}
    </div>
  );
}
