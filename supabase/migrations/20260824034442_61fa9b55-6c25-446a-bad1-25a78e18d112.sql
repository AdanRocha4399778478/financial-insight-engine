GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO authenticated;
GRANT ALL ON public.client_users TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.column_mappings TO authenticated;
GRANT ALL ON public.column_mappings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.classification_audit TO authenticated;
GRANT ALL ON public.classification_audit TO service_role;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;