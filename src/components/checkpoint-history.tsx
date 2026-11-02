"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  CheckpointObservation,
  PlanAction,
  StudioSession,
} from "@/lib/contracts";
import {
  createMeasurementTarget,
  measureCheckpoint,
} from "@/lib/vision/measure";
import {
  loadLocalFrame,
  readLocalCheckpoint,
  type LocalCheckpoint,
} from "@/lib/vision/local-checkpoints";
import { LOOKS } from "@/lib/catalog";
import { HeatmapLegend, MeasurementVisual } from "./measurement-visual";
import { sameStoredMeasurement } from "@/lib/vision/measurement-guidance";
import { CHEEK_GEOMETRY_VERSION } from "@/lib/vision/geometry";
import { sampleCheckpointForHistory } from "@/lib/youcam/sample-checkpoints";

function CheckpointEntry({
  session,
  observation,
  action,
  onHeatmap,
}: {
  session: StudioSession;
  observation: CheckpointObservation;
  action: PlanAction;
  onHeatmap: (id: string, shown: boolean) => void;
}) {
  const [local, setLocal] = useState<LocalCheckpoint | null>(null);
  const hasHeatmap = !!local?.result.heatmap.length;
  useEffect(() => {
    onHeatmap(observation.id, hasHeatmap);
  }, [onHeatmap, observation.id, hasHeatmap]);
  const measurement = observation.measurement!;
  const currentGeometry =
    !measurement.region.endsWith("_cheek") ||
    measurement.geometryVersion === CHEEK_GEOMETRY_VERSION;
  const target = session.assets.find(
    (asset) => asset.id === measurement.targetAssetId,
  );
  useEffect(() => {
    const remembered = readLocalCheckpoint(session.id, observation.actionId);
    if (
      currentGeometry &&
      remembered &&
      remembered.targetUrl === target?.url &&
      sameStoredMeasurement(remembered.measurement, measurement)
    ) {
      queueMicrotask(() => setLocal(remembered));
      return;
    }
    queueMicrotask(() => setLocal(null));
    if (session.mode !== "sample" || !target || !currentGeometry) return;
    const source = session.assets.find(
      (asset) => asset.id === session.sourceAssetId,
    );
    const recorded = sampleCheckpointForHistory(session, measurement, target);
    if (!source || !recorded) return;
    let alive = true;
    void (async () => {
      const baseline = await loadLocalFrame(source.url);
      const [preview, checkpoint] = await Promise.all([
        loadLocalFrame(target.url, baseline.landmarks),
        loadLocalFrame(recorded.url, baseline.landmarks),
      ]);
      const result = measureCheckpoint({
        baseline,
        checkpoint,
        target: createMeasurementTarget(baseline, preview, measurement.region),
      });
      if (alive)
        setLocal({
          actionId: observation.actionId,
          checkpointUrl: recorded.url,
          targetUrl: target.url,
          result,
          measurement,
          landmarks: checkpoint.landmarks,
          targetLandmarks: baseline.landmarks,
          isSample: true,
          elapsedMs: measurement.elapsedMs,
          width: checkpoint.image.width,
          height: checkpoint.image.height,
        });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, observation.actionId, target, measurement, currentGeometry]);
  return (
    <article className="review-checkpoint">
      <h3>{action.title}</h3>
      <MeasurementVisual
        measurement={measurement}
        local={local}
        action={action}
        targetAsset={target}
        compact
        legend={false}
        shade={LOOKS.find((look) => look.id === session.lookId)?.color}
      />
      {!local && session.mode === "personal" ? (
        <p className="small muted">Image no longer on this device.</p>
      ) : null}
      {!local && session.mode === "sample" && !currentGeometry ? (
        <p className="small muted">Measured with an earlier guide.</p>
      ) : null}
    </article>
  );
}

export function CheckpointHistory({ session }: { session: StudioSession }) {
  const [heatmaps, setHeatmaps] = useState<Record<string, boolean>>({});
  const onHeatmap = useCallback(
    (id: string, shown: boolean) =>
      setHeatmaps((current) =>
        current[id] === shown ? current : { ...current, [id]: shown },
      ),
    [],
  );
  const latest = new Map<string, CheckpointObservation>();
  for (const observation of session.observations)
    if (observation.measurement) latest.set(observation.actionId, observation);
  const entries = [...latest.values()].flatMap((observation) => {
    const action =
      observation.actionSnapshot ??
      session.activePlan?.actions.find(
        (item) => item.id === observation.actionId,
      ) ??
      session.candidates
        .flatMap((plan) => plan.actions)
        .find((item) => item.id === observation.actionId);
    return action ? [{ observation, action }] : [];
  });
  if (!entries.length) return null;
  return (
    <section
      className="review-checkpoints"
      aria-label="Your measured checkpoints"
    >
      <h2>Your checkpoints</h2>
      {entries.map(({ observation, action }) => (
        <CheckpointEntry
          key={observation.id}
          session={session}
          observation={observation}
          action={action}
          onHeatmap={onHeatmap}
        />
      ))}
      {Object.values(heatmaps).some(Boolean) ? (
        <div className="review-checkpoint-legend">
          <HeatmapLegend
            shade={LOOKS.find((look) => look.id === session.lookId)?.color}
          />
        </div>
      ) : null}
    </section>
  );
}
