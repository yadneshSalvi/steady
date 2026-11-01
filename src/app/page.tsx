import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Hand, MoveUpRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { QuickSample } from "@/components/quick-sample";

function CheekSketch() {
  return (
    <svg viewBox="0 0 160 150" fill="none" className="cheek-sketch" aria-hidden>
      <path
        d="M63 17c-16 7-26 23-26 49 0 40 17 65 40 66 24 0 46-34 45-65-1-22-9-40-26-49"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M60 60c4-3 9-3 13 0m20 0c4-3 10-3 14 0M83 65l-3 24 8 2m-15 15c7 6 17 6 24-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <ellipse
        cx="57"
        cy="84"
        rx="15"
        ry="10"
        fill="#c47667"
        fillOpacity=".28"
        transform="rotate(-22 57 84)"
      />
      <ellipse
        cx="106"
        cy="84"
        rx="15"
        ry="10"
        fill="#c47667"
        fillOpacity=".28"
        transform="rotate(22 106 84)"
      />
      <path
        d="M20 92c-4-12-2-21 5-27m-5 0 6-3 2 7"
        stroke="#9d5140"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="r3-home">
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            Beauty, at
            <br /> your <em>own pace.</em>
          </h1>
          <p className="hero-description">
            Makeup methods for your movements and tools.
          </p>
          <div className="hero-actions">
            <ButtonLink href="/studio/new">
              Find your way <ArrowUpRight size={21} aria-hidden />
            </ButtonLink>
            <QuickSample />
          </div>
        </div>
        <div className="hero-visual">
          <div className="portrait-frame">
            <Image
              src="/images/studio-portrait.jpg"
              alt="Fictional AI-created adult sample portrait"
              fill
              priority
              sizes="(max-width: 740px) 100vw, 52vw"
              className="hero-portrait"
            />
          </div>
          <div className="method-note">
            <Hand size={24} strokeWidth={1.3} aria-hidden />
            <strong>A softer touch.</strong>
            <CheekSketch />
          </div>
          <span className="hero-star" aria-hidden>
            ✳
          </span>
        </div>
      </section>

      <section className="r3-product-section wrap" aria-labelledby="how-title">
        <div className="section-heading">
          <h2 id="how-title">
            One look.
            <br />
            <em>More than one way.</em>
          </h2>
        </div>
        <div className="r3-product-grid">
          {[
            {
              id: "ladder",
              width: 520,
              height: 182,
              title: "Choose your finish",
              alt: "STEADY sample methods with Light, Build and Full preview targets",
            },
            {
              id: "mirror",
              width: 1328,
              height: 637,
              title: "Follow your guide",
              alt: "STEADY sample mirror with a cheek placement oval",
            },
            {
              id: "checkpoint",
              width: 1328,
              height: 637,
              title: "See your progress",
              alt: "STEADY simulated sample measurement with target progress and a regional heatmap",
            },
          ].map((frame) => (
            <figure key={frame.id}>
              <div className="r3-product-frame">
                <Image
                  src={`/images/product-${frame.id}.webp`}
                  alt={frame.alt}
                  width={frame.width}
                  height={frame.height}
                  sizes="(max-width: 740px) 100vw, 32vw"
                />
              </div>
              <figcaption>
                <h3>{frame.title}</h3>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="look-section wrap" aria-labelledby="looks-title">
        <div className="section-heading">
          <h2 id="looks-title">
            Choose your <em>color.</em>
          </h2>
        </div>
        <div className="inspiration-grid">
          {[
            { id: "rose", name: "Rose", color: "#bd797e" },
            { id: "terracotta", name: "Terracotta", color: "#ac6549" },
            { id: "berry", name: "Berry", color: "#864d68" },
          ].map((look) => (
            <Link
              href={`/studio/new?look=${look.id}`}
              className={`inspiration-card inspiration-card--${look.id}`}
              key={look.id}
              aria-label={`Start with ${look.name}`}
            >
              <div className="look-art">
                <span
                  className="paint-smear"
                  style={{ backgroundColor: look.color }}
                />
                <span
                  className="paint-smear-second"
                  style={{ backgroundColor: look.color }}
                />
                <span className="look-art-arrow">
                  <MoveUpRight size={22} aria-hidden />
                </span>
              </div>
              <h3>{look.name}</h3>
            </Link>
          ))}
        </div>
        <div className="r3-eye-link">
          <QuickSample eyes />
        </div>
      </section>

      <section className="manifesto">
        <div className="wrap manifesto-inner">
          <span className="manifesto-symbol" aria-hidden>
            ✳
          </span>
          <h2>
            No perfect technique.
            <br />
            Just <em>your next step.</em>
          </h2>
          <ButtonLink href="/studio/new">
            Find your way <ArrowUpRight size={21} aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
