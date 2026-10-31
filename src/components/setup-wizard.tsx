"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Hand,
  Heart,
  Paintbrush,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  LOOKS,
  MOTION_LABELS,
  PRODUCT_LABELS,
  SAMPLE_SETUP,
  TOOL_LABELS,
} from "@/lib/catalog";
import type {
  Comfort,
  LookId,
  Motion,
  Preferences,
  ProductId,
  SetupInput,
  StudioSession,
  ToolId,
} from "@/lib/contracts";
import { createSession, getConfig, getSession } from "@/lib/client";
import { uploadPhoto } from "@/lib/upload-client";
import {
  Button,
  DraftNote,
  Notice,
  ProvenanceLabel,
  SampleDisclosure,
} from "./ui";
import { StillCapture } from "./camera";
import { PhotoAssist } from "./photo-assist";

const steps = ["Your look", "Your movements", "Your tools", "Your photo"];
const motions: Motion[] = ["tapping", "blending", "short_strokes"];
const tools: ToolId[] = ["fingertips", "sponge", "wide_brush", "lip_brush"];
const products: ProductId[] = ["cream_blush", "powder_blush", "lip_color"];
const motionDetails: Record<Motion, string> = {
  tapping: "Light, gentle pressing",
  blending: "Broad, sweeping movements",
  short_strokes: "Small, controlled lines",
};
const toolDetails: Record<ToolId, string> = {
  fingertips: "Clean fingertips",
  sponge: "Your makeup sponge",
  wide_brush: "A soft, broad makeup brush",
  lip_brush: "Your small lip brush",
};

