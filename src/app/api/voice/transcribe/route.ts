import { ApiError, assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { reserveAIRequest } from "@/lib/server/ai-input";
import { handle, json } from "@/lib/server/http";
import { parseVoiceCommand } from "@/lib/voice";
export const maxDuration = 30;
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    if (request.headers.get("x-steady-voice-consent") !== "deepgram-v1")
      throw new ApiError(
        400,
        "VOICE_CONSENT_REQUIRED",
        "Enable voice controls with microphone consent first.",
      );
    if (!process.env.DEEPGRAM_API_KEY)
      throw new ApiError(
        503,
        "VOICE_UNAVAILABLE",
        "Voice commands are unavailable. Every studio control still works by touch or keyboard.",
      );
    const type = (request.headers.get("content-type") || "").split(";")[0];
    if (!["audio/webm", "audio/mp4", "audio/wav", "audio/ogg"].includes(type))
      throw new ApiError(
        415,
        "AUDIO_TYPE",
        "This browser's audio format is not supported.",
      );
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > 1_000_000)
      throw new ApiError(
        413,
        "AUDIO_SIZE",
        "Please say one short studio command.",
      );
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 1_000_000 || bytes.byteLength < 128)
      throw new ApiError(
        413,
        "AUDIO_SIZE",
        "Please say one short studio command.",
      );
    await reserveAIRequest(ownerId, "voice_command");
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true&keyterm=Steady",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": type,
        },
        body: bytes,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok)
      throw new ApiError(
        503,
        "VOICE_UNAVAILABLE",
        "The command could not be heard just now. Please use the visible controls or try again.",
        true,
      );
    const result = await response.json();
    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    const command =
      typeof transcript === "string" ? parseVoiceCommand(transcript) : null;
    return json({ command, heard: command ? `Steady, ${command}` : null });
  });
}
