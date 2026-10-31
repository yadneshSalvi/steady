"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  Hand,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LOOKS, TOOL_LABELS } from "@/lib/catalog";
import { listMethods, listSessions } from "@/lib/client";
import type { SavedMethod, StudioSession } from "@/lib/contracts";
import {
  ActionList,
  ButtonLink,
  DraftNote,
  EmptyState,
  ErrorState,
  LoadingState,
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

  if (loading)
    return (
      <LoadingState>Bringing your methods back to the workbench…</LoadingState>
    );
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  const inProgress = sessions.filter(
    (session) => !["completed", "stopped"].includes(session.stage),
  );

  return (
    <div className="wrap page-wrap collection-page">
      <div className="page-intro page-intro--wide">
        <div>
          <p className="eyebrow">Your personal collection</p>
          <h1>
            Ways that
            <br /> <em>feel like you.</em>
          </h1>
          <p>
            Your saved methods, with the tools and choices that made them yours.
            Start fresh whenever you use one again.
          </p>
        </div>
        <ButtonLink href="/studio/new">
          Find another way <ArrowUpRight size={18} aria-hidden />
        </ButtonLink>
      </div>
      <div className="methods-layout">
        <div>
          {methods.length ? (
            methods.map((method) => {
              const source = sessions.find(
                (session) => session.id === method.sessionId,
              );
              const look =
                LOOKS.find((item) => item.id === method.lookId) || LOOKS[0];
              return (
                <article className="method-card" key={method.sessionId}>
                  <div className="method-card-heading">
                    <div>
                      <p
                        className="eyebrow"
                        style={{
                          fontSize: 10,
                          color: "#637254",
                          marginBottom: 9,
                        }}
                      >
                        {source?.mode === "sample"
                          ? "Saved sample method"
                          : "Your saved method"}
                      </p>
                      <h2>{method.name}</h2>
                    </div>
                    <Bookmark
                      size={24}
                      strokeWidth={1.2}
                      aria-hidden
                      style={{ color: "#758c5f" }}
                    />
                  </div>
                  <div className="tag-row">
                    <span
                      className="pill"
                      style={{ background: `${look.color}22` }}
                    >
                      {look.title}
                    </span>
                    {method.tools.map((tool) => (
                      <span className="pill" key={tool}>
                        {TOOL_LABELS[tool]}
                      </span>
                    ))}
                  </div>
                  <p className="small muted">
                    {method.actions.length} steps ·{" "}
                    {source?.mode === "sample"
                      ? "Synthetic walkthrough, no physical outcome"
                      : method.outcome
                        ? "Includes your recorded assessment"
                        : "Method only"}
                  </p>
                  <div className="button-row">
                    <ButtonLink
                      href={`/studio/new?from=${encodeURIComponent(method.sessionId)}`}
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
              title="A little space for your favorites."
              action={
                <ButtonLink href="/studio/new">
                  Find your first method <ArrowRight size={17} aria-hidden />
                </ButtonLink>
              }
            >
              After a session, save a method you’d like to return to. Its steps
              and tools will be here, ready for another day.
            </EmptyState>
          )}
          {inProgress.length ? (
            <section className="recent-sessions">
              <h2>Pick up where you paused.</h2>
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
                          ? "Ready for your assessment"
                          : `${session.completedActionIds.length} confirmed steps · saved`}
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
        <aside className="methods-aside">
          <Hand size={31} strokeWidth={1.1} aria-hidden />
          <h2>
            Today can
            <br /> <em>be different.</em>
          </h2>
          <p>
            Reusing a method starts a new session. Confirm today’s movements and
            tools, choose a fresh photo, and begin with no steps marked
            complete.
          </p>
          <ButtonLink href="/settings/access" variant="secondary">
            Your comfort settings <ArrowRight size={15} aria-hidden />
          </ButtonLink>
        </aside>
      </div>
      <DraftNote />
    </div>
  );
}
