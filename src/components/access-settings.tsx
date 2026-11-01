"use client";

import {
  ArrowRight,
  Camera,
  Check,
  Download,
  Hand,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, LOOKS } from "@/lib/catalog";
import { deleteSession, listSessions } from "@/lib/client";
import type { Preferences, StudioSession } from "@/lib/contracts";
import { applyDevicePreferences } from "./access-preferences";
import { MovementFields } from "./setup-wizard";
import { Button, ButtonLink, Notice } from "./ui";

const STAGE_LABELS: Record<StudioSession["stage"], string> = {
  choosing: "Choosing a method",
  ready: "Ready to start",
  applying: "In progress",
  paused: "Paused",
  adapting: "Changing method",
  reviewing: "Ready to review",
  completed: "Completed",
  stopped: "Stopped",
};

function Toggle({
  id,
  title,
  description,
  value,
  onChange,
}: {
  id: string;
  title: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-toggle">
      <div>
        <label htmlFor={id}>
          <strong>{title}</strong>
        </label>
        {description ? <p id={`${id}-description`}>{description}</p> : null}
      </div>
      <label className="switch">
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={description ? `${id}-description` : undefined}
        />
        <span />
      </label>
    </div>
  );
}

export function AccessSettings() {
  const [preferences, setPreferences] = useState<Preferences>({
    ...DEFAULT_PREFERENCES,
    movements: { ...DEFAULT_PREFERENCES.movements },
  });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [largerText, setLargerText] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletedNotice, setDeletedNotice] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setDataError("");
    try {
      const result = await listSessions();
      setSessions(result.sessions);
    } catch (cause) {
      setDataError(
        cause instanceof Error
          ? cause.message
          : "Your saved data couldn’t be loaded yet.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("steady-access-v1");
      if (raw) {
        const stored = JSON.parse(raw);
        queueMicrotask(() => {
          if (stored.preferences?.movements)
            setPreferences({
              ...DEFAULT_PREFERENCES,
              ...stored.preferences,
              movements: {
                ...DEFAULT_PREFERENCES.movements,
                ...stored.preferences.movements,
              },
            });
          setReducedMotion(!!stored.reducedMotion);
          setLargerText(!!stored.largerText);
        });
      }
    } catch {
      /* Start with explicit unknown movements when device preferences cannot be read. */
    }
    queueMicrotask(() => {
      void loadSessions();
    });
  }, [loadSessions]);

  function changePreferences(value: Preferences) {
    setPreferences(value);
    setSaved(false);
  }
  function save() {
    setError("");
    try {
      const value = { version: 1, preferences, reducedMotion, largerText };
      localStorage.setItem("steady-access-v1", JSON.stringify(value));
      applyDevicePreferences(value);
      setSaved(true);
    } catch {
      setError(
        "This browser couldn’t store device preferences. Your session controls are still available in the mirror.",
      );
    }
  }
  async function remove() {
    if (!deleteId || deleting) return;
    setDeleting(true);
    setDataError("");
    try {
      await deleteSession(deleteId);
      setSessions((current) =>
        current.filter((session) => session.id !== deleteId),
      );
      setDeleteId("");
      setDeletedNotice(true);
    } catch (cause) {
      setDataError(
        cause instanceof Error
          ? cause.message
          : "That session couldn’t be deleted yet.",
      );
    } finally {
      setDeleting(false);
    }
  }
  function download(session: StudioSession) {
    const serialized = JSON.stringify(
      session,
      (key, value) => (key === "url" ? undefined : value),
      2,
    );
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `steady-session-${session.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="wrap page-wrap settings-page r3-settings">
      <div className="page-intro">
        <h1>Settings</h1>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#your-comfort">
            <Hand size={17} aria-hidden />
            Movements
          </a>
          <a href="#your-controls">
            <SlidersHorizontal size={17} aria-hidden />
            Controls
          </a>
          <a href="#your-data">
            <ShieldCheck size={17} aria-hidden />
            Photos & data
          </a>
        </nav>
        <div>
          <section className="settings-section" id="your-comfort">
            <h2>Movements</h2>
            <p className="field-note">Saved on this device for new setups.</p>
            <MovementFields
              preferences={preferences}
              onChange={changePreferences}
            />
          </section>
          <section className="settings-section" id="your-controls">
            <h2>Controls</h2>
            <Toggle
              id="settings-audio"
              title="Read each studio instruction"
              description="Your browser’s voice reads each step."
              value={preferences.audio}
              onChange={(audio) => changePreferences({ ...preferences, audio })}
            />
            <Toggle
              id="settings-mirror"
              title="Mirror view"
              description="Flip the camera like a mirror."
              value={preferences.mirror}
              onChange={(mirror) =>
                changePreferences({ ...preferences, mirror })
              }
            />
            <Toggle
              id="settings-reduced-motion"
              title="Less motion"
              value={reducedMotion}
              onChange={(value) => {
                setReducedMotion(value);
                setSaved(false);
              }}
            />
            <Toggle
              id="settings-larger-text"
              title="Larger studio instructions"
              value={largerText}
              onChange={(value) => {
                setLargerText(value);
                setSaved(false);
              }}
            />
          </section>
          {error ? (
            <div style={{ marginBottom: 20 }}>
              <Notice kind="error">{error}</Notice>
            </div>
          ) : null}
          <div className="settings-save">
            <Button onClick={save}>
              <Check size={17} aria-hidden />
              Save my preferences
            </Button>
            <p role="status">{saved ? "Saved on this device." : ""}</p>
          </div>
          <section
            className="settings-section"
            id="your-data"
            style={{ marginTop: 45 }}
          >
            <h2>Photos &amp; data</h2>
            <ul className="privacy-list">
              <li>
                <Camera size={21} aria-hidden />
                <div>
                  <strong>Live camera stays on this device</strong>
                  <p>Photos are captured only when you choose.</p>
                </div>
              </li>
              <li>
                <Sparkles size={21} aria-hidden />
                <div>
                  <strong>You choose AI image processing</strong>
                  <p>
                    Previews use YouCam; optional suggestions use Gemini or
                    OpenAI.
                  </p>
                </div>
              </li>
              <li>
                <ShieldCheck size={21} aria-hidden />
                <div>
                  <strong>Your photos are private</strong>
                  <p>
                    Sessions expire after 30 days. Deleting queues private
                    photos for removal. Provider copies follow their separate
                    retention policies.
                  </p>
                </div>
              </li>
            </ul>
            <div className="button-row">
              <ButtonLink
                href="https://www.perfectcorp.com/business/privacy"
                variant="quiet"
              >
                YouCam privacy information <ArrowRight size={15} aria-hidden />
              </ButtonLink>
            </div>
            <hr className="section-rule" />
            <h3 className="inline-heading">Your saved sessions</h3>
            <p className="field-note" style={{ marginBottom: 20 }}>
              Tied to this browser. Export excludes images.
            </p>
            {loading ? (
              <p className="small muted" role="status">
                Opening your saved sessions…
              </p>
            ) : dataError ? (
              <Notice
                kind="error"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void loadSessions()}
                  >
                    Try again
                  </Button>
                }
              >
                {dataError}
              </Notice>
            ) : !sessions.length ? (
              <p className="small muted">No saved sessions yet.</p>
            ) : (
              sessions.map((session) => (
                <div className="data-row" key={session.id}>
                  <div>
                    <strong>
                      {session.activePlan?.name ||
                        LOOKS.find((look) => look.id === session.lookId)
                          ?.title ||
                        "Your studio"}
                    </strong>
                    <small>
                      {session.mode === "sample" ? "Sample · " : ""}
                      {STAGE_LABELS[session.stage]}
                    </small>
                  </div>
                  <div className="button-row" style={{ gap: 3 }}>
                    <Button
                      variant="quiet"
                      onClick={() => download(session)}
                      aria-label={`Export ${session.activePlan?.name || "session"}`}
                    >
                      <Download size={16} aria-hidden />
                      <span className="data-action-label">Export</span>
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setDeleteId(session.id);
                        setDeletedNotice(false);
                      }}
                      aria-label={`Delete ${session.activePlan?.name || "session"}`}
                    >
                      <Trash2 size={16} aria-hidden />
                      <span className="data-action-label">Delete</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
            {deleteId ? (
              <div className="delete-confirm">
                <h3>Delete this session and its photos?</h3>
                <p>Also removes its saved method.</p>
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
                    onClick={() => setDeleteId("")}
                    disabled={deleting}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}
            {deletedNotice ? (
              <p className="save-toast" role="status" style={{ marginTop: 20 }}>
                <Check size={16} aria-hidden />
                Session removed. Private photo deletion is queued.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
