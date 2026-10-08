create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid, crypt
create extension if not exists pg_trgm with schema extensions;    -- fuzzy title search
create extension if not exists unaccent with schema extensions;   -- diacritic-insensitive search
create extension if not exists citext with schema extensions;     -- case-insensitive email
