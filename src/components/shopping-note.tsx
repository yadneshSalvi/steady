"use client";
import { useState } from "react";
import { ChevronDown, Copy, Printer } from "lucide-react";
import { LOOKS, PRODUCT_LABELS, TOOL_LABELS } from "@/lib/catalog";
import type { CandidatePlan, LookId } from "@/lib/contracts";
import { ActionList, Button } from "./ui";

export function ShoppingNote({
  plan,
  lookId,
  completed = [],
  variant = "disclosure",
}: {
  plan: CandidatePlan;
  lookId: LookId;
  completed?: string[];
  /** "card" keeps the short note visible (review); the drawer discloses it. */
  variant?: "disclosure" | "card";
}) {
  const [copied, setCopied] = useState(false);
  const look = LOOKS.find((item) => item.id === lookId)!;
  const effect = plan.recipe.find((item) =>
    ["eye_liner", "eye_shadow", "blush"].includes(item.category),
  );
  const palette = Array.isArray(effect?.palettes) ? effect.palettes[0] : null;
  const shade =
    palette &&
    typeof palette === "object" &&
    !Array.isArray(palette) &&
    typeof palette.color === "string"
      ? palette.color
      : look.color;
  const texture =
    plan.routeId === "liner"
      ? "Matte eye liner"
      : plan.routeId === "shadow"
        ? "Matte eye shadow"
        : plan.routeId === "sweep"
          ? "Matte powder"
          : "Satin cream";
  const supplies = [
    ...new Map(
      plan.actions.map((action) => [
        `${action.tool}:${action.product}`,
        action,
      ]),
    ).values(),
  ];
  const text = [
    `STEADY · ${look.title}`,
    plan.name,
    ...supplies.map(
      (item) => `${TOOL_LABELS[item.tool]} + ${PRODUCT_LABELS[item.product]}`,
    ),
    `Texture: ${texture}`,
    `Shade reference: ${shade}`,
    `Target: ${plan.selectedPreviewVariantId ?? "full"}`,
    "Use the products you own first. Compare the shade in your own light.",
  ].join("\n");
  function printNote() {
    const tab = window.open(
      "",
      "_blank",
      "noopener=false,width=640,height=720",
    );
    if (!tab) return;
    tab.document.title = "STEADY · My method note";
    const heading = tab.document.createElement("h1");
    heading.textContent = "Your method";
    const content = tab.document.createElement("pre");
    content.textContent = text;
    content.style.cssText =
      "white-space:pre-wrap;font:18px/1.7 system-ui;padding:20px";
    tab.document.body.append(heading, content);
    tab.document.body.style.cssText =
      "padding:35px;color:#244b3a;background:#fffaf1";
    tab.opener = null;
    tab.print();
  }
  const actions = (
    <div className="button-row">
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard
            .writeText(shade)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        <Copy size={16} aria-hidden />
        {copied ? "Shade copied" : "Copy shade"}
      </Button>
      <Button variant="quiet" onClick={printNote}>
        <Printer size={16} aria-hidden />
        Print shopping note
      </Button>
    </div>
  );
  if (variant === "card")
    return (
      <section
        className="shopping-note shopping-note--card"
        aria-labelledby="shopping-note-title"
      >
        <span
          className="shopping-note-swatch"
          style={{ background: shade }}
          role="img"
          aria-label={`Shade reference ${shade}`}
        />
        <div className="shopping-note-lines">
          <h2 id="shopping-note-title">Your method</h2>
          <p>
            {`${look.title} · ${texture} · `}
            <code>{shade}</code>
          </p>
          <p>
            {supplies
              .map(
                (item) =>
                  `${TOOL_LABELS[item.tool]} + ${PRODUCT_LABELS[item.product]}`,
              )
              .join(" · ")}
          </p>
        </div>
        {actions}
      </section>
    );
  return (
    <details className="shopping-note">
      <summary>
        Your method <ChevronDown size={17} aria-hidden />
      </summary>
      <div className="shopping-note-content">
        <div className="shade-reference">
          <span
            style={{ background: shade }}
            role="img"
            aria-label={`Shade reference ${shade}`}
          />
          <div>
            <strong>{look.title}</strong>
            <code>{shade}</code>
            <p>{texture}</p>
          </div>
        </div>
        <ul>
          {supplies.map((item) => (
            <li key={`${item.tool}:${item.product}`}>
              {TOOL_LABELS[item.tool]} + {PRODUCT_LABELS[item.product]}
            </li>
          ))}
        </ul>
        {actions}
        <ActionList actions={plan.actions} completed={completed} />
      </div>
    </details>
  );
}
