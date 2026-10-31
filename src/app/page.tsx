import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Hand,
  Heart,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { ButtonLink, ProvenanceLabel } from "@/components/ui";
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
    <>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-sun" aria-hidden>
              ✳
            </span>{" "}
            A more personal makeup studio
          </div>
          <h1 id="hero-title">
            Beauty, at
            <br /> your <em>own pace.</em>
          </h1>
          <p className="hero-description">
            The look you love. A way that feels like you.
            <br className="desktop-break" /> Find makeup methods for your
            movements,
            <br className="desktop-break" /> your tools, and your everyday.
          </p>
          <div className="hero-actions">
            <ButtonLink href="/studio/new">
              Find your way <ArrowUpRight size={21} aria-hidden />
            </ButtonLink>
            <QuickSample />
          </div>
          <div className="hero-assurance">
            <span>
              <Check size={15} aria-hidden /> Your pace, always
            </span>
            <span>
              <Check size={15} aria-hidden /> No account to create
            </span>
          </div>
          <div className="hero-bottom-note">
            <span className="little-line" />
            <span>
              There’s more than one way
              <br /> to make a look your own.
            </span>
            <ArrowDown size={20} strokeWidth={1.3} aria-hidden />
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
            <div className="portrait-caption">
              <ProvenanceLabel kind="synthetic_inspiration" />
              <span>A soft start. A look that’s yours.</span>
            </div>
            <span className="portrait-edition">THE EVERYDAY STUDIO / 01</span>
          </div>
          <div className="method-note">
            <div className="method-note-icon">
              <Hand size={23} strokeWidth={1.3} aria-hidden />
            </div>
            <div>
              <span className="eyebrow small-eyebrow">
                Made for your movements
              </span>
              <strong>
                A softer touch.
                <br /> A different way.
              </strong>
            </div>
            <span className="note-line" aria-hidden />
            <CheekSketch />
            <span className="note-signature">Beautifully, your way.</span>
          </div>
          <span className="hero-star" aria-hidden>
            ✳
          </span>
        </div>
      </section>

      <div className="philosophy-strip">
        <span>Your expression.</span>
        <span className="strip-dot" aria-hidden>
          ✳
        </span>
        <span>Your movements.</span>
        <span className="strip-dot" aria-hidden>
          ✳
        </span>
        <span>Your kind of beautiful.</span>
      </div>

      <section
        className="how-section wrap"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">A little guidance, a lot of you</p>
            <h2 id="how-title">
              One look.
              <br /> <em>More than one way.</em>
            </h2>
          </div>
          <p>
            A favorite look shouldn’t come with only one set of instructions. We
            start with what feels comfortable to you, then work from there.
          </p>
        </div>
        <div className="process-grid">
          <article>
            <span className="process-number">01 /</span>
            <div className="process-illustration process-illustration--look">
              <span />
              <span />
              <span />
              <Sparkles size={32} strokeWidth={1.1} aria-hidden />
            </div>
            <h3>Choose your feeling.</h3>
            <p>
              A soft flush, a little warmth, a touch of color. Choose what you
              want to express.
            </p>
          </article>
          <article>
            <span className="process-number">02 /</span>
            <div className="process-illustration process-illustration--hands">
              <Hand size={64} strokeWidth={0.9} aria-hidden />
              <span className="motion-arc" />
            </div>
            <h3>Find your movement.</h3>
            <p>
              Tell us which movements feel good and which tools you have. You
              set the boundaries.
            </p>
          </article>
          <article>
            <span className="process-number">03 /</span>
            <div className="process-illustration process-illustration--mirror">
              <CheekSketch />
              <span className="illustration-spark" aria-hidden>
                ✳
              </span>
            </div>
            <h3>Make it your own.</h3>
            <p>
              One step at a time, with room to pause, try another method, or
              love where you’ve landed.
            </p>
          </article>
        </div>
      </section>

      <section className="look-section wrap" aria-labelledby="looks-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A starting point, not a rule</p>
            <h2 id="looks-title">
              What feels like <em>you?</em>
            </h2>
          </div>
          <Link href="/studio/new" className="text-link">
            Explore your looks <ArrowUpRight size={19} aria-hidden />
          </Link>
        </div>
        <div className="inspiration-grid">
          {[
            {
              id: "rose",
              title: "The soft rose",
              description: "A fresh flush. An easy kind of color.",
              color: "#bd797e",
              name: "Rose",
            },
            {
              id: "terracotta",
              title: "A little warmth",
              description: "Earthy cheeks. A golden-hour feeling.",
              color: "#ac6549",
              name: "Terracotta",
            },
            {
              id: "berry",
              title: "The berry mood",
              description: "A richer hue. Your own quiet statement.",
              color: "#864d68",
              name: "Berry",
            },
          ].map((look, index) => (
            <Link
              href={`/studio/new?look=${look.id}`}
              className={`inspiration-card inspiration-card--${look.id}`}
              key={look.id}
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
                <span className="look-art-number">0{index + 1}</span>
                <span className="look-art-name">{look.name}</span>
                <span className="look-art-tag">COLOR INSPIRATION</span>
                <span className="look-art-arrow">
                  <MoveUpRight size={22} aria-hidden />
                </span>
              </div>
              <h3>{look.title}</h3>
              <p>{look.description}</p>
            </Link>
          ))}
        </div>
        <div className="eye-sample-callout">
          <div>
            <p className="eyebrow">Defined eyes</p>
            <h3>
              Keep the emphasis.
              <br />
              <em>Change the movement.</em>
            </h3>
            <p>
              Explore a fine upper line, then adapt it to softly tapped shadow.
            </p>
          </div>
          <QuickSample eyes />
        </div>
      </section>

      <section className="manifesto">
        <div className="wrap manifesto-inner">
          <div className="manifesto-symbol" aria-hidden>
            ✳
          </div>
          <p className="eyebrow">Room to do things differently</p>
          <h2>
            No perfect technique.
            <br /> Just <em>your next step.</em>
          </h2>
          <p>
            Tap instead of sweep. Switch a tool. Take a break.
            <br className="desktop-break" /> Your method can change as you go.
          </p>
          <ButtonLink href="/studio/new">
            Let’s find your way <ArrowUpRight size={20} aria-hidden />
          </ButtonLink>
          <div className="manifesto-footnotes">
            <span>
              <ShieldCheck size={18} aria-hidden /> Live camera stays on your
              device
            </span>
            <span>
              <Heart size={18} aria-hidden /> Your judgment comes first
            </span>
            <span>
              <WandSparkles size={18} aria-hidden /> Preview and reality,
              clearly labeled
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
