-- ============================================================
-- Programator Cursuri - schema Supabase
-- Ruleaza acest script in Supabase Studio -> SQL Editor -> New query
-- ============================================================

-- extensie pentru gen_random_uuid()
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILES (rol user / admin, legat de auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  -- preferinte personale de afisare a calendarului saptamanal (mutate din
  -- localStorage, ca sa fie aceleasi indiferent de dispozitivul folosit)
  week_bar_fields jsonb not null default '["time"]'::jsonb,
  color_mode text not null default 'duration' check (color_mode in ('duration','responsible','category')),
  custom_colors jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- pentru instalari existente (tabelul exista deja fara aceste coloane)
alter table public.profiles add column if not exists week_bar_fields jsonb not null default '["time"]'::jsonb;
alter table public.profiles add column if not exists color_mode text not null default 'duration';
alter table public.profiles add column if not exists custom_colors jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_color_mode_check;
alter table public.profiles add constraint profiles_color_mode_check check (color_mode in ('duration','responsible','category'));

-- creeaza automat un profil (rol implicit "user") la fiecare inregistrare noua
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- functie ajutatoare, folosita in politicile RLS (evita recursivitate)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- userii isi pot edita propriul profil (ex: preferintele de afisare), dar
-- NU au voie sa-si schimbe singuri rolul sau emailul, indiferent ce trimit
-- in cerere - doar adminul poate face asta (vezi politica profiles_update_admin).
create or replace function public.lock_profile_privileged_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_profile_privileged_fields on public.profiles;
create trigger trg_lock_profile_privileged_fields
  before update on public.profiles
  for each row execute procedure public.lock_profile_privileged_fields();

-- ------------------------------------------------------------
-- 2. TRAINERI (sursa dropdown, editabila doar de admin)
-- ------------------------------------------------------------
create table if not exists public.trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. SALI (sursa dropdown + capacitate, editabila doar de admin)
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity int,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. CURSURI
-- ------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,                      -- denumire curs
  course_type text,                        -- tip curs (live / online / etc.)
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  trainer text,                            -- nume trainer (din lista trainers)
  room text,                               -- nume sala (din lista rooms)
  participants_group text,                 -- "Participanti" (ex: Grup 1)
  participants_count int,                  -- "Nr. Participanti"
  responsible text,                        -- Responsabil
  invite_mail text,                        -- Mail invitare
  catering text,
  notes text,                              -- Observatii
  course_area text,                        -- Arie curs / categorie (ex: Soft skills, Tehnic, Conformitate)
  target_audience text,                    -- Public tinta (ex: Manageri, Noi angajati)
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint end_after_start check (end_date >= start_date)
);

create index if not exists idx_courses_start_date on public.courses(start_date);
create index if not exists idx_courses_end_date on public.courses(end_date);
create index if not exists idx_courses_room on public.courses(room);
create index if not exists idx_courses_trainer on public.courses(trainer);

-- pentru instalari existente (tabelul exista deja fara aceste coloane)
alter table public.courses add column if not exists course_area text;
alter table public.courses add column if not exists target_audience text;

-- pastreaza updated_at la zi
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute procedure public.set_updated_at();

-- ------------------------------------------------------------
-- 4bis. VERIFICARE SUPRAPUNERE SALA SI TRAINER (impiedica doua cursuri in
--       aceeasi sala, sau cu acelasi trainer, in perioade care se
--       intersecteaza). Ruleaza in baza de date, deci functioneaza
--       indiferent de unde vine cererea (aplicatie, SQL Editor, alt tool)
--       si previne si conflictele aparute din salvari simultane facute de
--       doi useri in acelasi timp.
-- ------------------------------------------------------------
create or replace function public.check_room_conflict()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  conflict_row record;
begin
  if new.room is null or btrim(new.room) = '' then
    return new;
  end if;

  select id, name, start_date, end_date, start_time, end_time
  into conflict_row
  from public.courses
  where room = new.room
    and id <> new.id
    and start_date <= new.end_date
    and end_date >= new.start_date
    and (
      new.start_time is null or new.end_time is null
      or start_time is null or end_time is null
      or (start_time < new.end_time and new.start_time < end_time)
    )
  limit 1;

  if found then
    raise exception 'Sala "%" este deja rezervata in perioada %  -  % de cursul "%".',
      new.room, conflict_row.start_date, conflict_row.end_date, conflict_row.name
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_room_conflict on public.courses;
create trigger trg_check_room_conflict
  before insert or update on public.courses
  for each row execute procedure public.check_room_conflict();

-- ------------------------------------------------------------
-- 4bis-b. VERIFICARE SUPRAPUNERE TRAINER (acelasi principiu ca la sala:
--       impiedica programarea aceluiasi trainer la doua cursuri cu
--       perioade care se intersecteaza).
-- ------------------------------------------------------------
create or replace function public.check_trainer_conflict()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  conflict_row record;
begin
  if new.trainer is null or btrim(new.trainer) = '' then
    return new;
  end if;

  select id, name, start_date, end_date, start_time, end_time
  into conflict_row
  from public.courses
  where trainer = new.trainer
    and id <> new.id
    and start_date <= new.end_date
    and end_date >= new.start_date
    and (
      new.start_time is null or new.end_time is null
      or start_time is null or end_time is null
      or (start_time < new.end_time and new.start_time < end_time)
    )
  limit 1;

  if found then
    raise exception 'Trainerul "%" este deja programat in perioada %  -  % la cursul "%".',
      new.trainer, conflict_row.start_date, conflict_row.end_date, conflict_row.name
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_trainer_conflict on public.courses;
create trigger trg_check_trainer_conflict
  before insert or update on public.courses
  for each row execute procedure public.check_trainer_conflict();

