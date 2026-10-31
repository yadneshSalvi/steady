import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="empty-state wrap">
      <p className="eyebrow">A little off the path</p>
      <h1 className="serif">Let’s find your way back.</h1>
      <p>
        This page may have moved, or this studio session is no longer available.
      </p>
      <ButtonLink href="/">
        Back to your studio <ArrowRight size={18} aria-hidden />
      </ButtonLink>
    </div>
  );
}
