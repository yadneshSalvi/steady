import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { PlanAction, Provenance } from "@/lib/contracts";
import { PRODUCT_LABELS, TOOL_LABELS } from "@/lib/catalog";

export function Button({
  children,
  variant = "primary",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button button--${variant} ${className}`}
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle className="spin" size={19} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  return (
    <Link className={`button button--${variant} ${className}`} href={href}>
      {children}
    </Link>
  );
}

export function BackLink({
  href,
  children = "Back",
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className="back-link">
      <ArrowLeft size={17} aria-hidden />
      {children}
    </Link>
  );
}

export function Notice({
  children,
  title,
  kind = "info",
  action,
}: {
  children: ReactNode;
  title?: string;
  kind?: "info" | "error" | "success";
  action?: ReactNode;
}) {
  const Icon =
    kind === "error" ? TriangleAlert : kind === "success" ? Check : CircleHelp;
  return (
    <div
      className={`notice notice--${kind}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <Icon size={20} aria-hidden />
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
        {action ? <div className="notice-action">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingState({
  children = "Opening your studio…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-mark" aria-hidden>
        <LoaderCircle size={28} className="spin" />
      </span>
      <h1 className="serif">A little space for you.</h1>
      <p>{children}</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="empty-state">
      <TriangleAlert size={30} aria-hidden />
      <h1 className="serif">Let’s take a moment.</h1>
      <p>{message}</p>
      <div className="button-row">
        {retry ? (
          <Button onClick={retry}>
            Try again <ArrowRight size={19} aria-hidden />
          </Button>
        ) : null}
        <ButtonLink href="/" variant="secondary">
          Back to the studio
        </ButtonLink>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-orbit" aria-hidden>
        ✳
      </span>
      <h2 className="serif">{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ProvenanceLabel({
  kind,
  className = "",
  recordedAt,
}: {
  kind: Provenance;
  className?: string;
  recordedAt?: string;
}) {
  const text =
    kind === "synthetic_inspiration"
      ? "AI-created inspiration"
      : kind === "virtual_preview"
        ? recordedAt
          ? "Recorded YouCam preview"
          : "YouCam virtual preview"
        : "Your actual photo";
  return (
    <span className={`provenance ${className}`}>
      <span aria-hidden />
      {text}
    </span>
  );
}

export function StepProgress({
  active,
  compact = false,
}: {
  active: number;
  compact?: boolean;
}) {
  return (
    <nav
      className={`step-progress ${compact ? "step-progress--compact" : ""}`}
      aria-label="Studio progress"
    >
      <ol>
        {["Your look", "Your method", "Apply", "Your result"].map(
          (name, index) => (
            <li
              key={name}
              className={
                index === active
                  ? "is-active"
                  : index < active
                    ? "is-complete"
                    : ""
              }
              aria-current={index === active ? "step" : undefined}
            >
              <span className="step-number">
                {index < active ? (
                  <Check size={12} aria-hidden />
                ) : (
                  `0${index + 1}`
                )}
              </span>
              <span>{name}</span>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function ActionList({
  actions,
  completed = [],
}: {
  actions: PlanAction[];
  completed?: string[];
}) {
  return (
    <ol className="action-list">
      {actions.map((action, index) => (
        <li key={action.id}>
          <span
            className={`action-list-index ${completed.includes(action.id) ? "is-complete" : ""}`}
          >
            {completed.includes(action.id) ? (
              <Check size={15} aria-hidden />
            ) : (
              String(index + 1).padStart(2, "0")
            )}
          </span>
          <div>
            <strong>{action.title}</strong>
            <p>{action.instruction}</p>
            <span className="small muted">
              {TOOL_LABELS[action.tool]} · {PRODUCT_LABELS[action.product]}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DraftNote({ short = false }: { short?: boolean }) {
  if (short)
    return (
      <p className="draft-note">
        <Sparkles size={14} aria-hidden />
        AI-assisted guidance · your judgment comes first.
      </p>
    );
  return (
    <details className="guidance-disclosure">
      <summary>
        <Sparkles size={16} aria-hidden />
        About this guidance <ChevronDown size={16} aria-hidden />
      </summary>
      <p>
        STEADY combines structured cosmetic methods with AI assistance. Previews
        illustrate appearance; they don’t establish physical fit or completion.
        Follow your product’s directions, choose what feels comfortable, and
        pause or change any step.
      </p>
    </details>
  );
}

export function SampleDisclosure() {
  return (
    <details className="sample-disclosure">
      <summary>
        <Sparkles size={16} aria-hidden />
        <span>Sample · AI-created portrait</span>
        <ChevronDown size={16} aria-hidden />
      </summary>
      <p>
        This walkthrough uses a fictional adult portrait and an example profile.
        Requested YouCam previews are real renders of that synthetic image.
        Exploring the sample doesn’t represent a real participant or physical
        result.
      </p>
    </details>
  );
}
