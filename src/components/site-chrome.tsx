"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand--light" : ""}`}
      aria-label="Steady home"
    >
      <span className="brand-symbol" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>
        steady<span className="brand-period">.</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const inStudio = pathname.startsWith("/studio/");
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          <Link
            href="/methods"
            aria-current={pathname === "/methods" ? "page" : undefined}
          >
            Your methods
          </Link>
          <Link
            href="/settings/access"
            className="access-link"
            aria-label="Access and comfort settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          >
            <SlidersHorizontal size={17} aria-hidden />
            <span>Your settings</span>
          </Link>
          {inStudio ? null : (
            <Link className="header-cta" href="/studio/new">
              Enter your studio <ArrowUpRight size={17} aria-hidden />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>A little guidance. Entirely your expression.</p>
      </div>
      <div className="footer-links">
        <Link href="/evidence">Evidence &amp; limits</Link>
        <Link href="/settings/access#your-data">Your photos & privacy</Link>
        <Link href="/settings/access">Access & comfort</Link>
        <span>Made to move with you.</span>
      </div>
    </footer>
  );
}
