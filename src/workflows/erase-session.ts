import { eraseSessionAssets } from "@/lib/server/assets";
export async function eraseSessionWorkflow(sessionId: string) {
  "use workflow";
  await erasePrivateData(sessionId);
}
async function erasePrivateData(sessionId: string) {
  "use step";
  console.info("[privacy] erase session assets");
  await eraseSessionAssets(sessionId);
}