export function ComfortChoices({
  motion,
  value,
  onChange,
}: {
  motion: Motion;
  value: Comfort;
  onChange: (value: Comfort) => void;
}) {
  return (
    <div
      className="segmented-control"
      role="group"
      aria-label={`${MOTION_LABELS[motion]} comfort`}
    >
      {(
        [
          { value: "comfortable", label: "Feels good" },
          { value: "avoid", label: "Rather avoid" },
          { value: "unknown", label: "Not sure" },
        ] as const
      ).map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={`comfort-${motion}`}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function MovementFields({
  preferences,
  onChange,
  includePace = true,
}: {
  preferences: Preferences;
  onChange: (value: Preferences) => void;
  includePace?: boolean;
}) {
  return (
    <>
      <div className="movement-table">
        {motions.map((motion) => (
          <div className="movement-row" key={motion}>
            <div className="movement-title">
              {motion === "tapping" ? (
                <Hand aria-hidden />
              ) : motion === "blending" ? (
                <Paintbrush aria-hidden />
              ) : (
                <WandSparkles aria-hidden />
              )}
              <div>
                <strong>{MOTION_LABELS[motion]}</strong>
                <p>{motionDetails[motion]}</p>
              </div>
            </div>
            <ComfortChoices
              motion={motion}
              value={preferences.movements[motion]}
              onChange={(value) =>
                onChange({
                  ...preferences,
                  movements: { ...preferences.movements, [motion]: value },
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="preference-row">
        <div>
          <span className="label">Your preferred hand</span>
          <p className="small muted">Optional. Either is welcome.</p>
        </div>
        <div
          className="segmented-control"
          role="group"
          aria-label="Preferred hand"
        >
          {(
            [
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
              { value: "either", label: "Either" },
            ] as const
          ).map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name="preferred-hand"
                checked={preferences.hand === item.value}
                onChange={() => onChange({ ...preferences, hand: item.value })}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
      {includePace ? (
        <div className="preference-row">
          <div>
            <span className="label">A pace that’s yours</span>
            <p className="small muted">Every step waits for you.</p>
          </div>
          <div
            className="segmented-control"
            role="group"
            aria-label="Rest preference"
          >
            {(
              [
                { value: "my_pace", label: "I’ll choose breaks" },
                { value: "offer_breaks", label: "Offer me breaks" },
              ] as const
            ).map((item) => (
              <label key={item.value}>
                <input
                  type="radio"
                  name="preferred-pace"
                  checked={preferences.pace === item.value}
                  onChange={() =>
                    onChange({ ...preferences, pace: item.value })
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function freshPreferences() {
  return {
    ...DEFAULT_PREFERENCES,
    movements: { ...DEFAULT_PREFERENCES.movements },
  };
}

export function SetupWizard() {
  const query = useSearchParams();
  const router = useRouter();
  const initialSample = query.get("mode") === "sample";
  const initialLook = query.get("look");
  const [step, setStep] = useState(0);
  const [lookId, setLookId] = useState<LookId>(
    LOOKS.some((item) => item.id === initialLook)
      ? (initialLook as LookId)
      : "rose",
  );
  const [includeLips, setIncludeLips] = useState(
    initialSample ? SAMPLE_SETUP.includeLips : false,
  );
  const [preferences, setPreferences] = useState<Preferences>(
    initialSample
      ? {
          ...SAMPLE_SETUP.preferences,
          movements: { ...SAMPLE_SETUP.preferences.movements },
        }
      : freshPreferences,
  );
  const [selectedTools, setSelectedTools] = useState<ToolId[]>(
    initialSample ? [...SAMPLE_SETUP.tools] : [],
  );
  const [selectedProducts, setSelectedProducts] = useState<ProductId[]>(
    initialSample ? [...SAMPLE_SETUP.products] : [],
  );
  const [mode, setMode] = useState<SetupInput["mode"]>(
    initialSample ? "sample" : "personal",
  );
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [maxBytes, setMaxBytes] = useState(10 * 1024 * 1024);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [reuseName, setReuseName] = useState("");
  const [pendingSession, setPendingSession] = useState<StudioSession | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const changedStep = useRef(false);
  const currentLook = LOOKS.find((item) => item.id === lookId) || LOOKS[0];

  useEffect(() => {
    void getConfig()
      .then((value) => setMaxBytes(value.maxUploadBytes))
      .catch(() => {});
    if (!initialSample) {
      try {
        const stored = localStorage.getItem("steady-access-v1");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.preferences?.movements)
            queueMicrotask(() =>
              setPreferences({
                ...freshPreferences(),
                ...parsed.preferences,
                movements: {
                  ...DEFAULT_PREFERENCES.movements,
                  ...parsed.preferences.movements,
                },
              }),
            );
        }
      } catch {
        /* A device preference must never block a new session. */
      }
    }
    const from = query.get("from") || query.get("edit");
    if (from)
      void getSession(from)
        .then((source) => {
          const personalFromSample =
            source.mode === "sample" && !query.get("edit");
          setLookId(source.lookId);
          setIncludeLips(source.includeLips);
          setPreferences(
            personalFromSample
              ? freshPreferences()
              : {
                  ...source.preferences,
                  movements: { ...source.preferences.movements },
                },
          );
          setSelectedTools(personalFromSample ? [] : [...source.tools]);
          setSelectedProducts(personalFromSample ? [] : [...source.products]);
          setMode(query.get("edit") ? source.mode : "personal");
          setReuseName(source.activePlan?.name || "your previous setup");
        })
        .catch(() =>
          setError(
            "That saved method couldn’t be loaded. You can still choose a fresh setup here.",
          ),
        );
    // Query values describe only the initial fresh setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (changedStep.current) headingRef.current?.focus();
  }, [step]);

  function goTo(next: number) {
    setError("");
    changedStep.current = true;
    setStep(next);
  }
  function next() {
    if (step === 2 && (!selectedTools.length || !selectedProducts.length)) {
      setError(
        "Choose the tools and at least one product you actually have. We’ll explain if a method needs something else.",
      );
      return;
    }
    goTo(Math.min(3, step + 1));
  }
  function toggle<T extends string>(
    value: T,
    values: T[],
    setter: (next: T[]) => void,
  ) {
    setter(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  }

  async function enterStudio() {
    if (busy) return;
    if (!consent) {
      setError(
        mode === "sample"
          ? "Please confirm that you understand this is a synthetic sample walkthrough."
          : "Please confirm permission to process this selected photo before continuing.",
      );
      return;
    }
    if (mode === "personal" && !file) {
      setError(
        "Choose or take your baseline photo first. You can also explore with the labeled sample.",
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      setStatus("Saving your choices…");
      let session =
        pendingSession ||
        (await createSession({
          lookId,
          includeLips,
          preferences,
          tools: selectedTools,
          products: selectedProducts,
          mode,
          consent,
        }));
      setPendingSession(session);
      if (mode === "personal" && file) {
        setStatus("Saving your selected photo privately…");
        await uploadPhoto(file, session.id, "baseline");
        session = await getSession(session.id);
      }
      setStatus("Opening your methods…");
      router.push(`/studio/${session.id}/looks`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your studio couldn’t be saved yet. Your choices are still here; try again.",
      );
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="wrap page-wrap">
      <div className="setup-layout">
        <aside className="setup-aside">
          <p className="eyebrow">Your personal studio</p>
          <h1>
            Let’s begin
            <br /> with <em>you.</em>
          </h1>
          <p>
            A look you love, the tools you have, and the movements that feel
            right.
          </p>
          <ol className="setup-steps">
            {steps.map((name, index) => (
              <li key={name} className={index < step ? "is-done" : ""}>
                <button
                  onClick={() => goTo(index)}
                  aria-label={`${name}, step ${index + 1} of 4`}
                  disabled={index > step || busy || !!pendingSession}
                  aria-current={index === step ? "step" : undefined}
                >
                  <span className="setup-step-icon">
                    {index < step ? (
                      <Check size={13} aria-hidden />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="setup-privacy">
            <ShieldCheck size={18} aria-hidden />
            <span>
              Live camera stays on your device. Only photos you choose are
              uploaded.
            </span>
          </div>
        </aside>
        <div>
          <div className="setup-form" key={step}>
            <div className="setup-form-header">
              <p className="eyebrow">{steps[step]}</p>
              <span>0{step + 1} / 04</span>
            </div>
            {mode === "sample" ? (
              <div className="sample-banner">
                <SampleDisclosure />
              </div>
            ) : reuseName ? (
              <div className="sample-banner">
                <Notice title={`A fresh start with ${reuseName}`}>
                  We’ve brought over your choices. Confirm your tools and
                  movements today; no completed steps or photos are carried
                  forward.
                </Notice>
              </div>
            ) : null}
            {step === 0 ? (
              <>
                <h2 ref={headingRef} tabIndex={-1}>
                  A little color.
                  <br /> <em>A little more you.</em>
                </h2>
                <p className="setup-lede">
                  Choose the feeling you’d like to keep. These color studies are
                  starting points; your methods come next.
                </p>
                <div
                  className="look-choices"
                  role="group"
                  aria-label="Choose your color inspiration"
                >
                  {LOOKS.map((look) => (
                    <button
                      className="look-choice"
                      aria-pressed={lookId === look.id}
                      key={look.id}
                      onClick={() => setLookId(look.id)}
                    >
                      <span className="look-choice-art">
                        <span
                          className="paint-smear"
                          style={{ background: look.color }}
                        />
                      </span>
                      <span className="look-choice-name">{look.title}</span>
                      <span className="look-choice-sub">{look.subtitle}</span>
                      {lookId === look.id ? (
                        <span className="selected-check">
                          <Check size={14} aria-hidden />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="look-detail">
                  <strong>{currentLook.description}</strong>
                  <br /> {currentLook.attributes.join(" · ")}
                </div>
                <div className="form-field">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeLips}
                      onChange={(event) => setIncludeLips(event.target.checked)}
                    />
                    <span>
                      <strong>Add a touch of lip color</strong>
                      <br /> Optional. A lip method needs your own lip product
                      and a comfortable movement.
                    </span>
                  </label>
                </div>
                <PhotoAssist
                  kind="inspiration"
                  onLook={(result) => setLookId(result.lookId)}
                />
              </>
            ) : null}
            {step === 1 ? (
              <>
                <h2 ref={headingRef} tabIndex={-1}>
                  How do you
                  <br /> <em>like to move?</em>
                </h2>
                <p className="setup-lede">
                  You know your movements best. Choose what feels comfortable
                  today, and change your mind whenever you need.
                </p>
                <MovementFields
                  preferences={preferences}
                  onChange={setPreferences}
                />
                <details
                  className="method-details"
                  open={practiceOpen}
                  onToggle={(event) =>
                    setPracticeOpen(event.currentTarget.open)
                  }
                >
                  <summary>
                    Not sure? Try it away from your face.{" "}
                    <ChevronDown size={17} aria-hidden />
                  </summary>
                  <p className="field-note">
                    With a clean tool and no product, rehearse a gentle tap, a
                    broad sweep, or a short line on the back of your hand.
                    Choose “Feels good” only if that movement feels comfortable
                    to you. This is your assessment.
                  </p>
                </details>
                <p className="field-note">
                  “Not sure” is a real answer. A method requiring that movement
                  will wait for your confirmation.
                </p>
              </>
            ) : null}
            {step === 2 ? (
              <>
                <h2 ref={headingRef} tabIndex={-1}>
                  Your everyday
                  <br /> <em>workbench.</em>
                </h2>
                <p className="setup-lede">
                  Choose only what you have with you. There’s no shopping list
                  to get started.
                </p>
                <fieldset className="field-group">
                  <legend>Your tools</legend>
                  <div className="option-grid">
                    {tools.map((tool) => (
                      <label className="tool-option" key={tool}>
                        <input
                          type="checkbox"
                          checked={selectedTools.includes(tool)}
                          onChange={() =>
                            toggle(tool, selectedTools, setSelectedTools)
                          }
                        />
                        <span className="tool-option-icon">
                          {tool === "fingertips" ? (
                            <Hand size={28} strokeWidth={1.2} aria-hidden />
                          ) : tool === "sponge" ? (
                            <Circle size={26} strokeWidth={1.2} aria-hidden />
                          ) : (
                            <Paintbrush
                              size={28}
                              strokeWidth={1.2}
                              aria-hidden
                            />
                          )}
                        </span>
                        <span>
                          <strong>{TOOL_LABELS[tool]}</strong>
                          <small>{toolDetails[tool]}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="field-group" style={{ marginTop: 28 }}>
                  <legend>Your products</legend>
                  <div className="option-grid">
                    {products.map((product) => (
                      <label className="tool-option" key={product}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product)}
                          onChange={() =>
                            toggle(
                              product,
                              selectedProducts,
                              setSelectedProducts,
                            )
                          }
                        />
                        <span className="tool-option-icon">
                          <span
                            className="product-dot"
                            style={{
                              display: "block",
                              width: 25,
                              height: 25,
                              background:
                                product === "lip_color"
                                  ? currentLook.lipColor
                                  : currentLook.color,
                              borderRadius:
                                product === "powder_blush" ? "50%" : "7px",
                              border: "1px solid #0002",
                            }}
                          />
                        </span>
                        <span>
                          <strong>{PRODUCT_LABELS[product]}</strong>
                          <small>Confirm your own product</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details className="method-details">
                  <summary>
                    Can I use a different tool?{" "}
                    <ChevronDown size={17} aria-hidden />
                  </summary>
                  <p className="field-note">
                    Select the closest supported tool only if it is the tool you
                    have. The planner won’t substitute an unconfirmed tool. You
                    can revisit this setup if your workbench changes.
                  </p>
                </details>
                <PhotoAssist
                  kind="tools"
                  onTools={(newTools, newProducts, source) => {
                    if (source === "sample") {
                      setMode("sample");
                      setConsent(false);
                    }
                    setSelectedTools((current) => [
                      ...new Set([...current, ...newTools]),
                    ]);
                    setSelectedProducts((current) => [
                      ...new Set([...current, ...newProducts]),
                    ]);
                  }}
                />
                <p className="field-note">
                  Use products in the areas and ways their manufacturer
                  recommends. Recognition suggests an identity; you confirm the
                  item and its availability.
                </p>
              </>
            ) : null}
            {step === 3 ? (
              <>
                <h2 ref={headingRef} tabIndex={-1}>
                  Make room
                  <br /> <em>for your face.</em>
                </h2>
                <p className="setup-lede">
                  A clear starting photo gives your virtual previews a
                  reference. Your live mirror stays natural and unretouched.
                </p>
                <div
                  className="mode-choice"
                  role="group"
                  aria-label="Session photo mode"
                >
                  <Button
                    variant="secondary"
                    className={mode === "personal" ? "is-selected" : ""}
                    onClick={() => {
                      if (mode === "sample") {
                        setPreferences(freshPreferences());
                        setSelectedTools([]);
                        setSelectedProducts([]);
                        goTo(1);
                      }
                      setMode("personal");
                      setConsent(false);
                    }}
                    disabled={!!pendingSession}
                  >
                    <Camera size={16} aria-hidden />
                    Use my photo
                  </Button>
                  <Button
                    variant="secondary"
                    className={mode === "sample" ? "is-selected" : ""}
                    onClick={() => {
                      setMode("sample");
                      setConsent(false);
                    }}
                    disabled={!!pendingSession}
                  >
                    <Sparkles size={16} aria-hidden />
                    Use the sample
                  </Button>
                </div>
                {mode === "personal" ? (
                  <StillCapture
                    file={file}
                    onSelected={setFile}
                    maxBytes={maxBytes}
                    label="Choose your starting photo"
                  />
                ) : (
                  <div className="sample-photo">
                    <Image
                      src="/images/studio-portrait.jpg"
                      alt="AI-created adult sample portrait"
                      width={1000}
                      height={1200}
                    />
                    <ProvenanceLabel kind="synthetic_inspiration" />
                  </div>
                )}
                <div className="form-field">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>
                      {mode === "personal" ? (
                        <>
                          <strong>
                            I’m 18 or older and this is my photo, or I have
                            permission to use it.
                          </strong>
                          <br /> I agree to store this selected still privately
                          and send it to YouCam for the virtual previews I
                          request. Live video is not uploaded. I can delete my
                          session in settings.
                        </>
                      ) : (
                        <>
                          <strong>
                            I understand this is a synthetic sample walkthrough.
                          </strong>
                          <br /> The example portrait is AI-created. Steps can
                          be explored, but a sample completion does not
                          represent an actual participant outcome.
                        </>
                      )}
                    </span>
                  </label>
                </div>
                <DraftNote />
              </>
            ) : null}
            {error ? (
              <div style={{ marginTop: 22 }}>
                <Notice kind="error">{error}</Notice>
              </div>
            ) : null}
            <p className="sr-only" role="status">
              {status}
            </p>
            <div className="setup-navigation">
              {step > 0 ? (
                <Button
                  variant="quiet"
                  onClick={() => goTo(step - 1)}
                  disabled={busy || !!pendingSession}
                >
                  <ArrowLeft size={17} aria-hidden />
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < 3 ? (
                <Button onClick={next}>
                  Continue <ArrowRight size={18} aria-hidden />
                </Button>
              ) : (
                <Button onClick={() => void enterStudio()} busy={busy}>
                  {busy ? "Opening your studio…" : "Find my methods"}
                  <ArrowRight size={18} aria-hidden />
                </Button>
              )}
            </div>
          </div>
          <p
            className="local-pref-note"
            style={{ display: "flex", gap: 7, alignItems: "center" }}
          >
            <Heart size={14} aria-hidden />
            No timer. No perfect answer. There’s room to change things.
          </p>
        </div>
      </div>
    </div>
  );
}
