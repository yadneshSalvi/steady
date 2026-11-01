"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  PlanAction,
  StoredMeasurement,
  StudioSession,
} from "@/lib/contracts";
import { sampleCheckpointForPlan } from "@/lib/youcam/sample-checkpoints";
import { faceEligible, type Point } from "@/lib/vision/geometry";
import {
  createMeasurementTarget,
  measureCheckpoint,
  measurementReasonMessage,
  type MeasurementTarget,
} from "@/lib/vision/measure";
import {
  captureLocalFrame,
  fileFromFrame,
  forgetBaseline,
  loadLocalFrame,
  readLocalBaseline,
  rememberBaseline,
  rememberCheckpoint,
  type LocalCheckpoint,
  type LocalFrame,
} from "@/lib/vision/local-checkpoints";

export function useCheckpointMeasurement({
  session,
  action,
  videoRef,
  cameraActive,
  enabled,
}: {
  session: StudioSession | null;
  action: PlanAction | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  enabled: boolean;
}) {
  const [source, setSource] = useState<LocalFrame | null>(null);
  const [target, setTarget] = useState<MeasurementTarget | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [baselineBlocked, setBaselineBlocked] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState("");
  const [checkpoint, setCheckpoint] = useState<LocalCheckpoint | null>(null);
  const [summary, setSummary] = useState<StoredMeasurement | null>(null);
  const context = useRef({
    session,
    action,
    enabled,
    cameraActive,
    target,
    source,
  });
  const capturing = useRef(false);
  const consecutive = useRef(0);
  const lastNose = useRef<Point | null>(null);
  useEffect(() => {
    context.current = {
      session,
      action,
      enabled,
      cameraActive,
      target,
      source,
    };
  }, [session, action, enabled, cameraActive, target, source]);
  const sourceUrl = session?.assets.find(
    (asset) => asset.id === session.sourceAssetId,
  )?.url;
  const targetAsset = session?.activePlan?.previewAsset;
  const targetUrl = targetAsset?.url;
  const region = action?.region;
  const sessionId = session?.id;
  const sample = session?.mode === "sample";

  useEffect(() => {
    if (!sessionId || !region) return;
    const existing = readLocalBaseline(sessionId, region);
    let blocked = false;
    try {
      blocked =
        !existing &&
        sessionStorage.getItem(`steady-baseline-${sessionId}-${region}`) ===
          "captured";
    } catch {
      /* Memory-only mode still works. */
    }
    queueMicrotask(() => {
      setBaselineReady(!!existing || sample);
      setBaselineBlocked(blocked && !sample);
      setCheckpoint(null);
      setSummary(null);
      setError("");
    });
    consecutive.current = 0;
    lastNose.current = null;
  }, [sessionId, region, sample]);

  useEffect(() => {
    if (!sourceUrl || !region) return;
    let stopped = false;
    queueMicrotask(() => {
      setPreparing(true);
      setTarget(null);
      setError("");
      setSummary(null);
      setCheckpoint(null);
    });
    void (async () => {
      const baseline = await loadLocalFrame(sourceUrl);
      if (stopped) return;
      setSource(baseline);
      if (targetUrl) {
        const preview = await loadLocalFrame(targetUrl, baseline.landmarks);
        if (stopped) return;
        setTarget(createMeasurementTarget(baseline, preview, region));
      }
    })()
      .catch((cause) => {
        if (!stopped)
          setError(
            cause instanceof Error
              ? cause.message
              : "The local image guide could not start.",
          );
      })
      .finally(() => {
        if (!stopped) setPreparing(false);
      });
    return () => {
      stopped = true;
    };
  }, [sourceUrl, targetUrl, region]);

  const onTracking = useCallback(
    (points: readonly Point[]) => {
      const current = context.current;
      if (
        !current.session ||
        !current.action ||
        !current.enabled ||
        !current.cameraActive ||
        current.session.mode === "sample" ||
        capturing.current ||
        readLocalBaseline(current.session.id, current.action.region)
      )
        return;
      try {
        if (
          sessionStorage.getItem(
            `steady-baseline-${current.session.id}-${current.action.region}`,
          ) === "captured"
        )
          return;
      } catch {
        /* memory-only */
      }
      if (!faceEligible(points)) {
        consecutive.current = 0;
        return;
      }
      const nose = points[1];
      if (
        lastNose.current &&
        Math.hypot(nose.x - lastNose.current.x, nose.y - lastNose.current.y) >
          0.025
      )
        consecutive.current = 0;
      lastNose.current = nose;
      if (++consecutive.current < 3 || !videoRef.current) return;
      capturing.current = true;
      const capturedSession = current.session.id,
        capturedRegion = current.action.region;
      void captureLocalFrame(videoRef.current)
        .then((frame) => {
          if (
            !frame.eligible ||
            context.current.session?.id !== capturedSession ||
            context.current.action?.region !== capturedRegion ||
            !context.current.enabled
          )
            return;
          rememberBaseline(capturedSession, capturedRegion, frame);
          try {
            sessionStorage.setItem(
              `steady-baseline-${capturedSession}-${capturedRegion}`,
              "captured",
            );
          } catch {
            /* memory-only */
          }
          setBaselineReady(true);
          setBaselineBlocked(false);
          setError("");
        })
        .catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "The baseline could not be captured.",
          ),
        )
        .finally(() => {
          capturing.current = false;
          consecutive.current = 0;
        });
    },
    [videoRef],
  );

  const resetBaseline = useCallback(() => {
    const current = context.current;
    if (!current.session || !current.action) return;
    forgetBaseline(current.session.id, current.action.region);
    try {
      sessionStorage.removeItem(
        `steady-baseline-${current.session.id}-${current.action.region}`,
      );
    } catch {
      /* memory-only */
    }
    consecutive.current = 0;
    setBaselineReady(false);
    setBaselineBlocked(false);
    setCheckpoint(null);
    setSummary(null);
  }, []);

  const clearCheckpoint = useCallback(() => {
    setSummary(null);
    setCheckpoint(null);
  }, []);
  const measureNow = useCallback(
    async (
      reportedPass: boolean,
    ): Promise<{ measurement: StoredMeasurement; file?: File } | null> => {
      setSummary(null);
      setCheckpoint(null);
      const current = context.current;
      if (
        !current.session ||
        !current.action ||
        !current.target ||
        !current.source ||
        !current.session.activePlan?.previewAsset
      ) {
        setError(
          "Choose a YouCam target and wait for its local guide before measuring. You can still use your own judgment.",
        );
        return null;
      }
      const {
        session: activeSession,
        action: activeAction,
        target: activeTarget,
        source: activeSource,
      } = current;
      const isSample = activeSession.mode === "sample";
      setMeasuring(true);
      setError("");
      try {
        const baseline = isSample
          ? activeSource
          : readLocalBaseline(activeSession.id, activeAction.region);
        if (!baseline)
          throw new Error(
            "A baseline of this area before applying color is needed. Keep your current result or confirm the area is still clear to capture one.",
          );
        const started = performance.now();
        let frame: LocalFrame;
        let frameUrl: string;
        let sampleCheckpointId: string | undefined;
        if (isSample) {
          const recorded = sampleCheckpointForPlan(
            activeSession,
            activeSession.activePlan!,
          );
          if (!recorded)
            throw new Error(
              "The recorded sample checkpoint is unavailable for this target.",
            );
          frame = await loadLocalFrame(recorded.url, activeSource.landmarks);
          frameUrl = recorded.url;
          sampleCheckpointId = recorded.sha256;
        } else {
          if (!videoRef.current || !current.cameraActive)
            throw new Error("Open your camera to measure this step locally.");
          frame = await captureLocalFrame(videoRef.current);
          frameUrl = frame.canvas.toDataURL("image/png");
        }
        const result = measureCheckpoint({
          baseline,
          checkpoint: frame,
          target: activeTarget,
        });
        const elapsedMs = performance.now() - started;
        const measurement: StoredMeasurement = {
          version: 1,
          geometryVersion: result.geometryVersion,
          ...(sampleCheckpointId ? { sampleCheckpointId } : {}),
          region: result.region,
          verdict: result.verdict,
          progress: result.progress,
          deltaA: result.deltaA,
          deltaE00: result.deltaE00,
          uniformity: result.uniformity,
          lagging: result.lagging,
          reason: result.reason
            ? measurementReasonMessage(result.reason)
            : undefined,
          provenance: isSample ? "simulated" : "local_camera",
          reportedPass,
          targetLevel:
            activeSession.activePlan!.selectedPreviewVariantId ?? "full",
          targetAssetId: activeSession.activePlan!.previewAsset!.id,
          elapsedMs,
        };
        if (
          context.current.action?.id !== activeAction.id ||
          context.current.session?.activePlan?.previewAsset?.id !==
            measurement.targetAssetId
        )
          throw new Error(
            "The step or target changed during capture. Check the current step again.",
          );
        const local: LocalCheckpoint = {
          actionId: activeAction.id,
          checkpointUrl: frameUrl,
          targetUrl: activeSession.activePlan!.previewAsset!.url,
          result,
          measurement,
          landmarks: frame.landmarks,
          targetLandmarks: activeSource.landmarks,
          isSample,
          elapsedMs,
          width: frame.image.width,
          height: frame.image.height,
        };
        rememberCheckpoint(activeSession.id, local);
        setCheckpoint(local);
        setSummary(measurement);
        return {
          measurement,
          ...(!isSample ? { file: await fileFromFrame(frame) } : {}),
        };
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The checkpoint could not be measured.",
        );
        return null;
      } finally {
        setMeasuring(false);
      }
    },
    [videoRef],
  );
  return {
    source,
    target,
    baselineReady,
    baselineBlocked,
    preparing,
    measuring,
    error,
    checkpoint,
    summary,
    onTracking,
    resetBaseline,
    measureNow,
    clearCheckpoint,
  };
}
