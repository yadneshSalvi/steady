import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { PlanAction } from "@/lib/contracts";

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

export function SampleBadge() {
  return <span className="sample-badge">Sample</span>;
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
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A makeup sponge: teardrop with pores, so it never reads as a radio button. */
export function SpongeIcon({
  size = 24,
  strokeWidth = 1.5,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2.8c-2.9 0-5.6 5.2-5.6 9.5a5.6 5.6 0 0 0 11.2 0c0-4.3-2.7-9.5-5.6-9.5Z" />
      <path d="M8.2 15.6c2.4 1.4 5.2 1.4 7.6 0" />
      <path d="M10.4 8.6h.01M13.4 10.4h.01M10.8 12.4h.01" />
      <path d="M7 21.2h10" />
    </svg>
  );
}
