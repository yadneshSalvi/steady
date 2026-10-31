"use client";

import { Check, ChevronDown, ImagePlus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOOKS, PRODUCT_LABELS, TOOL_LABELS } from "@/lib/catalog";
import type { LookId, ProductId, ToolId } from "@/lib/contracts";
import { api } from "@/lib/client";
import { imageToDataUrl } from "@/lib/upload-client";
import { StillCapture } from "./camera";
import { Button, Notice } from "./ui";

type InspirationSuggestion = {
  lookId: LookId;
  attributes: string[];
  description: string;
  uncertainties: string[];
};
type ToolSuggestion = {
  tools: ToolId[];
  products: ProductId[];
  notes: string[];
};

export function PhotoAssist({
  kind,
  onLook,
  onTools,
  allowSampleInventory = true,
}: {
  kind: "inspiration" | "tools";
  allowSampleInventory?: boolean;
  onLook?: (result: InspirationSuggestion) => void;
  onTools?: (
    tools: ToolId[],
    products: ProductId[],
    source: "personal" | "sample",
  ) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inspiration, setInspiration] = useState<InspirationSuggestion | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<ToolSuggestion | null>(null);
  const [confirmedTools, setConfirmedTools] = useState<ToolId[]>([]);
  const [confirmedProducts, setConfirmedProducts] = useState<ProductId[]>([]);
  const [applied, setApplied] = useState(false);
  const [sampleInventory, setSampleInventory] = useState(false);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const requestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      requestSequence.current += 1;
      activeRequest.current?.abort();
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
    },
    [],
  );

  function cancelAnalysis(message?: string) {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    if (requestTimeout.current) clearTimeout(requestTimeout.current);
    requestTimeout.current = null;
    setBusy(false);
    if (message) setError(message);
  }

  function select(next: File | null) {
    cancelAnalysis();
    setFile(next);
    setConsent(false);
    setError("");
    setInspiration(null);
    setSuggestions(null);
    setApplied(false);
    setConfirmedTools([]);
    setConfirmedProducts([]);
    setSampleInventory(false);
  }
  async function chooseSampleInventory() {
    setError("");
    const selectionId = requestSequence.current;
    try {
      const response = await fetch("/images/workbench-sample.jpg");
      if (!response.ok)
        throw new Error(
          "The sample inventory couldn’t be opened. Your own photo and manual choices are still available.",
        );
      const blob = await response.blob();
      if (requestSequence.current !== selectionId) return;
      select(
        new File([blob], "steady-synthetic-workbench.jpg", {
          type: "image/jpeg",
        }),
      );
      setSampleInventory(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The sample couldn’t be opened.",
      );
    }
  }
  async function analyze() {
    if (!file || !consent || busy) return;
    setBusy(true);
    setError("");
    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timer = setTimeout(() => {
      if (requestSequence.current !== requestId) return;
      cancelAnalysis(
        "This image is taking longer than expected. Your manual choices are still here. Try again when you’re ready, or choose another photo.",
      );
    }, 90_000);
    requestTimeout.current = timer;
    try {
      const image = await imageToDataUrl(file);
      if (controller.signal.aborted || requestSequence.current !== requestId)
        return;
      if (kind === "inspiration") {
        const result = await api<InspirationSuggestion>("/api/inspiration", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ image, consent: true }),
        });
        if (!controller.signal.aborted && requestSequence.current === requestId)
          setInspiration(result);
      } else {
        const result = await api<ToolSuggestion>("/api/tool-suggestions", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ image, consent: true }),
        });
        if (!controller.signal.aborted && requestSequence.current === requestId)
          setSuggestions(result);
      }
    } catch (cause) {
      if (!controller.signal.aborted && requestSequence.current === requestId)
        setError(
          cause instanceof Error
            ? cause.message
            : "The image couldn’t be interpreted yet. You can still choose everything manually.",
        );
    } finally {
      clearTimeout(timer);
      if (activeRequest.current === controller) activeRequest.current = null;
      if (requestSequence.current === requestId) {
        requestTimeout.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <details className="photo-assist">
      <summary>
        <ImagePlus size={18} aria-hidden />
        <span>
          {kind === "inspiration"
            ? "Start from a photo you love"
            : "Photograph your workbench"}
        </span>
        <ChevronDown size={17} aria-hidden />
      </summary>
      <div className="photo-assist-body">
        <p>
          {kind === "inspiration"
            ? "AI can suggest the closest available color family and describe what it sees. You choose which interpretation to keep."
            : "AI can suggest supported tools and products from a clear photo. You’ll confirm each one before it can enter your method."}
        </p>
        <StillCapture
          file={file}
          onSelected={select}
          showGuidelines={false}
          label={
            kind === "inspiration"
              ? "Choose an inspiration reference"
              : "Choose a photo of your tools"
          }
          description={
            kind === "inspiration"
              ? "Choose a photo you have permission to use. It is a reference for your goal, not a photo of your result."
              : "Lay your own tools and products on a clear surface. Keep product labels visible where possible."
          }
          previewLabel={
            sampleInventory
              ? "AI-created sample inventory"
              : kind === "inspiration"
                ? "Your inspiration reference"
                : "Your tool reference"
          }
        />
        {kind === "tools" && !file && allowSampleInventory ? (
          <Button
            variant="quiet"
            onClick={() => void chooseSampleInventory()}
            style={{ marginTop: 12 }}
          >
            <Sparkles size={17} aria-hidden />
            Try a sample workbench
          </Button>
        ) : null}
        {sampleInventory ? (
          <p className="field-note">
            AI-created sample inventory. These items don’t represent tools you
            personally own; confirm the example suggestions to continue in a
            clearly labeled sample studio.
          </p>
        ) : null}
        {file && !inspiration && !suggestions ? (
          <>
            <label className="checkbox-label" style={{ marginTop: 20 }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                I have permission to use this image and agree to send this
                selected still to Google Gemini or OpenAI for{" "}
                {kind === "inspiration"
                  ? "color-reference interpretation"
                  : "tool and product suggestions"}
                . Live camera frames stay on my device.
              </span>
            </label>
            <Button
              variant="secondary"
              onClick={() => void analyze()}
              busy={busy}
              disabled={!consent}
              style={{ marginTop: 15 }}
            >
              <Sparkles size={17} aria-hidden />
              {kind === "inspiration"
                ? "Interpret this inspiration"
                : "Suggest my tools"}
            </Button>
          </>
        ) : null}
        {busy ? (
          <Button
            variant="quiet"
            onClick={() =>
              cancelAnalysis(
                "This request was stopped. Your photo is still selected; try again whenever you’re ready.",
              )
            }
            style={{ marginTop: 10 }}
          >
            Stop this request
          </Button>
        ) : null}
        {error ? (
          <div style={{ marginTop: 18 }}>
            <Notice kind="error">
              {error} Your manual choices remain available.
            </Notice>
          </div>
        ) : null}
        {inspiration ? (
          <div className="photo-assist-result">
            <p className="eyebrow">AI color interpretation</p>
            <h3>
              {LOOKS.find((look) => look.id === inspiration.lookId)?.title ||
                "Your starting color"}
            </h3>
            <p>{inspiration.description}</p>
            <div className="tag-row" style={{ marginTop: 15 }}>
              {inspiration.attributes.map((attribute) => (
                <span className="pill" key={attribute}>
                  {attribute}
                </span>
              ))}
            </div>
            {inspiration.uncertainties.length ? (
              <p className="field-note">
                {inspiration.uncertainties.join(" ")}
              </p>
            ) : null}
            <Button
              onClick={() => {
                onLook?.(inspiration);
                setApplied(true);
              }}
              disabled={applied}
              style={{ marginTop: 20 }}
            >
              {applied ? (
                <Check size={17} aria-hidden />
              ) : (
                <Sparkles size={17} aria-hidden />
              )}
              {applied ? "Starting color selected" : "Use this interpretation"}
            </Button>
          </div>
        ) : null}
        {suggestions ? (
          <div className="photo-assist-result">
            <p className="eyebrow">Suggestions to confirm</p>
            <h3>
              Your eyes have
              <br /> <em>the final say.</em>
            </h3>
            <p>
              Tick only items that are correctly identified and available to you
              today.
            </p>
            {!suggestions.tools.length && !suggestions.products.length ? (
              <Notice>
                No supported tools or products could be identified. Use the
                manual workbench choices above.
              </Notice>
            ) : (
              <div className="option-grid" style={{ marginTop: 20 }}>
                {suggestions.tools.map((tool) => (
                  <label className="tool-option" key={tool}>
                    <input
                      type="checkbox"
                      checked={confirmedTools.includes(tool)}
                      onChange={(event) => {
                        setConfirmedTools((current) =>
                          event.target.checked
                            ? [...current, tool]
                            : current.filter((value) => value !== tool),
                        );
                        setApplied(false);
                      }}
                    />
                    <strong>{TOOL_LABELS[tool]}</strong>
                  </label>
                ))}
                {suggestions.products.map((product) => (
                  <label className="tool-option" key={product}>
                    <input
                      type="checkbox"
                      checked={confirmedProducts.includes(product)}
                      onChange={(event) => {
                        setConfirmedProducts((current) =>
                          event.target.checked
                            ? [...current, product]
                            : current.filter((value) => value !== product),
                        );
                        setApplied(false);
                      }}
                    />
                    <strong>{PRODUCT_LABELS[product]}</strong>
                  </label>
                ))}
              </div>
            )}
            {suggestions.notes.length ? (
              <p className="field-note">{suggestions.notes.join(" ")}</p>
            ) : null}
            {suggestions.tools.length || suggestions.products.length ? (
              <Button
                onClick={() => {
                  onTools?.(
                    confirmedTools,
                    confirmedProducts,
                    sampleInventory ? "sample" : "personal",
                  );
                  setApplied(true);
                }}
                disabled={
                  applied ||
                  (!confirmedTools.length && !confirmedProducts.length)
                }
                style={{ marginTop: 20 }}
              >
                <Check size={17} aria-hidden />
                {applied
                  ? "Confirmed items added"
                  : sampleInventory
                    ? "Confirm sample items"
                    : "Confirm selected items"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
