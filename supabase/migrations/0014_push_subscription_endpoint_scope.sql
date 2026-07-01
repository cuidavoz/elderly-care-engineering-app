-- Ajusta la unicidad de Web Push para soportar el mismo navegador con más de
-- una cuenta. La Push API reutiliza el endpoint por service worker; si quedaba
-- único globalmente, un cuidador no podía activar avisos después de probar como
-- adulto mayor en el mismo browser.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

create unique index if not exists uniq_push_subscriptions_profile_elder_endpoint
  on public.push_subscriptions (profile_id, elder_id, endpoint);
