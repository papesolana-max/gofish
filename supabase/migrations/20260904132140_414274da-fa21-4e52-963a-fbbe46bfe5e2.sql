REVOKE EXECUTE ON FUNCTION public.record_catch(text, text, text, numeric, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.record_catch(text, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) TO service_role;