-- ------------------------------------------------------------
-- 4ter. GARANTIE ABSOLUTA impotriva suprapunerii de sala si de trainer, la
--       nivel de index (exclusion constraint). Trigger-ele de mai sus dau
--       un mesaj prietenos in aproape toate cazurile, dar - fiind de tip
--       "verifica, apoi salveaza" - au teoretic o fereastra minuscula de
--       risc daca doua salvari ajung absolut simultan. Regulile de mai jos
--       sunt verificate de Postgres direct in index si nu pot fi ocolite,
--       indiferent de concurenta: mecanismele impreuna acopera atat
--       mesajul prietenos (trigger), cat si garantia matematica
--       (exclusion constraint), pentru cazurile extrem de rare de
--       coliziune perfecta.
-- ------------------------------------------------------------
create extension if not exists btree_gist;

alter table public.courses
  add column if not exists period tsrange generated always as (
    tsrange(
      start_date + coalesce(start_time, time '00:00'),
      end_date + coalesce(end_time, time '23:59:59'),
      '[]'
    )
  ) stored;

alter table public.courses drop constraint if exists courses_no_room_overlap;
alter table public.courses
  add constraint courses_no_room_overlap
  exclude using gist (room with =, period with &&)
  where (room is not null and room <> '');

alter table public.courses drop constraint if exists courses_no_trainer_overlap;
alter table public.courses
  add constraint courses_no_trainer_overlap
  exclude using gist (trainer with =, period with &&)
  where (trainer is not null and trainer <> '');

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.trainers enable row level security;
alter table public.rooms enable row level security;
alter table public.courses enable row level security;

-- PROFILES: fiecare isi vede propriul profil; adminul vede tot
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- doar adminul poate schimba rolurile altor useri
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using (public.is_admin());

-- orice user isi poate edita propriul rand (ex: preferinte de afisare);
-- campurile privilegiate (rol, email) raman blocate de trigger-ul de mai sus
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- TRAINERS: orice user autentificat citeste; doar adminul scrie
drop policy if exists "trainers_select" on public.trainers;
create policy "trainers_select" on public.trainers for select
  using (auth.role() = 'authenticated');

drop policy if exists "trainers_admin_write" on public.trainers;
create policy "trainers_admin_write" on public.trainers for insert
  with check (public.is_admin());

drop policy if exists "trainers_admin_update" on public.trainers;
create policy "trainers_admin_update" on public.trainers for update
  using (public.is_admin());

drop policy if exists "trainers_admin_delete" on public.trainers;
create policy "trainers_admin_delete" on public.trainers for delete
  using (public.is_admin());

-- ROOMS: acelasi model ca la trainers
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms for select
  using (auth.role() = 'authenticated');

drop policy if exists "rooms_admin_write" on public.rooms;
create policy "rooms_admin_write" on public.rooms for insert
  with check (public.is_admin());

drop policy if exists "rooms_admin_update" on public.rooms;
create policy "rooms_admin_update" on public.rooms for update
  using (public.is_admin());

drop policy if exists "rooms_admin_delete" on public.rooms;
create policy "rooms_admin_delete" on public.rooms for delete
  using (public.is_admin());

-- COURSES: orice user autentificat vede toate cursurile (e un calendar comun);
-- adauga doar pentru sine; editeaza/sterge propriile cursuri sau, daca e admin, orice curs
drop policy if exists "courses_select" on public.courses;
create policy "courses_select" on public.courses for select
  using (auth.role() = 'authenticated');

drop policy if exists "courses_insert" on public.courses;
create policy "courses_insert" on public.courses for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

drop policy if exists "courses_update" on public.courses;
create policy "courses_update" on public.courses for update
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "courses_delete" on public.courses;
create policy "courses_delete" on public.courses for delete
  using (created_by = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- 6. DATE INITIALE (preluate din fisierul Excel atasat)
-- ------------------------------------------------------------
insert into public.trainers (name) values
  ('Trainer 1'), ('Trainer 2'), ('Trainer 3'), ('Trainer 4')
on conflict (name) do nothing;

insert into public.rooms (name, capacity) values
  ('Orion', 120),
  ('Velvet', 15),
  ('Leo', 150),
  ('Corp B - Etaj 1', 20),
  ('Corp B - Etaj 2', 15),
  ('Corp B - Etaj 3', 15),
  ('Online', 1000),
  ('Bacau', 50),
  ('Craiova', null),
  ('Timisoara', null),
  ('Iasi', null),
  ('Oradea', null),
  ('Brasov', null),
  ('Arad', null),
  ('Slatina', null),
  ('Constanta', null),
  ('Bistrita', null),
  ('Wonderland', null),
  ('Sala Mentori', 15),
  ('Valcea', null),
  ('Predeal', null),
  ('Bucuresti', null),
  ('Miercurea Ciuc', null),
  ('Baia Mare', null)
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- 7. Cum promovezi un user la rol admin (dupa ce si-a facut cont din aplicatie)
-- ------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'adresa@exemplu.com';
