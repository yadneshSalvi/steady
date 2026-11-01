import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="empty-state wrap">
      <h1 className="serif">Page unavailable</h1>
      <p>This page or session is no longer here.</p>
      <ButtonLink href="/">
        Back to your studio <ArrowRight size={18} aria-hidden />
      </ButtonLink>
    </div>
  );
}
