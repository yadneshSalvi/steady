import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anonymous = vi.hoisted(() => vi.fn());
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ signIn: { anonymous } }),
}));
vi.mock("better-auth/client/plugins", () => ({ anonymousClient: () => ({}) }));
const currentSession = () =>
  Response.json({
    user: { id: "existing-owner" },
    session: { id: "existing-session" },
  });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  anonymous.mockReset();
  anonymous.mockResolvedValue({
    data: { token: "new-test-token", user: { id: "new-owner" } },
    error: null,
  });
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("private-browser identity preservation", () => {
  it("shares a successful session read across concurrent callers without signing in", async () => {
    fetcher.mockResolvedValue(currentSession());
    const { ensureAuthenticated } = await import("@/lib/auth-client");
    await Promise.all([ensureAuthenticated(), ensureAuthenticated()]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]).toMatchObject([
      "/api/auth/get-session",
      { method: "GET", credentials: "same-origin", cache: "no-store" },
    ]);
    expect(anonymous).not.toHaveBeenCalled();
  });

  it.each(["x-retry-after", "retry-after"])(
    "honors %s once using GET only and retains the existing identity",
    async (header) => {
      fetcher
        .mockResolvedValueOnce(
          new Response("Rest", { status: 429, headers: { [header]: "2" } }),
        )
        .mockResolvedValueOnce(currentSession());
      const { ensureAuthenticated } = await import("@/lib/auth-client");
      const pending = Promise.all([
        ensureAuthenticated(),
        ensureAuthenticated(),
      ]);
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      await pending;
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(anonymous).not.toHaveBeenCalled();
    },
  );

  it.each([401, 500, 503])(
    "does not replace an owner after session HTTP %s and permits an explicit later read",
    async (status) => {
      fetcher
        .mockResolvedValueOnce(new Response("Unavailable", { status }))
        .mockResolvedValueOnce(currentSession());
      const { ensureAuthenticated } = await import("@/lib/auth-client");
      await expect(ensureAuthenticated()).rejects.toThrow(
        "existing private session could not be checked",
      );
      expect(anonymous).not.toHaveBeenCalled();
      await ensureAuthenticated();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(anonymous).not.toHaveBeenCalled();
    },
  );

  it.each(["not-json", "{}", '{"user":null}', '{"user":{"id":""}}'])(
    "rejects a malformed successful session response %s without signing in",
    async (body) => {
      fetcher.mockResolvedValueOnce(new Response(body, { status: 200 }));
      const { ensureAuthenticated } = await import("@/lib/auth-client");
      await expect(ensureAuthenticated()).rejects.toThrow(
        "existing private session could not be checked",
      );
      expect(anonymous).not.toHaveBeenCalled();
    },
  );

  it("preserves identity after a lost session read", async () => {
    fetcher.mockRejectedValueOnce(new Error("Lost transport"));
    const { ensureAuthenticated } = await import("@/lib/auth-client");
    await expect(ensureAuthenticated()).rejects.toThrow(
      "existing private session could not be checked",
    );
    expect(anonymous).not.toHaveBeenCalled();
  });

  it.each(["120", "invalid", "-1"])(
    "does not retry early for an unsupported retry horizon %s",
    async (value) => {
      fetcher.mockResolvedValueOnce(
        new Response("Rest", {
          status: 429,
          headers: { "x-retry-after": value },
        }),
      );
      const { ensureAuthenticated } = await import("@/lib/auth-client");
      await expect(ensureAuthenticated()).rejects.toThrow("resting briefly");
      expect(fetcher).toHaveBeenCalledOnce();
      expect(anonymous).not.toHaveBeenCalled();
    },
  );

  it("stops after one explicit rate-limit retry without anonymous fallback", async () => {
    fetcher.mockImplementation(
      async () =>
        new Response("Rest", {
          status: 429,
          headers: { "x-retry-after": "0" },
        }),
    );
    const { ensureAuthenticated } = await import("@/lib/auth-client");
    const rejected = expect(ensureAuthenticated()).rejects.toThrow(
      "resting briefly",
    );
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(anonymous).not.toHaveBeenCalled();
  });

  it("creates one anonymous identity only after a successful literal null session", async () => {
    fetcher.mockResolvedValueOnce(Response.json(null));
    const { ensureAuthenticated } = await import("@/lib/auth-client");
    await Promise.all([ensureAuthenticated(), ensureAuthenticated()]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(anonymous).toHaveBeenCalledOnce();
  });

  it("never retries an uncertain sign-in POST and checks the recovered cookie on explicit retry", async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(currentSession());
    anonymous.mockRejectedValueOnce(new Error("Lost sign-in response"));
    const { ensureAuthenticated } = await import("@/lib/auth-client");
    await expect(ensureAuthenticated()).rejects.toThrow(
      "Lost sign-in response",
    );
    expect(anonymous).toHaveBeenCalledOnce();
    await ensureAuthenticated();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(anonymous).toHaveBeenCalledOnce();
  });
});
