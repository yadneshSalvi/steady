import type { Metadata } from "next";
import { SavedMethods } from "@/components/saved-methods";
export const metadata: Metadata = { title: "Your saved methods" };
export default function MethodsPage() {
  return <SavedMethods />;
}
