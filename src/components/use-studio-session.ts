"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionCommand, StudioSession } from "@/lib/contracts";
import { ApiError, commandSession, getSession } from "@/lib/client";

export function useStudioSession(id: string) {
  const [viewId, setViewId] = useState(id);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<StudioSession | null>(null);
  const inFlight = useRef<symbol | null>(null);
  const scope = useRef({
    id,
    generation: 0,
    alive: false,
    read: 0,
    mutation: 0,
  });

  const update = useCallback(
    (value: StudioSession) => {
      if (!scope.current.alive || scope.current.id !== id || value.id !== id)
        return null;
      if (
        current.current?.id === id &&
        value.revision < current.current.revision
      )
        return current.current;
      current.current = value;
      setSession(value);
      return value;
    },
    [id],
  );

  const refresh = useCallback(async () => {
    if (!scope.current.alive || scope.current.id !== id) return null;
    const generation = scope.current.generation;
    const mutation = scope.current.mutation;
    const read = ++scope.current.read;
    const ownsRead = () =>
      scope.current.alive &&
      scope.current.id === id &&
      scope.current.generation === generation &&
      scope.current.mutation === mutation &&
      scope.current.read === read;
    try {
      const value = await getSession(id);
      if (!ownsRead()) return null;
      if (value.id !== id)
        throw new Error(
          "This response belongs to another studio. Reopen your studio.",
        );
      return update(value);
    } catch (cause) {
      if (ownsRead())
        setError(
          cause instanceof Error
            ? cause.message
            : "Your studio couldn’t be opened. Please try again.",
        );
      return null;
    } finally {
      if (ownsRead()) setLoading(false);
    }
  }, [id, update]);

  useEffect(() => {
    const generation = scope.current.generation + 1;
    scope.current = { id, generation, alive: true, read: 0, mutation: 0 };
    current.current = null;
    inFlight.current = null;
    queueMicrotask(() => {
      if (!scope.current.alive || scope.current.generation !== generation)
        return;
      setSession(null);
      setViewId(id);
      setLoading(true);
      setBusy(false);
      setError("");
      void refresh();
    });
    return () => {
      if (scope.current.generation === generation) {
        scope.current.alive = false;
        scope.current.generation++;
      }
    };
  }, [id, refresh]);

  const perform = useCallback(
    async (operation: (value: StudioSession) => Promise<StudioSession>) => {
      if (
        inFlight.current ||
        !scope.current.alive ||
        scope.current.id !== id ||
        current.current?.id !== id
      )
        return null;
      const generation = scope.current.generation;
      const token = Symbol();
      inFlight.current = token;
      const ownsMutation = () =>
        scope.current.alive &&
        scope.current.id === id &&
        scope.current.generation === generation &&
        inFlight.current === token;
      const invalidateReads = () => {
        scope.current.mutation++;
        scope.current.read++;
      };
      // Polls started before or during this mutation cannot publish afterwards.
      invalidateReads();
      setBusy(true);
      setError("");
      try {
        const value = await operation(current.current);
        if (!ownsMutation()) return null;
        if (value.id !== id)
          throw new Error(
            "This response belongs to another studio. Reopen your studio.",
          );
        invalidateReads();
        setError("");
        return update(value);
      } catch (cause) {
        if (!ownsMutation()) return null;
        invalidateReads();
        if (
          cause instanceof ApiError &&
          cause.status === 409 &&
          cause.code === "REVISION_CONFLICT"
        ) {
          await refresh();
          if (ownsMutation())
            setError(
              "Your session was updated in another view. We’ve refreshed it; please choose your next action again.",
            );
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : "That change hasn’t been saved. Your last confirmed step is still here.",
          );
        }
        return null;
      } finally {
        if (ownsMutation()) {
          inFlight.current = null;
          setBusy(false);
        }
      }
    },
    [id, refresh, update],
  );

  const run = useCallback(
    (command: SessionCommand) =>
      perform((value) => commandSession(value, command)),
    [perform],
  );
  return {
    session: session?.id === id ? session : null,
    loading: viewId !== id || loading,
    busy: viewId === id && busy,
    error: viewId === id ? error : "",
    refresh,
    run,
    perform,
    clearError: () => setError(""),
  };
}
