-- RLS policy expressions call private.* helpers as the querying role (anon/authenticated), and every
-- helper is security definer. PostgreSQL still requires the CALLER to hold EXECUTE on the function
-- itself; the §15 revoke removed it for everyone. This is the necessary grant-back so policies work.
grant execute on all functions in schema private to anon, authenticated;

-- A direct call such as `select private.has_permission('x')` performed by anon/authenticated must
-- resolve the qualified name, which needs USAGE on the schema itself (EXECUTE alone is not enough:
-- policy expressions are resolved as postgres at create time, so they never notice the gap).
grant usage on schema private to anon, authenticated;