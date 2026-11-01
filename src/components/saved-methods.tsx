"use client";

import { ArrowRight, ArrowUpRight, Bookmark, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LOOKS } from "@/lib/catalog";
import { listMethods, listSessions } from "@/lib/client";
import type { SavedMethod, StudioSession } from "@/lib/contracts";
import {
  ActionList,
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingState,
  SampleBadge,
} from "./ui";

function sessionHref(session: StudioSession) {
  return `/studio/${session.id}/${["completed", "reviewing", "stopped"].includes(session.stage) ? "review" : session.activePlan ? "mirror" : "looks"}`;
}

export function SavedMethods() {
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [saved, recent] = await Promise.all([
        listMethods(),
        listSessions(),
      ]);
      setMethods(saved.methods);
      setSessions(recent.sessions);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your methods couldn’t be opened yet.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  if (loading) return <LoadingState>Opening your methods…</LoadingState>;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  const inProgress = sessions.filter(
    (session) => !["completed", "stopped"].includes(session.stage),
  );

  return (
    <div className="wrap page-wrap collection-page r3-collection">
      <div className="page-intro page-intro--wide">
        <h1>Your methods</h1>
        <ButtonLink href="/studio/new" variant="secondary">
          Find another way <ArrowUpRight size={18} aria-hidden />
        </ButtonLink>
      </div>
      <div className="methods-layout">
        <div>
          {methods.length ? (
            methods.map((method, index) => {
              const source = sessions.find(
                (session) => session.id === method.sessionId,
              );
              const look =
                LOOKS.find((item) => item.id === method.lookId) || LOOKS[0];
              return (
                <article className="method-card" key={method.sessionId}>
                  <div className="method-card-heading">
                    <div>
                      {source?.mode === "sample" ? <SampleBadge /> : null}
                      <h2>{method.name}</h2>
                    </div>
                    <Bookmark size={24} strokeWidth={1.2} aria-hidden />
                  </div>
                  <span className="r3-look-label">
                    <i style={{ background: look.color }} aria-hidden />
                    {look.title}
                  </span>
                  <div className="button-row">
                    <ButtonLink
                      href={`/studio/new?from=${encodeURIComponent(method.sessionId)}`}
                      variant={index === 0 ? "primary" : "secondary"}
                    >
                      Use this method <ArrowRight size={16} aria-hidden />
                    </ButtonLink>
                    <ButtonLink
                      href={`/studio/${method.sessionId}/review`}
                      variant="quiet"
                    >
                      View the session <ArrowUpRight size={15} aria-hidden />
                    </ButtonLink>
                  </div>
                  <details className="method-details">
                    <summary>
                      See the steps <ChevronDown size={17} aria-hidden />
                    </summary>
                    <ActionList actions={method.actions} />
                  </details>
                </article>
              );
            })
          ) : (
            <EmptyState
              title="No saved methods"
              action={
                <ButtonLink href="/studio/new">
                  Find your first method <ArrowRight size={17} aria-hidden />
                </ButtonLink>
              }
            >
              Save a method after a session to find it here.
            </EmptyState>
          )}
          {inProgress.length ? (
            <section className="recent-sessions">
              <h2>In progress</h2>
              {inProgress.map((session) => (
                <div className="session-row" key={session.id}>
                  <div>
                    <strong>
                      {session.activePlan?.name ||
                        LOOKS.find((look) => look.id === session.lookId)
                          ?.title ||
                        "Your studio"}
                    </strong>
                    <small>
                      {session.mode === "sample" ? "Sample · " : ""}
                      {session.stage === "choosing"
                        ? "Choose a method"
                        : session.stage === "reviewing"
                          ? "Ready to review"
                          : `${session.completedActionIds.length} ${session.completedActionIds.length === 1 ? "step" : "steps"} done`}
                    </small>
                  </div>
                  <ButtonLink href={sessionHref(session)} variant="secondary">
                    Return <ArrowRight size={15} aria-hidden />
                  </ButtonLink>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
