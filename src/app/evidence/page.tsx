import { BackLink } from "@/components/ui";

export const metadata = { title: "Evidence & limits · STEADY" };

export default function EvidencePage() {
  return (
    <div className="wrap page-wrap evidence-page r3-evidence">
      <BackLink href="/">Your studio</BackLink>
      <div className="page-intro">
        <h1>Evidence &amp; limits</h1>
      </div>
      <section>
        <h2>Images in STEADY</h2>
        <dl className="r3-evidence-images">
          <div>
            <dt>Sample portrait</dt>
            <dd>A fictional, AI-generated adult.</dd>
          </div>
          <div>
            <dt>Previews</dt>
            <dd>YouCam renders; the sample reuses recorded ones.</dd>
          </div>
          <div>
            <dt>Sample checkpoints</dt>
            <dd>Recorded YouCam images represent simulated makeup passes.</dd>
          </div>
          <div>
            <dt>Your photos</dt>
            <dd>Private; live video stays in your browser.</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>What a checkpoint measures</h2>
        <p>
          STEADY compares regional image color against your baseline and chosen
          target. Untouched skin patches correct global exposure and color
          changes. A separate patch checks for inconsistent lighting. Progress
          measures image color, never product quantity, beauty, or completed
          application.
        </p>
        <p>
          Unreliable tracking, pose, visibility, or reference lighting can
          prevent measurement. Region-only lighting changes can still resemble
          pigment. Camera processing, skin appearance, texture, and products
          also affect readings. These engineering thresholds aren’t calibrated
          cosmetic assessments. Reloading clears local frames; STEADY asks
          before capturing another baseline.
        </p>
      </section>
      <section>
        <h2>What the sample demonstrates</h2>
        <p>
          Recorded images use the same pixel calculation as local checkpoints.
          The guide comes from the actual local MediaPipe model. This
          demonstrates target choice, measurement, and method adaptation. It
          does not demonstrate a person applying makeup. Historical sessions
          retain their original targets and measurement versions.
        </p>
      </section>
      <section>
        <h2>Methods and decisions</h2>
        <p>
          The planner checks confirmed movements, products, and tools against
          finite methods. Adaptation preserves confirmed steps and prefers the
          existing product family. Instructions are AI-assisted drafts, without
          makeup-artist or participant validation. Follow product directions;
          skip or stop movements you don’t want. Light, Build, and Full are
          visual targets, not calibrated doses. Your chosen photo and assessment
          describe your physical result.
        </p>
      </section>
      <section>
        <h2>What leaves your device</h2>
        <p>
          Live frames, baselines, checkpoint pixels, and face coordinates stay
          locally. Session history saves measurements, target identity, and your
          choices. Chosen starting photos and requested previews use private
          server storage. Consented second-opinion stills reach Gemini or OpenAI
          with measured context. Their suggestions cannot advance a step.
          Enabled voice controls send short recordings to Deepgram. Deletion
          queues private photos for removal; provider retention remains
          separate.
        </p>
      </section>
      <section>
        <h2>How we evaluate</h2>
        <p>
          Software tests, synthetic experiments, provider renders, and browser
          checks stay separate. No physical-application outcome, participant
          benefit, or time saving is established. Reproducible methods and
          actual denominators are published below.
        </p>
        <nav className="r3-evidence-links" aria-label="Evaluation documents">
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation-measurement.md">
            Measurement
          </a>
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation.md">
            Engineering
          </a>
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation-ai.md">
            AI evaluation
          </a>
        </nav>
      </section>
    </div>
  );
}
