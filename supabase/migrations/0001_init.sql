-- CuidaVoz — esquema inicial multi-tenant
-- Tenant = familia. RLS aísla por pertenencia (family_members).
-- El esquema `Reporte` de Pydantic vive en el jsonb `reports.payload`.

-- ----------------------------------------------------------------------------
-- Extensiones
-- ----------------------------------------------------------------------------
create extension if not exists "vector" with schema extensions;

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
create type public.family_role as enum ('owner', 'caregiver');
create type public.alert_severity as enum ('baja', 'media', 'alta');

-- ----------------------------------------------------------------------------
-- profiles: espejo de auth.users (cuidador logueado)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nombre      text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- families: el tenant
-- ----------------------------------------------------------------------------
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- family_members: pertenencia cuidador <-> familia + rol
create table public.family_members (
  family_id   uuid not null references public.families (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  rol         public.family_role not null default 'caregiver',
  created_at  timestamptz not null default now(),
  primary key (family_id, profile_id)
);

-- Al crear una familia, su creador queda como owner.
create or replace function public.handle_new_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.family_members (family_id, profile_id, rol)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_family_created
  after insert on public.families
  for each row execute function public.handle_new_family();

-- Helper security-definer: evita recursión en las políticas RLS.
create or replace function public.is_family_member(_family_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = _family_id
      and fm.profile_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- elders: adulto mayor (emisor de audios; no loguea)
-- ----------------------------------------------------------------------------
create table public.elders (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  nombre      text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index idx_elders_family on public.elders (family_id);

-- ----------------------------------------------------------------------------
-- reports: reporte estructurado de un día (payload = esquema Reporte)
-- ----------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  elder_id    uuid not null references public.elders (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  fecha       date not null,
  payload     jsonb not null,
  resumen     text,
  confianza   real,
  incompleto  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_reports_elder on public.reports (elder_id, fecha desc);

-- ----------------------------------------------------------------------------
-- alerts: alerta derivada de un reporte
-- ----------------------------------------------------------------------------
create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  elder_id    uuid not null references public.elders (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  tipo        text not null,
  severidad   public.alert_severity not null,
  evidencia   text,
  created_at  timestamptz not null default now()
);
create index idx_alerts_elder on public.alerts (elder_id, created_at desc);

-- ----------------------------------------------------------------------------
-- report_embeddings: vector para RAG (pgvector)
-- ----------------------------------------------------------------------------
create table public.report_embeddings (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  elder_id    uuid not null references public.elders (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  contenido   text not null,
  embedding   extensions.vector(1536) not null,
  created_at  timestamptz not null default now()
);
create index idx_embeddings_hnsw
  on public.report_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Recuperación semántica para el Q&A (acotada al adulto mayor).
create or replace function public.match_reports(
  _elder_id uuid,
  _query_embedding extensions.vector(1536),
  _match_count int default 5
)
returns table (report_id uuid, contenido text, similarity float)
language sql
stable
set search_path = ''
as $$
  select e.report_id, e.contenido,
         1 - (e.embedding operator(extensions.<=>) _query_embedding) as similarity
  from public.report_embeddings e
  where e.elder_id = _elder_id
  order by e.embedding operator(extensions.<=>) _query_embedding
  limit _match_count;
$$;

-- ----------------------------------------------------------------------------
-- RLS: todo accesible solo por miembros de la familia (tenant)
-- ----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.families          enable row level security;
alter table public.family_members    enable row level security;
alter table public.elders            enable row level security;
alter table public.reports           enable row level security;
alter table public.alerts            enable row level security;
alter table public.report_embeddings enable row level security;

-- profiles: cada uno ve/edita el suyo
create policy "perfil propio: ver" on public.profiles
  for select using (id = (select auth.uid()));
create policy "perfil propio: editar" on public.profiles
  for update using (id = (select auth.uid()));

-- families: ver las propias; crear como uno mismo
create policy "familias: ver las propias" on public.families
  for select using (public.is_family_member(id));
create policy "familias: crear" on public.families
  for insert with check (created_by = (select auth.uid()));
create policy "familias: owner edita" on public.families
  for update using (public.is_family_member(id));

-- family_members: ver los de mis familias
create policy "miembros: ver" on public.family_members
  for select using (public.is_family_member(family_id));
create policy "miembros: agregar a mi familia" on public.family_members
  for insert with check (public.is_family_member(family_id));

-- elders / reports / alerts / embeddings: acceso por pertenencia a la familia.
-- (El backend Python escribe con service role y bypassa RLS; estas políticas
--  habilitan al web app a leer y a crear adultos mayores.)
create policy "elders: miembros" on public.elders
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "reports: miembros leen" on public.reports
  for select using (public.is_family_member(family_id));

create policy "alerts: miembros leen" on public.alerts
  for select using (public.is_family_member(family_id));

create policy "embeddings: miembros leen" on public.report_embeddings
  for select using (public.is_family_member(family_id));
