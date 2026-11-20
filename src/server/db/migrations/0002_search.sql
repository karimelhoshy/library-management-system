-- array_to_string is only STABLE, so wrap it in an IMMUTABLE function
-- that can back an expression index for typo-tolerant author search.
CREATE OR REPLACE FUNCTION shelfwise_join(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_authors_trgm_idx" ON "books" USING gin (shelfwise_join("authors") gin_trgm_ops);
