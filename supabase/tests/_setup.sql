create extension if not exists pgtap;

-- The runner executes every .sql file under supabase/tests as a TAP test, including
-- this one. It must therefore emit a valid TAP plan rather than only side effects.
select plan(1);
select pass('pgtap extension installed');
select * from finish();