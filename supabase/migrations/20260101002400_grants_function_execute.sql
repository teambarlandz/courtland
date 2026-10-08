-- RLS policy expressions call private.* helpers as the querying role (anon/authenticated), and every
-- helper is security definer. PostgreSQL still requires the CALLER to hold EXECUTE on the function
-- itself; the §15 revoke removed it for everyone. This is the necessary grant-back so policies work.
grant execute on all functions in schema private to anon, authenticated;