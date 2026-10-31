"use client";

import { ErrorState } from "@/components/ui";

export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="wrap">
      <ErrorState
        message="Something interrupted the studio. Try loading this page again, or return to the studio to open a saved session."
        retry={retry}
      />
    </div>
  );
}
