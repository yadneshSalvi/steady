"use client";
import { upload } from "@vercel/blob/client";
import type { StudioAsset } from "@/lib/contracts";
import { ensureAuthenticated } from "./auth-client";
async function uploadJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        "Your photo could not be saved. Please try again.",
    );
  return result as T;
}
export async function uploadPhoto(
  file: File | Blob,
  sessionId: string,
  purpose: "baseline" | "checkpoint" | "final",
): Promise<StudioAsset> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Please choose a photo smaller than 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  await ensureAuthenticated();
  const { pathname } = await uploadJson<{ pathname: string }>(
    "/api/assets/intent",
    { sessionId, purpose },
  );
  const result = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/assets/upload",
    contentType: file.type,
    clientPayload: JSON.stringify({ sessionId, purpose }),
  });
  return uploadJson<StudioAsset>("/api/assets/finalize", {
    pathname: result.pathname,
    sessionId,
    purpose,
  });
}

export async function imageToDataUrl(file: File | Blob): Promise<string> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare this photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
