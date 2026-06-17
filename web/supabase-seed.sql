-- CuidaVoz — seed de desarrollo para verificar las lecturas del web app.
--
-- Crea un cuidador de prueba (auth.users → dispara el trigger que crea su
-- profile), una familia (trigger lo hace owner en family_members), un adulto
-- mayor, dos reportes con payload jsonb de ejemplo y algunas alertas.
--
-- La RLS del web app filtra por membresía: como este usuario es owner de la
-- familia, al loguearse en la UI con estas credenciales ve todos estos datos.
--
-- Uso:
--   docker exec -i supabase_db_elderly-care-engineering \
--     psql -U postgres -d postgres < web/supabase-seed.sql
--
-- Credenciales para loguear en la UI:
--   email:    demo@cuidavoz.test
--   password: cuidavoz123
--
-- Idempotente: si el usuario ya existe, no duplica. Reejecutarlo recrea los
-- datos del dominio (familia/elder/reports/alerts) para ese usuario.

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_elder_id uuid;
  v_report1_id uuid;
  v_report2_id uuid;
begin
  -- 1) Cuidador de prueba en auth.users (idempotente por email).
  select id into v_user_id from auth.users where email = 'demo@cuidavoz.test';

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'demo@cuidavoz.test',
      crypt('cuidavoz123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Demo Cuidador/a"}'::jsonb,
      now(), now()
    );

    -- GoTrue espera una fila de identidad por usuario.
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', 'demo@cuidavoz.test'),
      'email', now(), now(), now()
    );
  end if;

  -- Limpieza de datos de dominio previos de este usuario (re-seed limpio).
  delete from public.families where created_by = v_user_id;

  -- 2) Familia (el trigger agrega al creador como owner en family_members).
  insert into public.families (nombre, created_by)
  values ('Familia Pérez', v_user_id)
  returning id into v_family_id;

  -- 3) Adulto mayor.
  insert into public.elders (family_id, nombre, metadata)
  values (
    v_family_id, 'Rosa Pérez',
    '{"notas":"Hipertensión. Toma enalapril por la mañana."}'::jsonb
  )
  returning id into v_elder_id;

  -- 4) Reporte 1 (con alertas en el payload).
  insert into public.reports (elder_id, family_id, fecha, payload, resumen, confianza, incompleto)
  values (
    v_elder_id, v_family_id, current_date,
    jsonb_build_object(
      'fecha', current_date,
      'salud', jsonb_build_object(
        'sintomas', jsonb_build_array('dolor de cabeza leve'),
        'medicacion_tomada', true,
        'dolor', 'leve, en la frente'
      ),
      'sueno', jsonb_build_object('calidad', 'regular', 'notas', 'se despertó dos veces'),
      'animo', jsonb_build_object('estado', 'tranquila', 'notas', 'contenta por la visita de su nieta'),
      'actividades', jsonb_build_array('caminata corta', 'almorzó con apetito'),
      'alertas', jsonb_build_array(
        jsonb_build_object('tipo','dolor','severidad','media','evidencia','Mencionó dolor de cabeza dos veces'),
        jsonb_build_object('tipo','sueño','severidad','baja','evidencia','Sueño interrumpido')
      ),
      'resumen', 'Día tranquilo. Tomó la medicación. Dolor de cabeza leve y sueño algo interrumpido.',
      'claims', jsonb_build_array(
        jsonb_build_object('afirmacion','Tomó la medicación','campo','salud.medicacion_tomada','fuente_textual','tomé la pastilla de la presión')
      ),
      'incompleto', false
    ),
    'Día tranquilo. Tomó la medicación. Dolor de cabeza leve y sueño algo interrumpido.',
    0.86, false
  )
  returning id into v_report1_id;

  -- 5) Reporte 2 (ayer, marcado incompleto, con una alerta alta).
  insert into public.reports (elder_id, family_id, fecha, payload, resumen, confianza, incompleto)
  values (
    v_elder_id, v_family_id, current_date - 1,
    jsonb_build_object(
      'fecha', current_date - 1,
      'salud', jsonb_build_object(
        'sintomas', jsonb_build_array('mareo'),
        'medicacion_tomada', false,
        'dolor', null
      ),
      'sueno', jsonb_build_object('calidad', 'mala', 'notas', 'casi no durmió'),
      'animo', jsonb_build_object('estado', 'irritable', 'notas', null),
      'actividades', jsonb_build_array('se quedó en cama gran parte del día'),
      'alertas', jsonb_build_array(
        jsonb_build_object('tipo','medicación','severidad','alta','evidencia','No tomó la medicación de la presión'),
        jsonb_build_object('tipo','caída','severidad','media','evidencia','Refirió un mareo al levantarse')
      ),
      'resumen', 'No tomó la medicación y refirió un mareo. Durmió mal.',
      'claims', jsonb_build_array(),
      'incompleto', true
    ),
    'No tomó la medicación y refirió un mareo. Durmió mal.',
    0.61, true
  )
  returning id into v_report2_id;

  -- 6) Alertas (tabla `alerts`, derivadas de los reportes).
  insert into public.alerts (report_id, elder_id, family_id, tipo, severidad, evidencia) values
    (v_report1_id, v_elder_id, v_family_id, 'dolor',      'media', 'Mencionó dolor de cabeza dos veces'),
    (v_report1_id, v_elder_id, v_family_id, 'sueño',      'baja',  'Sueño interrumpido'),
    (v_report2_id, v_elder_id, v_family_id, 'medicación', 'alta',  'No tomó la medicación de la presión'),
    (v_report2_id, v_elder_id, v_family_id, 'caída',      'media', 'Refirió un mareo al levantarse');

  raise notice 'Seed OK. user=% family=% elder=%', v_user_id, v_family_id, v_elder_id;
end $$;
