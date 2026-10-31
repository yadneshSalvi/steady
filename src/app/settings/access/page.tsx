import type { Metadata } from "next";
import { AccessSettings } from "@/components/access-settings";
export const metadata: Metadata = { title: "Your access and comfort settings" };
export default function SettingsPage() {
  return <AccessSettings />;
}
