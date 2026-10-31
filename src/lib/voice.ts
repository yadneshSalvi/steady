export type VoiceCommand =
  "pause" | "repeat" | "check" | "help" | "next" | "stop";
export function parseVoiceCommand(text: string): VoiceCommand | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = /^steady (pause|repeat|check|help|next|stop)$/.exec(normalized);
  return match ? (match[1] as VoiceCommand) : null;
}
