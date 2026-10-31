"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionCommand, StudioSession } from "@/lib/contracts";
import { ApiError, commandSession, getSession } from "@/lib/client";

export function useStudioSession(id: string) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<StudioSession | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const update = useCallback((value: StudioSession) => {
    current.current = value;
    if (alive.current) setSession(value);
    return value;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const value = await getSession(id);
      if (alive.current) update(value);
      return value;
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Your studio couldn’t be opened. Please try again.",
        );
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [id, update]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  const perform = useCallback(
    async (operation: (value: StudioSession) => Promise<StudioSession>) => {
      if (inFlight.current || !current.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        return update(await operation(current.current));
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          cause.status === 409 &&
          cause.code === "REVISION_CONFLICT"
        ) {
          await refresh();
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
        inFlight.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [refresh, update],
  );

  const run = useCallback(
    (command: SessionCommand) =>
      perform((value) => commandSession(value, command)),
    [perform],
  );
  return {
    session,
    loading,
    busy,
    error,
    refresh,
    run,
    perform,
    clearError: () => setError(""),
  };
}
