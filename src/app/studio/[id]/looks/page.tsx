import type { Metadata } from "next";
import { LooksStudio } from "@/components/looks-studio";
export const metadata: Metadata = { title: "Your methods" };
export default async function LooksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LooksStudio id={id} />;
}
