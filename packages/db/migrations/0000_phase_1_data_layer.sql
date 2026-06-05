CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan') THEN
    CREATE TYPE plan AS ENUM ('free', 'pro', 'advanced');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  avatar_url text,
  plan plan NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  current_version_id uuid,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  body text NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prompts
  ADD CONSTRAINT prompts_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES prompt_versions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION prevent_prompt_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'prompt_versions are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_versions_no_update ON prompt_versions;
CREATE TRIGGER prompt_versions_no_update
  BEFORE UPDATE ON prompt_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_prompt_version_mutation();

DROP TRIGGER IF EXISTS prompt_versions_no_delete ON prompt_versions;
CREATE TRIGGER prompt_versions_no_delete
  BEFORE DELETE ON prompt_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_prompt_version_mutation();

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS prompt_tags (
  prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prompt_id, tag_id)
);

CREATE TABLE IF NOT EXISTS context_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  compatible_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  difficulty text NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_prompt text NOT NULL,
  enhanced_prompt text,
  mode text NOT NULL,
  target_model text NOT NULL,
  prompt_type text NOT NULL,
  structure_score_before integer,
  structure_score_after integer,
  tokens integer,
  provider text,
  model text,
  latency_ms integer,
  saved boolean NOT NULL DEFAULT false,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS prompts_user_id_deleted_at_idx ON prompts(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS prompt_versions_prompt_id_created_at_idx ON prompt_versions(prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags(user_id);
CREATE INDEX IF NOT EXISTS context_snippets_user_id_deleted_at_idx ON context_snippets(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS operations_user_id_created_at_idx ON operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_id_created_at_idx ON usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompts_fts_idx
  ON prompts USING gin (to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS templates_fts_idx
  ON templates USING gin (
    to_tsvector(
      'english',
      title || ' ' || description || ' ' || body
    )
  );

CREATE INDEX IF NOT EXISTS context_snippets_fts_idx
  ON context_snippets USING gin (to_tsvector('english', title || ' ' || body));
