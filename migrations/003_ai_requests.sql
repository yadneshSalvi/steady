CREATE TABLE IF NOT EXISTS ai_requests (
  id uuid PRIMARY KEY, owner_id text NOT NULL, purpose text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_requests_owner_time_idx ON ai_requests(owner_id,created_at);
