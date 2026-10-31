ALTER TABLE provider_jobs ADD COLUMN IF NOT EXISTS provider_file_id text;
ALTER TABLE provider_jobs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
