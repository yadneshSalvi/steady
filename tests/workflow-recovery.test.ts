import { beforeEach, describe, expect, it, vi } from "vitest";

const steps = vi.hoisted(() => ({
  bindPreviewRunStep: vi.fn(),
  uploadSourceStep: vi.fn(),
  submitPreviewStep: vi.fn(),
  pollPreviewStep: vi.fn(),
  timeoutPreviewStep: vi.fn(),
  interruptedPreviewStep: vi.fn(),
}));
vi.mock("workflow", () => ({
  sleep: vi.fn(),
  getWorkflowMetadata: () => ({ workflowRunId: "current-run" }),
}));
vi.mock("../src/workflows/preview-steps", () => steps);
import { previewWorkflow } from "../src/workflows/preview";

beforeEach(() => {
  vi.clearAllMocks();
  steps.bindPreviewRunStep.mockResolvedValue(true);
  steps.uploadSourceStep.mockResolvedValue(true);
  steps.submitPreviewStep.mockResolvedValue(true);
  steps.pollPreviewStep.mockResolvedValue("finished");
});

describe("workflow failure recovery", () => {
  it("cannot run a second workflow when another run owns the job", async () => {
    steps.bindPreviewRunStep.mockResolvedValue(false);
    await previewWorkflow("job");
    expect(steps.uploadSourceStep).not.toHaveBeenCalled();
    expect(steps.submitPreviewStep).not.toHaveBeenCalled();
  });
  it("records exhausted source preparation with its run identity before any paid submission", async () => {
    steps.uploadSourceStep.mockRejectedValue(
      new Error("source retries exhausted"),
    );
    await previewWorkflow("job");
    expect(steps.interruptedPreviewStep).toHaveBeenCalledExactlyOnceWith(
      "job",
      "current-run",
    );
    expect(steps.submitPreviewStep).not.toHaveBeenCalled();
  });
  it("records a poll failure without repeating the paid step", async () => {
    steps.pollPreviewStep.mockRejectedValue(
      new Error("output download retries exhausted"),
    );
    await previewWorkflow("job");
    expect(steps.interruptedPreviewStep).toHaveBeenCalledExactlyOnceWith(
      "job",
      "current-run",
    );
    expect(steps.submitPreviewStep).toHaveBeenCalledTimes(1);
  });
  it("ends bounded polling with the same run identity for safe subsequent recovery", async () => {
    steps.pollPreviewStep.mockResolvedValue("waiting");
    await previewWorkflow("job");
    expect(steps.pollPreviewStep).toHaveBeenCalledTimes(28);
    expect(steps.timeoutPreviewStep).toHaveBeenCalledExactlyOnceWith(
      "job",
      "current-run",
    );
    expect(steps.interruptedPreviewStep).not.toHaveBeenCalled();
  });
});
