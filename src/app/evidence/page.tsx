import Link from "next/link";
import { BackLink, ProvenanceLabel } from "@/components/ui";

export const metadata = { title: "Evidence & limits · STEADY" };

export default function EvidencePage() {
  return (
    <div className="wrap page-wrap evidence-page">
      <BackLink href="/">Your studio</BackLink>
      <div className="page-intro">
        <p className="eyebrow">A clear view of the guidance</p>
        <h1>
          Evidence,
          <br />
          <em>with its edges.</em>
        </h1>
        <p>
          STEADY helps you compare a color target, try a method, and decide your
          next step. You keep the final say.
        </p>
      </div>
      <section>
        <h2>Read the image labels</h2>
        <div className="evidence-labels">
          <ProvenanceLabel kind="synthetic_inspiration" />
          <ProvenanceLabel kind="virtual_preview" recordedAt="recorded" />
          <ProvenanceLabel kind="virtual_preview" />
          <ProvenanceLabel kind="actual_capture" />
          <ProvenanceLabel kind="simulated_checkpoint" />
        </div>
        <p>
          Each chip opens the same explanation wherever that image appears. A
          recorded result is reused only when its source and exact recipe match.
          A generated preview never becomes a physical result.
        </p>
      </section>
      <section>
        <h2>What the checkpoint measures</h2>
        <p>
          The browser compares the region’s image color with a baseline captured
          at the start of that step. It corrects global color and exposure using
          untouched skin patches, checks a separate patch for lighting
          disagreement, then compares the change with the chosen YouCam target.
          Progress is an image-color comparison, not the amount of product on
          your skin, a beauty score, or proof that a step is complete.
        </p>
        <p>
          Pose changes, unreliable face detection, too few visible pixels,
          occlusion indicators, inconsistent reference light, and a target too
          subtle to measure produce a specific request for a clearer view. A
          region-only lighting change can still resemble pigment. Camera
          processing, skin appearance, texture, and products can affect the
          result; the thresholds are engineering heuristics rather than a
          calibrated cosmetic assessment.
        </p>
        <p>
          Your original baseline stays in memory when tracking is interrupted.
          The studio does not silently take a new baseline over product already
          applied. On reload, the local frames are gone and the studio asks you
          to choose how to continue.
        </p>
      </section>
      <section>
        <h2>Why the sample is useful</h2>
        <p>
          The fictional portrait, the Light render, and the selected target go
          through the same pixel calculation. The guide comes from the actual
          local MediaPipe model. This gives a camera-free demonstration of
          measurement, target choice, and adaptation. It does not stand in for a
          person applying makeup.
        </p>
      </section>
      <section>
        <h2>Methods and decisions</h2>
        <p>
          The planner checks your confirmed movements, products, and tools
          against a finite technique library. During adaptation it preserves
          completed actions and ranks alternatives that keep the product family
          first. Method content is AI-assisted draft guidance; no makeup-artist
          review or participant study is claimed. Follow the intended use of
          your own products and tools, and skip or stop any movement you do not
          want to perform.
        </p>
        <p>
          Choosing Light, Build, or Full sets a visual stopping point. It is not
          a calibrated dose, a promised physical finish, or a claim of
          accessibility benefit. A final result is recorded only from your own
          selected photo and assessment.
        </p>
      </section>
      <section>
        <h2>What leaves the device</h2>
        <p>
          Live frames, baseline frames, checkpoint pixels, and face coordinates
          stay in browser memory. Session history stores only the checkpoint’s
          scalar measurements, target identity, and your decisions. Starting
          photos and fresh YouCam previews are private server assets. A selected
          checkpoint goes to an AI provider only when you request a second
          opinion with consent.
        </p>
        <p>
          The optional vision assistant receives the measured numbers as
          context. It may abstain, and cannot advance your step. Optional voice
          controls send short recordings for transcription only while enabled.
          You can review and delete your studio in{" "}
          <Link href="/settings/access#your-data">
            Your photos &amp; privacy
          </Link>
          .
        </p>
      </section>
      <section>
        <h2>How we evaluate it</h2>
        <p>
          Evaluation separates deterministic software tests, synthetic image
          experiments, actual provider renders, and browser workflow checks.
          These demonstrate implementation behavior. No real-person outcome,
          clinical finding, speed improvement, or independent-application rate
          is claimed.
        </p>
        <p>
          Reproduction details and actual denominators are in the public{" "}
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation-measurement.md">
            measurement evaluation
          </a>
          ,{" "}
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation.md">
            engineering evaluation
          </a>
          , and{" "}
          <a href="https://github.com/yadneshSalvi/steady/blob/main/docs/evaluation-ai.md">
            AI evaluation
          </a>
          .
        </p>
      </section>
    </div>
  );
}
