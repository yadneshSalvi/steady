import type { Metadata } from "next";
import { ResultReview } from "@/components/result-review";
export const metadata: Metadata = { title: "Your result" };
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultReview id={id} />;
}
