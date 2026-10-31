import type { Metadata } from "next";
import { GuidedMirror } from "@/components/guided-mirror";
export const metadata: Metadata = { title: "Your guided mirror" };
export default async function MirrorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GuidedMirror id={id} />;
}
