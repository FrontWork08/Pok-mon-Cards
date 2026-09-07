-- The Sketchfab import dispatcher is a trigger-only SECURITY DEFINER function.
-- It must never be callable directly through the exposed RPC API.
revoke all on function public.server_sketchfab_import_job_trigger() from public, anon, authenticated;
grant execute on function public.server_sketchfab_import_job_trigger() to service_role;
