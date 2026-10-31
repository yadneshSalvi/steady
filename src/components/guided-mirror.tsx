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
  ChevronDown,
  Coffee,
  Hand,
  Heart,
  Leaf,
  LoaderCircle,
  Paintbrush,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOOKS, PRODUCT_LABELS, TOOL_LABELS } from "@/lib/catalog";
import { uploadPhoto } from "@/lib/upload-client";
import type { Preferences, StudioSession } from "@/lib/contracts";
import { api } from "@/lib/client";
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
import { StillCapture, useCamera, usePhotoUrl } from "./camera";
import { MovementFields } from "./setup-wizard";
import { VoiceControls } from "./voice-controls";
import { useStudioSession } from "./use-studio-session";

const FaceGuide = dynamic(
  () => import("./face-guide").then((module) => module.FaceGuide),
  { ssr: false },
);

export function GuidedMirror({ id }: { id: string }) {
  const studio = useStudioSession(id);
  const {
    videoRef,
    active: cameraActive,
    starting: cameraStarting,
    cameraError,
    start: startCamera,
    stop: stopCamera,
    capture: capturePhoto,
  } = useCamera();
  const router = useRouter();
  const session = studio.session;
  const action = session?.activePlan?.actions.find(
    (item) => !session.completedActionIds.includes(item.id),
  );
  const actionId = action?.id;
  const instructionText = action?.instruction;
  const instructionBreak = instructionText?.indexOf(". ") ?? -1;
  const primaryInstruction =
    instructionBreak > 0
      ? instructionText?.slice(0, instructionBreak + 1)
      : instructionText;
  const supportingInstruction =
    instructionBreak > 0 ? instructionText?.slice(instructionBreak + 2) : "";
  const stoppingCueText = action?.stoppingCue;
  const [localPause, setLocalPause] = useState(false);
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
  const blocked = studio.busy || uploading || analyzing;

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

  if (studio.loading)
    return <LoadingState>Finding the last step you confirmed…</LoadingState>;
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
          Your look is saved. Choose a method before opening the guided mirror.
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
          <p className="eyebrow">
            {session.mode === "sample"
              ? "A sample, clearly labeled"
              : "Your session is kept"}
          </p>
          <h1 className="serif" ref={instructionHeadingRef} tabIndex={-1}>
            A moment
            <br /> <em>for your result.</em>
          </h1>
          <p>
            {session.mode === "sample"
              ? "You’ve explored your method. Review this synthetic walkthrough, or start your own studio when you’re ready."
              : "Take a little space to decide how you feel. Your actual photo and your assessment belong to you."}
          </p>
          <ButtonLink href={`/studio/${id}/review`}>
            View my result <ArrowRight size={19} aria-hidden />
          </ButtonLink>
        </div>
      </div>
    );

  const plan = session.activePlan;
  const look = LOOKS.find((item) => item.id === session.lookId) || LOOKS[0];
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
      `${action.instruction} ${action.detail} ${action.stoppingCue}`,
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
    if (!confirmedState) {
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
  async function openAdaptation() {
    stopSpeech();
    setLocalPause(true);
    setAdaptOpen(true);
    setCheckpointOpen(false);
    requestAnimationFrame(() => {
      panelHeadingRef.current?.focus();
      panelHeadingRef.current?.scrollIntoView({ block: "nearest" });
    });
    if (session?.stage === "applying") await studio.run({ type: "pause" });
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
  async function checkStep() {
    setLocalError("");
    stopSpeech();
    setCheckpointRecorded(false);
    setCheckpointFile(null);
    setAiConsent(false);
    setCheckpointAssetId(undefined);
    setCheckpointOpen(true);
    requestAnimationFrame(() => {
      checkpointHeadingRef.current?.focus();
      checkpointHeadingRef.current?.scrollIntoView({ block: "start" });
    });
    if (cameraActive && !isSample) {
      try {
        setCheckpointFile(await capturePhoto());
      } catch (cause) {
        setLocalError(
          cause instanceof Error
            ? cause.message
            : "Choose a checkpoint photo to continue.",
        );
      }
    }
    if (isSample && action) {
      const next = await studio.run({
        type: "checkpoint",
        actionId: action.id,
      });
      if (next) setCheckpointRecorded(true);
    }
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
  async function manualCheckpoint() {
    if (!action) return;
    const next = await studio.run({ type: "checkpoint", actionId: action.id });
    if (next) setCheckpointRecorded(true);
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
        checkpointOpen &&
        checkpointRecorded &&
        !paused &&
        !adapting &&
        !analyzing &&
        action
      )
        await completeStep();
      else
        setLocalError(
          "Check this step first. Then say “next” to confirm you’re ready to continue.",
        );
    }
  }

  return (
    <div className="wrap mirror-page">
      <div className="page-top">
        <BackLink href={`/studio/${id}/looks`}>Your methods</BackLink>
        <StepProgress active={2} compact />
      </div>
      <div className="mirror-title-row">
        <div>
          <p className="eyebrow">
            {isSample
              ? "Sample walkthrough · no physical result"
              : "Your personal studio"}
          </p>
          <h1>
            {plan.name}
            <span style={{ color: "#9aa38a", paddingInline: 9 }}> / </span>
            <em className="mirror-look-name">{look.title}</em>
          </h1>
        </div>
        <Button
          variant="secondary"
          onClick={() => void pause()}
          disabled={
            studio.busy ||
            uploading ||
            session.stage === "ready" ||
            paused ||
            adapting
          }
        >
          <Pause size={16} aria-hidden />
          Pause
        </Button>
      </div>
      {!online ? (
        <div className="mirror-message">
          <Notice kind="error" title="You’re offline">
            Your loaded instruction is still here. Changes and photos can’t be
            saved until you reconnect; we’ll keep the last confirmed step.
          </Notice>
        </div>
      ) : null}
      <div
        className={`mirror-layout ${session.preferences.hand === "left" ? "mirror-layout--left" : ""} ${session.stage === "applying" && !paused && !adapting && action ? "mirror-layout--applying" : ""}`}
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
                    session.stage === "applying"
                  }
                  region={action.region}
                  mirrored={session.preferences.mirror}
                />
              ) : null}
              <div className="mirror-top-controls">
                <span className="mirror-camera-status">
                  <span />
                  LIVE · ON YOUR DEVICE
                </span>
                <button
                  className="mirror-icon-button"
                  onClick={stopCamera}
                  aria-label="Turn camera off"
                >
                  <CameraOff size={20} aria-hidden />
                </button>
              </div>
              <span className="provenance">
                <span />
                Live camera · unretouched
              </span>
              <span className="mirror-guide-note">
                {session.preferences.mirror ? "Mirror view" : "Photo view"} ·
                unretouched
                <br /> Guides don’t verify makeup application.
              </span>
            </>
          ) : isSample ? (
            <>
              <Image
                className="mirror-sample-image"
                src="/images/studio-portrait.jpg"
                alt="AI-created adult portrait for the sample walkthrough"
                width={1200}
                height={1500}
              />
              <div className="mirror-top-controls">
                <span className="mirror-camera-status">
                  <Sparkles size={12} aria-hidden />
                  SYNTHETIC SAMPLE
                </span>
              </div>
              <ProvenanceLabel kind="synthetic_inspiration" />
              <p className="mirror-bottom-caption">
                Explore the instructions with the sample. No live tracking or
                physical application is claimed.
              </p>
            </>
          ) : (
            <div className="mirror-camera-placeholder">
              <Camera size={61} aria-hidden />
              <h2>
                Your mirror,
                <br /> <em>when you’re ready.</em>
              </h2>
              <p>
                Place your device somewhere steady. Face a soft light, and leave
                your hands free.
              </p>
              <Button onClick={() => void startCamera()} busy={cameraStarting}>
                <Camera size={18} aria-hidden />
                Open my camera
              </Button>
              <p className="text-link" style={{ borderBottom: 0 }}>
                <ShieldCheck size={14} aria-hidden />
                Live frames stay on this device
              </p>
            </div>
          )}
          {cameraError ? (
            <div className="camera-permission-error" role="alert">
              {cameraError} Text guidance and manual checkpoints remain
              available.
            </div>
          ) : null}
          {paused && !adapting ? (
            <div className="pause-state-scrim">
              <Pause size={35} strokeWidth={1.2} aria-hidden />
              <strong>All the time you need.</strong>
              <p>
                Your confirmed steps are saved. There’s nothing to catch up
                with.
              </p>
            </div>
          ) : null}
        </div>
        <section
          className={`instruction-panel ${adapting ? "adapt-panel" : ""}`}
          aria-label="Current makeup instruction"
        >
          {adapting ? (
            <>
              <p
                className="eyebrow"
                style={{ fontSize: 9, color: "#8c7052", marginBottom: 20 }}
              >
                Room for another way
              </p>
              <h2 ref={panelHeadingRef} tabIndex={-1}>
                Let’s make
                <br /> <em>this feel better.</em>
              </h2>
              {session.adaptation ? (
                <>
                  <p>{session.adaptation.explanation}</p>
                  <div className="adapt-diff">
                    <h3>{session.adaptation.candidate.name}</h3>
                    <p>{session.adaptation.candidate.description}</p>
                    <ul>
                      <li>
                        {session.adaptation.preservedActionIds.length} confirmed{" "}
                        {session.adaptation.preservedActionIds.length === 1
                          ? "step stays"
                          : "steps stay"}{" "}
                        in place.
                      </li>
                      <li>
                        {session.adaptation.removedActionIds.length} remaining{" "}
                        {session.adaptation.removedActionIds.length === 1
                          ? "step is"
                          : "steps are"}{" "}
                        replaced or removed.
                      </li>
                      <li>
                        {session.adaptation.changesGoal
                          ? "The desired appearance changes. Accept only if this softer goal feels right to you."
                          : "Your original appearance goal stays the same."}
                      </li>
                    </ul>
                    <div className="tag-row">
                      {session.adaptation.candidate.tools.map((tool) => (
                        <span className="pill" key={tool}>
                          {TOOL_LABELS[tool]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="instruction-buttons">
                    <Button
                      onClick={() => void acceptAdaptation()}
                      busy={studio.busy}
                    >
                      Use this change <ArrowRight size={17} aria-hidden />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void declineAdaptation()}
                      disabled={blocked}
                    >
                      Keep my previous method
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Guidance is paused. Choose what you’d like to change.
                    Anything you’ve confirmed stays part of your result.
                  </p>
                  {session.conflicts.length ? (
                    <div style={{ marginTop: 18 }}>
                      <Notice title="Let’s keep your boundaries">
                        {session.conflicts.map((conflict) => (
                          <p key={conflict.code}>
                            {conflict.message} {conflict.resolution}
                          </p>
                        ))}
                      </Notice>
                    </div>
                  ) : null}
                  <div className="adapt-options">
                    <button
                      className="adapt-option"
                      onClick={() => void propose("movement")}
                      disabled={blocked}
                    >
                      <Hand size={20} aria-hidden />A different movement{" "}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                    <button
                      className="adapt-option"
                      onClick={() => void propose("tool")}
                      disabled={blocked}
                    >
                      <Paintbrush size={20} aria-hidden />A different tool{" "}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                    <button
                      className="adapt-option"
                      onClick={() => void propose("softer")}
                      disabled={blocked}
                    >
                      <Leaf size={20} aria-hidden />A softer version{" "}
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
                      Just a rest <ArrowRight size={16} aria-hidden />
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
                      Help from someone <ArrowRight size={16} aria-hidden />
                    </button>
                    <button
                      className="adapt-option"
                      onClick={() => void review()}
                      disabled={blocked}
                    >
                      <Check size={20} aria-hidden />
                      I’d like to finish here{" "}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  </div>
                  <Button
                    variant="quiet"
                    onClick={() => setAdaptOpen(false)}
                    disabled={blocked}
                    style={{ marginTop: 13 }}
                  >
                    <ArrowLeft size={16} aria-hidden />
                    Back to my pause
                  </Button>
                </>
              )}
              {studio.busy ? (
                <p
                  className="small muted"
                  role="status"
                  style={{
                    marginTop: 15,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <LoaderCircle className="spin" size={17} aria-hidden />
                  Checking available changes…
                </p>
              ) : null}
            </>
          ) : paused ? (
            <div className="pause-panel">
              <span className="pause-symbol">
                <Coffee size={28} strokeWidth={1.2} aria-hidden />
              </span>
              <h2 ref={panelHeadingRef} tabIndex={-1}>
                A pause is
                <br /> <em>part of the method.</em>
              </h2>
              <p>
                {helpRequested
                  ? "Ask someone you trust for the help you’d like. You can record the assistance you used when you review your result."
                  : isSample
                    ? "The sample’s confirmed steps are saved. Continue when you’re ready to explore the remaining instructions."
                    : "Your confirmed steps are saved. Before continuing, check that they still describe what’s actually on your face."}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmedState}
                  onChange={(event) => setConfirmedState(event.target.checked)}
                />
                <span>
                  {isSample
                    ? "I’m ready to continue exploring the sample’s confirmed steps."
                    : "The confirmed steps still match my current makeup. I’ll take a fresh checkpoint if anything has changed."}
                </span>
              </label>
              <Button
                onClick={() => void resume()}
                busy={studio.busy}
                disabled={blocked || !confirmedState}
              >
                <Play size={17} aria-hidden />
                Continue at my pace
              </Button>
              <Button
                variant="secondary"
                onClick={() => void openAdaptation()}
                disabled={blocked}
              >
                Choose another way
              </Button>
              <Button
                variant="quiet"
                onClick={() => void review()}
                disabled={blocked}
              >
                Keep the result I have
              </Button>
              <Button
                variant="quiet"
                onClick={openStopConfirmation}
                disabled={blocked}
              >
                <Square size={14} aria-hidden />
                End this session
              </Button>
            </div>
          ) : session.stage === "ready" ? (
            <div className="all-done">
              <Hand size={39} strokeWidth={1.1} aria-hidden />
              <h2>
                A moment
                <br /> <em>to settle in.</em>
              </h2>
              <p>
                Have your{" "}
                {plan.tools
                  .map((tool) => TOOL_LABELS[tool].toLowerCase())
                  .join(" and ")}{" "}
                nearby. You’ll see one instruction at a time, and every step
                waits for you.
              </p>
              <p className="field-note">
                {isSample
                  ? "This sample explores the application flow without representing real cosmetic application."
                  : "You can follow the method with the live mirror or your own mirror. Your judgment is always the final word."}
              </p>
              <Button
                onClick={() => void studio.run({ type: "start" })}
                busy={studio.busy}
              >
                Begin {isSample ? "the walkthrough" : "my method"}
                <ArrowRight size={18} aria-hidden />
              </Button>
              <DraftNote short />
            </div>
          ) : !action ? (
            <div className="all-done">
              <Check size={42} strokeWidth={1.2} aria-hidden />
              <h2>
                That’s your
                <br /> <em>last step.</em>
              </h2>
              <p>
                {isSample
                  ? "You’ve explored every instruction in this example. The sample doesn’t represent a physical result. You can start a personal studio whenever you’re ready."
                  : "You’ve confirmed each step of your method. Take a moment to decide how you feel about your result, then make space for your actual photo."}
              </p>
              <Button onClick={() => void review()} busy={studio.busy}>
                Review {isSample ? "the walkthrough" : "my result"}
                <ArrowRight size={18} aria-hidden />
              </Button>
            </div>
          ) : (
            <>
              <div className="instruction-scroll">
                <div className="instruction-top">
                  <span className="step-label">
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
                </div>
                <div className="tool-chip">
                  <span className="tool-chip-icon">
                    {action.tool === "fingertips" ? (
                      <Hand size={29} strokeWidth={1.15} aria-hidden />
                    ) : (
                      <Paintbrush size={29} strokeWidth={1.15} aria-hidden />
                    )}
                  </span>
                  <div>
                    <small>Your tool + product</small>
                    <strong>
                      {TOOL_LABELS[action.tool]} ·{" "}
                      {PRODUCT_LABELS[action.product]}
                    </strong>
                  </div>
                </div>
                <h2 key={action.id} ref={instructionHeadingRef} tabIndex={-1}>
                  {primaryInstruction}
                </h2>
                <p className="instruction-detail">
                  {supportingInstruction ? `${supportingInstruction} ` : ""}
                  {action.detail}
                </p>
                <p className="stopping-cue">{action.stoppingCue}</p>
              </div>
              <div className="instruction-control-dock">
                <div className="instruction-buttons">
                  <Button onClick={() => void checkStep()} disabled={blocked}>
                    <Camera size={18} aria-hidden />
                    {isSample ? "Explore a checkpoint" : "Check this step"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void openAdaptation()}
                    disabled={blocked}
                  >
                    <Sparkles size={17} aria-hidden />
                    Make this easier
                  </Button>
                </div>
                <div className="instruction-secondary">
                  <Button
                    variant="quiet"
                    onClick={readStep}
                    disabled={!audioSupported || blocked}
                  >
                    <Volume2 size={16} aria-hidden />
                    Read this step
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => void review()}
                    disabled={blocked}
                  >
                    Keep this result <ArrowRight size={14} aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {studio.error || localError ? (
        <div className="mirror-message">
          <Notice kind="error">{localError || studio.error}</Notice>
        </div>
      ) : null}
      {checkpointOpen && action && !paused && !adapting ? (
        <section className="checkpoint-panel" aria-label="Your checkpoint">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            <h3 ref={checkpointHeadingRef} tabIndex={-1}>
              {checkpointRecorded ? (
                observation?.state === "optional_adjustment" ? (
                  <>
                    One option,
                    <br /> <em>if you’d like.</em>
                  </>
                ) : observation?.state === "ai_observation" ? (
                  <>
                    A little
                    <br /> <em>perspective.</em>
                  </>
                ) : (
                  <>
                    You decide
                    <br /> <em>what feels ready.</em>
                  </>
                )
              ) : (
                <>
                  A moment
                  <br /> <em>to see your step.</em>
                </>
              )}
            </h3>
            <Button
              variant="quiet"
              onClick={() => {
                setCheckpointOpen(false);
                setCheckpointFile(null);
              }}
              aria-label="Close checkpoint"
              disabled={blocked}
            >
              <X size={18} aria-hidden />
            </Button>
          </div>
          {isSample ? (
            <p>
              This is a synthetic sample. The checkpoint below illustrates the
              user judgment flow; it isn’t evidence of physical makeup
              application.
            </p>
          ) : checkpointUrl ? (
            <div className="checkpoint-still">
              <Image
                src={checkpointUrl}
                width={1200}
                height={1200}
                unoptimized
                alt="Your selected actual checkpoint photo"
              />
              <ProvenanceLabel kind="actual_capture" />
            </div>
          ) : !checkpointRecorded ? (
            <StillCapture
              file={checkpointFile}
              onSelected={(file) => {
                setCheckpointFile(file);
                setAiConsent(false);
                setCheckpointAssetId(undefined);
              }}
              label="Choose a checkpoint photo, if you’d like"
              showGuidelines={false}
            />
          ) : null}
          {checkpointRecorded ? (
            <>
              <p role="status">
                <strong>
                  {observation?.reason ||
                    "Look at this step and decide whether you’d like to continue."}
                </strong>
              </p>
              {observation?.reasons?.length ? (
                <ul className="observation-reasons">
                  {observation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <p>
                {observation?.method === "vision_assistant_v1"
                  ? "An AI observation is one perspective. Your confirmation of the step is a separate choice."
                  : "This manual check leaves the judgment to you. Your next choice is recorded as your own confirmation."}
              </p>
              {observation?.suggestedActionId &&
              plan.actions.find(
                (item) =>
                  item.id === observation.suggestedActionId &&
                  !session.completedActionIds.includes(item.id),
              ) ? (
                <p className="stopping-cue">
                  Optional next action:{" "}
                  {
                    plan.actions.find(
                      (item) => item.id === observation.suggestedActionId,
                    )!.instruction
                  }
                </p>
              ) : null}
              <div className="button-row">
                <Button onClick={() => void completeStep()} busy={studio.busy}>
                  {isSample
                    ? "Continue the sample"
                    : "I’m ready for the next step"}
                  <ArrowRight size={17} aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCheckpointRecorded(false);
                    setCheckpointFile(null);
                    setAiConsent(false);
                    setCheckpointAssetId(undefined);
                  }}
                >
                  Choose another photo
                </Button>
                <Button variant="quiet" onClick={() => void openAdaptation()}>
                  Try another way
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                {checkpointFile
                  ? "This still stays on your device until you choose to save it. It will be stored privately with your session; AI guidance is optional and requires your permission below."
                  : "A photo is optional for a manual check. You can use your own mirror and decide whether you’re ready."}
              </p>
              {checkpointFile ? (
                <label className="checkbox-label" style={{ marginTop: 20 }}>
                  <input
                    type="checkbox"
                    checked={aiConsent}
                    onChange={(event) => setAiConsent(event.target.checked)}
                    disabled={analyzing}
                  />
                  <span>
                    I agree to send this selected still to Google Gemini or
                    OpenAI for visual guidance on this step. Live camera frames
                    stay on my device.
                  </span>
                </label>
              ) : null}
              <div className="button-row">
                {checkpointFile ? (
                  <>
                    <Button
                      onClick={() => void analyzeCheckpoint()}
                      busy={analyzing}
                      disabled={!aiConsent || studio.busy || uploading}
                    >
                      <Sparkles size={17} aria-hidden />
                      {analyzing
                        ? "Looking at your selected still…"
                        : "Ask AI about this step"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void saveCheckpoint()}
                      busy={uploading}
                      disabled={studio.busy || analyzing}
                    >
                      <Camera size={17} aria-hidden />
                      Save photo & use my judgment
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="quiet"
                  onClick={() => void manualCheckpoint()}
                  disabled={blocked}
                >
                  Use my judgment without a photo
                </Button>
              </div>
              {analyzing ? (
                <p role="status" style={{ marginTop: 15 }}>
                  Reading the still you selected. You can pause at any time;
                  this assessment won’t mark a step complete.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {stopConfirm ? (
        <div className="delete-confirm">
          <h3 ref={stopHeadingRef} tabIndex={-1}>
            End here?
          </h3>
          <p>
            This records a stopped session without claiming a completed result.
            You can also keep your current result and complete a short
            assessment.
          </p>
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
        <p>
          <ShieldCheck
            size={13}
            aria-hidden
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }}
          />
          Live camera frames stay here. Photos are sent only when you choose.
          <br />{" "}
          {isSample
            ? "Synthetic sample. No participant outcome."
            : "Unretouched camera. No automatic step completion."}
        </p>
        <Button
          variant="quiet"
          onClick={() => {
            setDraftPreferences({
              ...session.preferences,
              movements: { ...session.preferences.movements },
            });
            setPrefsOpen(!prefsOpen);
          }}
        >
          <SlidersHorizontal size={15} aria-hidden />
          Comfort & controls
        </Button>
      </div>
      <VoiceControls
        contextKey={`${session.revision}:${action?.id || "none"}:${paused}:${checkpointOpen}:${checkpointRecorded}:${analyzing}`}
        blocked={studio.busy || uploading || !online}
        onCommand={handleVoice}
      />
      {prefsOpen && draftPreferences ? (
        <section
          className="checkpoint-panel"
          aria-label="Session comfort settings"
        >
          <h3>
            Your studio.
            <br /> <em>Your settings.</em>
          </h3>
          <p style={{ marginBottom: 22 }}>
            Movement changes are checked against your remaining plan. If a
            change needs another method, use “Make this easier” to review it
            first.
          </p>
          <MovementFields
            preferences={draftPreferences}
            onChange={setDraftPreferences}
          />
          <div className="preference-row">
            <div>
              <label className="label" htmlFor="mirror-toggle">
                Mirror view
              </label>
              <p className="small muted">Off shows the photo’s orientation.</p>
            </div>
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
            <div>
              <label className="label" htmlFor="audio-toggle">
                Read each instruction
              </label>
              <p className="small muted">Uses this browser’s speech voice.</p>
            </div>
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
          <div className="button-row" style={{ marginTop: 25 }}>
            <Button onClick={() => void savePreferences()} busy={studio.busy}>
              Save my controls
            </Button>
            <Button variant="quiet" onClick={() => setPrefsOpen(false)}>
              Close
            </Button>
          </div>
        </section>
      ) : null}
      <details className="mirror-step-summary">
        <summary>
          Your method, at a glance <ChevronDown size={17} aria-hidden />
        </summary>
        <ActionList
          actions={plan.actions}
          completed={session.completedActionIds}
        />
        <DraftNote short />
      </details>
      {session.preferences.pace === "offer_breaks" &&
      finishedCount > 0 &&
      !paused &&
      !adapting ? (
        <div className="mirror-message">
          <Notice title="Room for a rest">
            You’ve confirmed {finishedCount}{" "}
            {finishedCount === 1 ? "step" : "steps"}. A break is available
            whenever you want one.
            <div style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                onClick={() => void pause()}
                disabled={blocked}
              >
                <Coffee size={17} aria-hidden />
                Take a break
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
