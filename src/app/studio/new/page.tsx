import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupWizard } from "@/components/setup-wizard";
import { LoadingState } from "@/components/ui";
export const metadata: Metadata = { title: "Your personal setup" };
export default function NewStudioPage() {
  return (
    <Suspense fallback={<LoadingState>Opening setup…</LoadingState>}>
      <SetupWizard />
    </Suspense>
  );
}
