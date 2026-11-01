"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Hand,
  Paintbrush,
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
import {
  commandSession,
  createSession,
  getConfig,
  getSession,
} from "@/lib/client";
import { planCandidates } from "@/lib/planner/compiler";
import { uploadPhoto } from "@/lib/upload-client";
import { Button, Notice, SampleBadge, SpongeIcon } from "./ui";
import { StillCapture } from "./camera";
import { PhotoAssist } from "./photo-assist";

const steps = ["Your look", "Your movements", "Your tools", "Your photo"];
const motions: Motion[] = ["tapping", "blending", "short_strokes"];
const tools: ToolId[] = [
  "fingertips",
  "sponge",
  "wide_brush",
  "lip_brush",
  "liner_pen",
];
const products: ProductId[] = [
  "cream_blush",
  "powder_blush",
  "lip_color",
  "eye_liner",
  "eye_shadow",
];

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
            <span className="label">Breaks</span>
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
  const [consent, setConsent] = useState(initialSample);
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
  const currentSetup: SetupInput = {
    lookId,
    includeLips,
    preferences,
    tools: selectedTools,
    products: selectedProducts,
    mode,
    consent: mode === "sample" || consent,
  };
  const feasibility = planCandidates(currentSetup);
  const retainedPhoto = pendingSession?.assets.find(
    (asset) => asset.id === pendingSession.sourceAssetId,
  );

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
          setIncludeLips(
            query.get("edit") && source.mode === "sample"
              ? false
              : source.includeLips,
          );
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
          if (
            query.get("edit") &&
            ["choosing", "ready"].includes(source.stage)
          ) {
            setPendingSession(source);
            setConsent(true);
          } else if (query.get("edit")) {
            setError(
              "Your application has started. Change its remaining method in the mirror, or start a fresh studio.",
            );
          }
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
    if (
      step === 1 &&
      !Object.values(preferences.movements).some(
        (value) => value === "comfortable",
      )
    ) {
      setError(
        "Confirm at least one movement that feels good. You can try it away from your face first, or return when you are ready.",
      );
      return;
    }
    if (step === 2 && !feasibility.candidates.length) {
      setError(
        lookId === "eyes"
          ? "No method fits yet. Pair comfortable short strokes with an eyeliner pen and eye liner, or tapping with fingertips or an eyelid-suitable sponge and eye shadow."
          : "No method fits yet. Pair a comfortable movement with its tool and product: tapping with fingertips or a sponge and cream blush, or broad blending with a suitable brush and blush. Lip color also needs a matching lip method.",
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

  function chooseSampleMode() {
    if (pendingSession && pendingSession.mode !== "sample") {
      setError(
        "Open a new sample studio to explore fictional inventory. This studio keeps your own photo and confirmed tools.",
      );
      return false;
    }
    setMode("sample");
    setIncludeLips(false);
    setFile(null);
    setConsent(true);
    return true;
  }

  async function enterStudio() {
    if (busy) return;
    if (mode === "personal" && !consent) {
      setError(
        "Please confirm permission to process this selected photo before continuing.",
      );
      return;
    }
    if (mode === "personal" && !file && !retainedPhoto) {
      setError(
        "Choose or take your baseline photo first. You can also explore with the labeled sample.",
      );
      return;
    }
    if (!feasibility.candidates.length) {
      setError(
        "Choose a comfortable movement and its matching tool and product before continuing.",
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      setStatus("Saving your choices…");
      let session = pendingSession
        ? await commandSession(pendingSession, {
            type: "update_setup",
            setup: currentSetup,
          })
        : await createSession(currentSetup);
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

  const headings = [
    "Choose a color",
    "How do you like to move?",
    "Your tools",
    "Your photo",
  ];
  return (
    <div className="wrap page-wrap r3-setup">
      <nav aria-label="Setup progress">
        <ol className="setup-steps">
          {steps.map((name, index) => (
            <li key={name} className={index < step ? "is-done" : ""}>
              <button
                onClick={() => goTo(index)}
                aria-label={`${name}, step ${index + 1} of 4`}
                disabled={index > step || busy}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="setup-step-icon">
                  {index < step ? <Check size={14} aria-hidden /> : index + 1}
                </span>
                <span>{name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="setup-form" key={step}>
        <div className="page-intro">
          {mode === "sample" ? <SampleBadge /> : null}
          <h1 ref={headingRef} tabIndex={-1}>
            {headings[step]}
          </h1>
        </div>
        {reuseName ? (
          <Notice>
            {query.get("edit")
              ? "Your setup, ready to adjust"
              : `A fresh start with ${reuseName}`}
          </Notice>
        ) : null}
        {step === 0 ? (
          <>
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
                  onClick={() => {
                    setLookId(look.id);
                    if (look.id === "eyes") setIncludeLips(false);
                  }}
                >
                  <span className="look-choice-art">
                    <span
                      className="paint-smear"
                      style={{ background: look.color }}
                    />
                  </span>
                  <span className="look-choice-name">{look.title}</span>
                  {lookId === look.id ? (
                    <span className="selected-check">
                      <Check size={14} aria-hidden />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {lookId !== "eyes" && mode !== "sample" ? (
              <div className="form-field">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeLips}
                    onChange={(event) => setIncludeLips(event.target.checked)}
                  />
                  <span>Add a touch of lip color</span>
                </label>
              </div>
            ) : null}
            <PhotoAssist
              kind="inspiration"
              onLook={(result) => {
                setLookId(result.lookId);
                if (result.lookId === "eyes") setIncludeLips(false);
              }}
            />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <MovementFields
              preferences={preferences}
              onChange={setPreferences}
            />
            <details
              className="method-details"
              open={practiceOpen}
              onToggle={(event) => setPracticeOpen(event.currentTarget.open)}
            >
              <summary>
                Try a movement <ChevronDown size={17} aria-hidden />
              </summary>
              <p>Rehearse on the back of your hand, without product.</p>
            </details>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <fieldset className="field-group">
              <legend>Tools</legend>
              <div className="option-grid">
                {tools
                  .filter((tool) =>
                    lookId === "eyes"
                      ? ["fingertips", "sponge", "liner_pen"].includes(tool)
                      : tool !== "liner_pen" &&
                        (includeLips || tool !== "lip_brush"),
                  )
                  .map((tool) => (
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
                          <SpongeIcon size={28} strokeWidth={1.2} />
                        ) : (
                          <Paintbrush size={28} strokeWidth={1.2} aria-hidden />
                        )}
                      </span>
                      <strong>{TOOL_LABELS[tool]}</strong>
                    </label>
                  ))}
              </div>
            </fieldset>
            <fieldset className="field-group">
              <legend>Products</legend>
              <div className="option-grid">
                {products
                  .filter((product) =>
                    lookId === "eyes"
                      ? ["eye_liner", "eye_shadow"].includes(product)
                      : !["eye_liner", "eye_shadow"].includes(product) &&
                        (includeLips || product !== "lip_color"),
                  )
                  .map((product) => (
                    <label className="tool-option" key={product}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product)}
                        onChange={() =>
                          toggle(product, selectedProducts, setSelectedProducts)
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
                          }}
                        />
                      </span>
                      <strong>{PRODUCT_LABELS[product]}</strong>
                    </label>
                  ))}
              </div>
            </fieldset>
            <PhotoAssist
              kind="tools"
              allowSampleInventory={
                !pendingSession || pendingSession.mode === "sample"
              }
              onTools={(newTools, newProducts, source) => {
                if (source === "sample" && !chooseSampleMode()) return;
                setSelectedTools((current) => [
                  ...new Set([...current, ...newTools]),
                ]);
                setSelectedProducts((current) => [
                  ...new Set([...current, ...newProducts]),
                ]);
              }}
            />
          </>
        ) : null}
        {step === 3 ? (
          <>
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
                  chooseSampleMode();
                }}
                disabled={!!pendingSession}
              >
                <Sparkles size={16} aria-hidden />
                Use the sample
              </Button>
            </div>
            {mode === "personal" && retainedPhoto && !file ? (
              <div className="retained-photo">
                <Image
                  src={retainedPhoto.url}
                  alt="Your saved starting photo"
                  width={160}
                  height={200}
                  unoptimized
                />
                <p>Your starting photo is kept.</p>
              </div>
            ) : null}
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
                  width={1024}
                  height={1280}
                  sizes="(max-width: 740px) 80vw, 240px"
                />
              </div>
            )}
            {mode === "personal" ? (
              <div className="form-field">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    I’m 18+, have photo permission, and allow private storage
                    and YouCam previews.
                  </span>
                </label>
              </div>
            ) : null}
          </>
        ) : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
        <p className="sr-only" role="status">
          {status}
        </p>
        <div className="setup-navigation">
          {step > 0 ? (
            <Button
              variant="quiet"
              onClick={() => goTo(step - 1)}
              disabled={busy}
            >
              <ArrowLeft size={17} aria-hidden />
              Back
            </Button>
          ) : (
            <span />
          )}
          <div className="setup-next">
            {step >= 1 ? (
              <span className="setup-feasibility" role="status">
                {feasibility.candidates.length
                  ? `${feasibility.candidates.length} ${feasibility.candidates.length === 1 ? "method fits" : "methods fit"}`
                  : "No method fits yet"}
              </span>
            ) : null}
            {step < 3 ? (
              <Button onClick={next}>
                Continue <ArrowRight size={18} aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => void enterStudio()} busy={busy}>
                {busy ? "Opening studio…" : "Find my methods"}
                <ArrowRight size={18} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
