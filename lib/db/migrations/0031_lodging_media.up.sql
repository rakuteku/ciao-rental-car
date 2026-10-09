BEGIN;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS external_url text NOT NULL DEFAULT '';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS external_nofollow boolean NOT NULL DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS external_new_tab boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS lodging_images (
  id text PRIMARY KEY,
  mime_type text NOT NULL,
  data text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
COMMIT;
