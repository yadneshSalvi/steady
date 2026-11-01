import type { Page } from "@playwright/test";

export const COPY_TARGETS = {
  landing: 21,
  "setup-color": 12,
  "setup-movements": 30,
  "setup-tools": 18,
  "setup-photo": 19,
  methods: 32,
  checkpoint: 37,
  review: 31,
  "saved-methods": 8,
  settings: 50,
  evidence: 23,
} as const;
export type CopyScreen = keyof typeof COPY_TARGETS;

/**
 * Counts actual rendered DOM text nodes, with no vocabulary or sentence filter.
 * Collapsed disclosures, closed dialogs and screen-reader-only text are recorded
 * separately. Numeric values are excluded only by explicit semantic containers
 * or an entirely numeric token. Header/footer are reported separately because
 * the inventory's screen targets describe the page body; setup's own stepper
 * remains included. Image pixels and alt/aria attributes are not DOM text nodes.
 */
export async function auditRenderedCopy(page: Page, screen: CopyScreen) {
  const captured = await page.evaluate(() => {
    const scope = document.querySelector("main");
    if (!scope)
      throw new Error("Copy audit requires the actual main landmark.");
    const dataSelectors = [
      "time",
      "code",
      "[data-copy-data]",
      ".step-number",
      ".setup-step-icon",
      ".measurement-percent",
      ".measurement-details dd",
    ];
    const numericToken = /^[+-]?\d+(?:[.,]\d+)*(?:%|px|ms|s)?$/;
    const pathFor = (element: Element): string => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== scope) {
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter(
              (sibling) => sibling.tagName === current!.tagName,
            )
          : [];
        const names =
          typeof current.className === "string"
            ? current.className
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((name) => `.${CSS.escape(name)}`)
                .join("")
            : "";
        parts.unshift(
          `${current.tagName.toLowerCase()}${names}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`,
        );
        current = current.parentElement;
      }
      return `main > ${parts.join(" > ")}`;
    };
    const visibilityReason = (element: Element): string | null => {
      if (element.closest(".sr-only,.visually-hidden"))
        return "screen-reader-only positioning";
      if (element.closest("dialog:not([open])")) return "closed dialog";
      for (
        let current: Element | null = element;
        current && current !== scope.parentElement;
        current = current.parentElement
      ) {
        const style = getComputedStyle(current);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.opacity === "0"
        )
          return "CSS-hidden";
        if (current.tagName === "DETAILS" && !current.hasAttribute("open")) {
          const summary = current.querySelector(":scope > summary");
          if (!summary?.contains(element)) return "collapsed disclosure";
        }
      }
      return null;
    };
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const entries: {
      text: string;
      path: string;
      kind: "authored" | "data" | "excluded";
      reason: string | null;
    }[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,template,noscript")) continue;
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (!text) continue;
      let reason = visibilityReason(parent);
      const range = document.createRange();
      range.selectNodeContents(node);
      if (
        !reason &&
        !Array.from(range.getClientRects()).some(
          (rect) => rect.width > 0 && rect.height > 0,
        )
      )
        reason = "no rendered text rectangle";
      const semanticData = parent.closest(dataSelectors.join(","));
      entries.push({
        text,
        path: pathFor(parent),
        kind: reason
          ? "excluded"
          : semanticData || numericToken.test(text)
            ? "data"
            : "authored",
        reason:
          reason ??
          (semanticData
            ? `semantic data container: ${semanticData.tagName.toLowerCase()}.${typeof semanticData.className === "string" ? semanticData.className : ""}`
            : numericToken.test(text)
              ? "entirely numeric token"
              : null),
      });
    }
    const accessibility = Array.from(
      scope.querySelectorAll("[aria-label],img[alt]"),
    ).map((element) => ({
      path: pathFor(element),
      ariaLabel: element.getAttribute("aria-label"),
      alt: element.getAttribute("alt"),
      excludedFromAuthoredCount: true,
    }));
    const chrome = Array.from(
      document.querySelectorAll(".site-header,.site-footer"),
    ).map((element) => ({
      surface: element.classList.contains("site-header") ? "header" : "footer",
      text: (element as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      entries,
      accessibility,
      chrome,
    };
  });
  const authoredCount = captured.entries.filter(
    (entry) => entry.kind === "authored",
  ).length;
  const target = COPY_TARGETS[screen];
  return {
    screen,
    observedAt: new Date().toISOString(),
    scope:
      "Visible non-empty DOM text nodes inside main; default-collapsed controls. Global header/footer reported separately. Text remains counted below the fold; CSS-clipped overflow is not used to reduce counts.",
    source:
      "review_round3/steady-copy.md after-count inventory; main R3 takes precedence",
    target,
    limit: target * 1.1,
    authoredCount,
    withinLimit: authoredCount <= target * 1.1,
    visibleDataCount: captured.entries.filter((entry) => entry.kind === "data")
      .length,
    excludedCount: captured.entries.filter((entry) => entry.kind === "excluded")
      .length,
    ...captured,
  };
}
