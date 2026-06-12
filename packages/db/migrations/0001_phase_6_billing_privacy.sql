ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at);

CREATE TABLE IF NOT EXISTS user_billing_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  byo_key_enabled boolean NOT NULL DEFAULT false,
  byo_key_provider text,
  byo_key_ciphertext text,
  byo_key_hint text,
  byo_key_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_prompt_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('promptgen.allow_prompt_version_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'prompt_versions are immutable';
END;
$$ LANGUAGE plpgsql;
