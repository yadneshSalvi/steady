"use client";

import type {
  PublicConfig,
  SavedMethod,
  SessionCommand,
  SetupInput,
  StudioSession,
} from "./contracts";
import { ensureAuthenticated } from "./auth-client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (path !== "/api/config") await ensureAuthenticated();
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      typeof error === "string"
        ? error
        : error?.message ||
            body?.message ||
            "The studio couldn’t save that change. Please try again.",
      response.status,
      error?.code || body?.code,
    );
  }
  return body as T;
}

export const getConfig = () => api<PublicConfig>("/api/config");
export const createSession = (input: SetupInput) =>
  api<StudioSession>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const getSession = (id: string) =>
  api<StudioSession>(`/api/sessions/${encodeURIComponent(id)}`);
export const listSessions = () =>
  api<{ sessions: StudioSession[] }>("/api/sessions");
export const listMethods = () =>
  api<{ methods: SavedMethod[] }>("/api/methods");
export const deleteSession = (id: string) =>
  api<{ deleted: true }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const commandSession = (
  session: StudioSession,
  command: SessionCommand,
) =>
  api<StudioSession>(`/api/sessions/${encodeURIComponent(session.id)}/events`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: session.revision, command }),
  });
export const requestPreviews = (session: StudioSession) =>
  api<StudioSession>(
    `/api/sessions/${encodeURIComponent(session.id)}/previews`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision: session.revision }),
    },
  );
