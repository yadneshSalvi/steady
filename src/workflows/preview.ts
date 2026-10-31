import { sleep, getWorkflowMetadata } from "workflow";
import {
  bindPreviewRunStep,
  interruptedPreviewStep,
  uploadSourceStep,
  submitPreviewStep,
  pollPreviewStep,
  timeoutPreviewStep,
} from "./preview-steps";
export async function previewWorkflow(jobId: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  try {
    if (!(await bindPreviewRunStep(jobId, workflowRunId))) return;
    if (!(await uploadSourceStep(jobId))) return;
    if (!(await submitPreviewStep(jobId))) return;
    for (let attempt = 0; attempt < 28; attempt++) {
      await sleep(attempt < 3 ? "10s" : attempt < 10 ? "15s" : "30s");
      if ((await pollPreviewStep(jobId)) !== "waiting") return;
    }
    await timeoutPreviewStep(jobId, workflowRunId);
  } catch {
    await interruptedPreviewStep(jobId, workflowRunId);
  }
}
