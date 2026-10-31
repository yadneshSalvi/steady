-- Preserve unsuccessful attempts while allowing an explicit retry that never
-- reached a paid submission. One current attempt owns each exact recipe.
ALTER TABLE provider_jobs ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE provider_jobs DROP CONSTRAINT IF EXISTS provider_jobs_session_id_candidate_id_request_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS provider_jobs_current_request_idx
  ON provider_jobs(session_id, candidate_id, request_hash)
  WHERE superseded_at IS NULL;

-- Share the balance snapshot across serverless instances. NULL is a short-lived
-- failed read; it never authorizes a paid job. The key is a credential digest.
CREATE TABLE IF NOT EXISTS provider_credit_balances (
  account_key text PRIMARY KEY,
  balance double precision CHECK (balance >= 0),
  checked_at timestamptz NOT NULL
);

ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS ip_hash text;
CREATE INDEX IF NOT EXISTS ai_requests_time_idx ON ai_requests(created_at);
CREATE INDEX IF NOT EXISTS ai_requests_ip_time_idx ON ai_requests(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS quota_owner_day_idx ON quota_reservations(owner_id, day, released);

-- Repair older terminal attempts that failed before submission. A provider task
-- or an uncertain POST keeps its reservation, regardless of the final state.
UPDATE quota_reservations q SET released=true
FROM provider_jobs j
WHERE q.id=j.id AND NOT q.released AND j.state IN ('failed','cancelled')
  AND j.provider_task_id IS NULL AND j.submission_started_at IS NULL;
