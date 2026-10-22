-- Allow the database login used by the API to switch to the restricted RLS role.
DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 160000 THEN
    EXECUTE 'GRANT salestrace_app TO CURRENT_USER WITH SET TRUE';
  ELSE
    GRANT salestrace_app TO CURRENT_USER;
  END IF;
END
$$;
