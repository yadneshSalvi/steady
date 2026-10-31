-- Authentication schema follows Better Auth 1.7 anonymous sessions.
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "isAnonymous" boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_session_user_idx ON "session"("userId");

CREATE TABLE IF NOT EXISTS studio_sessions (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0), data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days', deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS studio_sessions_owner_idx ON studio_sessions(owner_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS studio_events (
  id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
  revision integer NOT NULL, event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_events_session_idx ON studio_events(session_id, revision);
CREATE TABLE IF NOT EXISTS studio_assets (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
  pathname text NOT NULL UNIQUE, purpose text NOT NULL CHECK (purpose IN ('baseline','checkpoint','final','preview')),
  provenance text NOT NULL CHECK (provenance IN ('actual_capture','virtual_preview','synthetic_inspiration')),
  content_type text NOT NULL, bytes integer NOT NULL CHECK (bytes > 0), checksum text NOT NULL,
  width integer NOT NULL, height integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days', deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS studio_assets_session_idx ON studio_assets(session_id);
CREATE TABLE IF NOT EXISTS upload_intents (
  pathname text PRIMARY KEY, owner_id text NOT NULL, session_id uuid NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
  purpose text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  finalized_asset_id uuid REFERENCES studio_assets(id)
);
CREATE TABLE IF NOT EXISTS provider_jobs (
  id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
  owner_id text NOT NULL, candidate_id text NOT NULL, source_asset_id text NOT NULL,
  request_hash text NOT NULL, input jsonb NOT NULL, state text NOT NULL,
  provider_task_id text, workflow_run_id text, output_asset_id uuid REFERENCES studio_assets(id),
  error_code text, error_message text, submission_started_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, estimated_units integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, candidate_id, request_hash)
);
CREATE INDEX IF NOT EXISTS provider_jobs_state_idx ON provider_jobs(state, updated_at);
CREATE TABLE IF NOT EXISTS quota_reservations (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL, ip_hash text NOT NULL, day date NOT NULL DEFAULT CURRENT_DATE,
  units integer NOT NULL DEFAULT 1, released boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quota_day_idx ON quota_reservations(day, released);
CREATE INDEX IF NOT EXISTS quota_owner_idx ON quota_reservations(owner_id, released);
CREATE TABLE IF NOT EXISTS provider_rate_windows (
  window_start timestamptz PRIMARY KEY, requests integer NOT NULL DEFAULT 0
);
