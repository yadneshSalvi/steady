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
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, LOOKS } from "@/lib/catalog";
import { deleteSession, listSessions } from "@/lib/client";
import type { Preferences, StudioSession } from "@/lib/contracts";
import { applyDevicePreferences } from "./access-preferences";
import { MovementFields } from "./setup-wizard";
import { Button, ButtonLink, Notice } from "./ui";

function Toggle({
  id,
  title,
  description,
  value,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-toggle">
      <div>
        <label htmlFor={id}>
          <strong>{title}</strong>
        </label>
        <p id={`${id}-description`}>{description}</p>
      </div>
      <label className="switch">
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={`${id}-description`}
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
    <div className="wrap page-wrap settings-page">
      <div className="page-intro">
        <p className="eyebrow">Make yourself comfortable</p>
        <h1>
          A studio that
          <br /> <em>moves with you.</em>
        </h1>
        <p>
          Your preferred controls, your movements, your data. Make this space
          feel a little more yours.
        </p>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#your-comfort">
            <Hand size={17} aria-hidden />
            Your comfort
          </a>
          <a href="#your-controls">
            <SlidersHorizontal size={17} aria-hidden />
            Your controls
          </a>
          <a href="#your-data">
            <ShieldCheck size={17} aria-hidden />
            Photos & data
          </a>
        </nav>
        <div>
          <section className="settings-section" id="your-comfort">
            <h2>
              How you like
              <br /> <em>to move.</em>
            </h2>
            <p style={{ marginBottom: 25 }}>
              These choices are stored on this device and prefill a new setup.
              Each session keeps its own confirmed choices, which you can edit
              in the mirror.
            </p>
            <MovementFields
              preferences={preferences}
              onChange={changePreferences}
            />
          </section>
          <section className="settings-section" id="your-controls">
            <h2>
              A little more
              <br /> <em>your kind of comfortable.</em>
            </h2>
            <p>
              Touch and keyboard controls remain available for every essential
              action.
            </p>
            <Toggle
              id="settings-audio"
              title="Read each studio instruction"
              description="Use your browser’s speech voice. Pause immediately stops the spoken instruction; no microphone is needed."
              value={preferences.audio}
              onChange={(audio) => changePreferences({ ...preferences, audio })}
            />
            <Toggle
              id="settings-mirror"
              title="Mirror view"
              description="See yourself as you would in a mirror. Photo view keeps the camera’s original orientation; saved captures use the original pixels."
              value={preferences.mirror}
              onChange={(mirror) =>
                changePreferences({ ...preferences, mirror })
              }
            />
            <Toggle
              id="settings-reduced-motion"
              title="Less motion"
              description="Use minimal transitions. Your system’s reduced-motion setting is always respected too."
              value={reducedMotion}
              onChange={(value) => {
                setReducedMotion(value);
                setSaved(false);
              }}
            />
            <Toggle
              id="settings-larger-text"
              title="Larger studio instructions"
              description="Increase the size of the current instruction and its supporting guidance."
              value={largerText}
              onChange={(value) => {
                setLargerText(value);
                setSaved(false);
              }}
            />
            <p className="local-pref-note">
              Your browser’s zoom and text enlargement work throughout the
              studio. Essential controls don’t need dragging, hovering, or a
              timed response.
            </p>
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
            <p role="status">
              {saved
                ? "Saved on this device."
                : "Changes apply to future setups."}
            </p>
          </div>
          <section
            className="settings-section"
            id="your-data"
            style={{ marginTop: 45 }}
          >
            <h2>
              Your photos.
              <br /> <em>Your say.</em>
            </h2>
            <p>
              The live mirror and face guides run on your device. You choose
              each still that enters a saved session.
            </p>
            <ul className="privacy-list">
              <li>
                <Camera size={21} aria-hidden />
                <div>
                  <strong>Live camera frames stay on this device</strong>
                  <p>
                    The app doesn’t upload your live video stream. A photo is
                    captured only when you choose to take one.
                  </p>
                </div>
              </li>
              <li>
                <Volume2 size={21} aria-hidden />
                <div>
                  <strong>You choose any AI image processing</strong>
                  <p>
                    Virtual color previews send your selected photo to YouCam.
                    Optional reference matching, tool suggestions and AI
                    checkpoints may send a selected image to Google Gemini or
                    OpenAI, with your consent.
                  </p>
                </div>
              </li>
              <li>
                <ShieldCheck size={21} aria-hidden />
                <div>
                  <strong>Stored photos belong to your private session</strong>
                  <p>
                    Your photos aren’t a public gallery. Deleting a session
                    removes its saved method and queues deletion of its private
                    photos. Sessions are also subject to a 30-day retention
                    policy. An external provider’s processing and retention
                    policy applies to copies already sent there.
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
              These sessions are tied to this browser’s private studio. Clearing
              its cookies can remove your access. Export keeps a JSON record of
              your choices and events, without image download links.
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
              <p className="small muted">
                No saved sessions yet. Your next studio can start whenever
                you’re ready.
              </p>
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
                      {session.mode === "sample"
                        ? "Synthetic sample"
                        : "Personal session"}{" "}
                      · {session.stage} · {session.assets.length} saved{" "}
                      {session.assets.length === 1 ? "image" : "images"}
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
                <p>
                  This also removes its saved method from STEADY. Copies already
                  processed by an external provider follow that provider’s
                  retention policy.
                </p>
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
