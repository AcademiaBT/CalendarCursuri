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
  -- coloanele de atribute afisate in dreapta zilelor, in vizualizarea saptamanala
  -- (implicit putine, ca sa incapa pe ecran fara scroll orizontal)
  week_attribute_columns jsonb not null default '["interval","trainer","room","responsible"]'::jsonb,
  -- latimile coloanelor din vizualizarea saptamanala (redimensionabile prin tragere)
  week_days_block_width int not null default 294,
  week_attr_col_widths jsonb not null default '{}'::jsonb,
  -- inaltimea randurilor din vizualizarea saptamanala (overview vs. detalii)
  week_row_height int not null default 22,
  -- pentru notificarea de cursuri neclarificate (TBD): ce nume din lista
  -- "Responsabili" corespund acestui user (poate fi legat de mai multe,
  -- ex. cineva care acopera si rolul altcuiva), si cu cate zile inainte sa alerteze
  responsible_names jsonb not null default '[]'::jsonb,
  -- null = alerte TBD dezactivate explicit de user (Setari); altfel, un
  -- numar de zile inainte de inceperea cursului
  notify_days_ahead int default 7,
  -- data ultimei schimbari de parola (folosita de functia de expirare
  -- parola - vezi src/config/securityFeatures.js - deocamdata dezactivata)
  password_changed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- pentru instalari existente (tabelul exista deja fara aceste coloane)
alter table public.profiles add column if not exists week_bar_fields jsonb not null default '["time"]'::jsonb;
alter table public.profiles add column if not exists color_mode text not null default 'duration';
alter table public.profiles add column if not exists custom_colors jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists week_attribute_columns jsonb not null default '["interval","trainer","room","responsible"]'::jsonb;
alter table public.profiles add column if not exists week_days_block_width int not null default 294;
alter table public.profiles add column if not exists week_attr_col_widths jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists week_row_height int not null default 22;
alter table public.profiles add column if not exists notify_days_ahead int not null default 7;
-- migrare de la "responsible_name" (un singur text) la "responsible_names"
-- (lista) - un user poate fi acum legat de mai multi responsabili deodata
alter table public.profiles add column if not exists responsible_names jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'responsible_name') then
    update public.profiles
      set responsible_names = jsonb_build_array(responsible_name)
      where responsible_name is not null and responsible_names = '[]'::jsonb;
    alter table public.profiles drop column responsible_name;
  end if;
end $$;
-- permite null (= alerte TBD dezactivate explicit de user, din Setari)
alter table public.profiles alter column notify_days_ahead drop not null;
-- data ultimei schimbari de parola - implicit "acum", ca nimeni sa nu para
-- "expirat" instant cand functia de expirare parola e activata mai tarziu
alter table public.profiles add column if not exists password_changed_at timestamptz default now();
update public.profiles set password_changed_at = now() where password_changed_at is null;
-- revenire: "display_name" a fost o incercare gresita (nume afisat cosmetic,
-- fara legatura cu alerta TBD) - corespondenta reala user <-> Responsabil se
-- face deja prin "responsible_name" de mai sus, editabila acum si central,
-- din Administrare -> Useri
alter table public.profiles drop column if exists display_name;
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
  -- verificarea se aplica doar cand exista o sesiune autentificata prin
  -- aplicatie (auth.uid() populat) - din SQL Editor / conexiune directa nu
  -- exista sesiune, deci nu blocam (accesul acolo necesita oricum
  -- credentiale de proiect Supabase, deja de incredere)
  if auth.uid() is not null and not public.is_admin() then
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
-- 3bis. RESPONSABILI (sursa dropdown pentru campul "Responsabil" de pe
--       curs, editabila doar de admin - la fel ca traineri/sali)
-- ------------------------------------------------------------
create table if not exists public.responsible_persons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
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
  trainers text[] not null default '{}',   -- lista de traineri (din lista trainers) - poate avea mai multi (co-facilitare)
  room text,                               -- nume sala (din lista rooms)
  participants_group text,                 -- "Participanti" (ex: Grup 1)
  participants_count int,                  -- "Nr. Participanti"
  responsible text,                        -- Responsabil
  invite_mail text,                        -- Mail invitare
  catering text,
  notes text,                              -- Observatii
  course_area text,                        -- Arie curs / categorie (ex: Soft skills, Tehnic, Conformitate)
  target_audience text,                    -- Public tinta (ex: Manageri, Noi angajati)
  -- curs anulat: ramane vizibil in calendar (marcat distinct), dar exclus
  -- din verificarile de suprapunere sala/trainer - elibereaza sala/trainerul
  -- pentru altceva, fara sa piarda istoricul (spre deosebire de stergere)
  cancelled boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint end_after_start check (end_date >= start_date)
);

create index if not exists idx_courses_start_date on public.courses(start_date);
create index if not exists idx_courses_end_date on public.courses(end_date);
create index if not exists idx_courses_room on public.courses(room);
create index if not exists idx_courses_trainers on public.courses using gin(trainers);

-- pentru instalari existente (tabelul exista deja fara aceste coloane)
alter table public.courses add column if not exists course_area text;
alter table public.courses add column if not exists target_audience text;
alter table public.courses add column if not exists cancelled boolean not null default false;

-- migrare de la "trainer" (un singur text) la "trainers" (lista) - un curs
-- poate avea acum mai multi traineri deodata (co-facilitare, predare in
-- echipa). Cursurile vechi ajung cu un singur element in lista.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'courses' and column_name = 'trainer') then
    alter table public.courses add column if not exists trainers text[] not null default '{}';
    update public.courses
      set trainers = array[coalesce(nullif(btrim(trainer), ''), 'TBD')]
      where trainers = '{}';
    drop index if exists idx_courses_trainer;
    alter table public.courses drop constraint if exists courses_no_trainer_overlap;
    drop trigger if exists trg_check_trainer_conflict on public.courses;
    alter table public.courses drop column trainer;
  end if;
end $$;

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
  -- "Online" nu e o sala fizica - pot exista oricate cursuri online simultan,
  -- exact ca "TBD" (neclarificat), nu se aplica limita de "un curs odata".
  -- Un curs ANULAT nu se mai verifica deloc - nu blocheaza altele, si nici
  -- nu poate fi el insusi blocat (eliberam sala pentru altceva).
  if new.room is null or btrim(new.room) = '' or new.room = 'TBD' or new.room = 'Online' or new.cancelled then
    return new;
  end if;

  select id, name, start_date, end_date, start_time, end_time
  into conflict_row
  from public.courses
  where room = new.room
    and not cancelled
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
-- 4bis-b. VERIFICARE SUPRAPUNERE TRAINER (acelasi principiu ca la sala, dar
--       pe LISTA de traineri, nu un singur nume - un curs poate avea mai
--       multi traineri (co-facilitare); verificarea semnaleaza conflict daca
--       ORICARE dintre trainerii selectati e deja programat, in acea
--       perioada, la alt curs. "TBD" e exclus din verificare, la fel ca
--       inainte.
-- ------------------------------------------------------------
create or replace function public.check_trainer_conflict()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  conflict_row record;
  real_trainers text[];
begin
  real_trainers := array_remove(new.trainers, 'TBD');
  -- un curs ANULAT nu se mai verifica deloc - nu blocheaza altele, si nici
  -- nu poate fi el insusi blocat (eliberam trainerii pentru altceva)
  if real_trainers is null or array_length(real_trainers, 1) is null or new.cancelled then
    return new;
  end if;

  select id, name, start_date, end_date, start_time, end_time
  into conflict_row
  from public.courses
  where array_remove(trainers, 'TBD') && real_trainers
    and not cancelled
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
    raise exception 'Cel putin unul dintre trainerii alesi este deja programat in perioada %  -  % la cursul "%".',
      conflict_row.start_date, conflict_row.end_date, conflict_row.name
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
-- 4ter. GARANTIE ABSOLUTA impotriva suprapunerii, la nivel de index
--       (exclusion constraint) - PENTRU SALA. Trigger-ul de mai sus da un
--       mesaj prietenos in aproape toate cazurile, dar - fiind de tip
--       "verifica, apoi salveaza" - are teoretic o fereastra minuscula de
--       risc daca doua salvari ajung absolut simultan. Regula de mai jos e
--       verificata de Postgres direct in index si nu poate fi ocolita,
--       indiferent de concurenta.
--
--       PENTRU TRAINERI, aceeasi garantie matematica NU e posibila cu
--       aceeasi usurinta de cand "trainers" a devenit lista (array): tipul
--       GiST necesar pentru exclusion constraints nu are, in Postgres
--       standard, un operator nativ de "suprapunere intre liste de text"
--       (spre deosebire de o singura valoare text, unde "=" functioneaza
--       direct). Trainerii raman deci protejati DOAR de trigger-ul de mai
--       sus (verificare foarte fiabila, dar teoretic - in cazuri extrem de
--       rare de doua salvari absolut simultane - nu 100% matematic
--       garantata, ca la sala). Compromis constient, acceptat ca sa evitam
--       o restructurare mult mai mare (tabel separat pentru traineri).
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
  -- "Online" exclus la fel ca "TBD" - nu e o sala fizica, nu are sens sa
  -- limitam la un singur curs simultan (vezi si check_room_conflict() mai sus).
  -- Cursurile ANULATE sunt si ele excluse - nu mai ocupa nimic.
  where (room is not null and room <> '' and room <> 'TBD' and room <> 'Online' and not cancelled);

-- eliminat: courses_no_trainer_overlap (exclusion constraint) - nu se mai
-- poate aplica pe coloana "trainers" (lista) - vezi explicatia de mai sus

-- ------------------------------------------------------------
-- 4quater. SETARI BACKUP AUTOMAT (export xlsx complet trimis pe email,
--       cu frecventa aleasa de admin din aplicatie - vezi Administrare).
--       Un singur rand (id=1); citit/actualizat de scriptul rulat de
--       GitHub Actions (.github/workflows/backup.yml).
-- ------------------------------------------------------------
create table if not exists public.backup_settings (
  id int primary key default 1,
  frequency text not null default 'weekly' check (frequency in ('daily','weekly','monthly','disabled')),
  recipient_emails text not null default '',
  last_sent_at timestamptz,
  updated_at timestamptz default now(),
  constraint backup_settings_singleton check (id = 1)
);

-- pentru instalari existente (tabelul exista deja, fara optiunea "disabled")
alter table public.backup_settings drop constraint if exists backup_settings_frequency_check;
alter table public.backup_settings add constraint backup_settings_frequency_check
  check (frequency in ('daily','weekly','monthly','disabled'));

insert into public.backup_settings (id, frequency, recipient_emails)
values (1, 'weekly', '')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.trainers enable row level security;
alter table public.rooms enable row level security;
alter table public.responsible_persons enable row level security;
alter table public.courses enable row level security;
alter table public.backup_settings enable row level security;

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

-- TRAINERS: orice user autentificat citeste si ADAUGA (necesar pentru auto-
-- crearea din combobox-ul de pe formularul de curs, cand se scrie un nume
-- nou); doar adminul editeaza sau sterge
drop policy if exists "trainers_select" on public.trainers;
create policy "trainers_select" on public.trainers for select
  using (auth.role() = 'authenticated');

drop policy if exists "trainers_admin_write" on public.trainers;
drop policy if exists "trainers_authenticated_insert" on public.trainers;
create policy "trainers_authenticated_insert" on public.trainers for insert
  with check (auth.role() = 'authenticated');

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
drop policy if exists "rooms_authenticated_insert" on public.rooms;
create policy "rooms_authenticated_insert" on public.rooms for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "rooms_admin_update" on public.rooms;
create policy "rooms_admin_update" on public.rooms for update
  using (public.is_admin());

drop policy if exists "rooms_admin_delete" on public.rooms;
create policy "rooms_admin_delete" on public.rooms for delete
  using (public.is_admin());

-- RESPONSABILI: acelasi model ca la trainers/rooms
drop policy if exists "responsible_persons_select" on public.responsible_persons;
create policy "responsible_persons_select" on public.responsible_persons for select
  using (auth.role() = 'authenticated');

drop policy if exists "responsible_persons_admin_write" on public.responsible_persons;
drop policy if exists "responsible_persons_authenticated_insert" on public.responsible_persons;
create policy "responsible_persons_authenticated_insert" on public.responsible_persons for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "responsible_persons_admin_update" on public.responsible_persons;
create policy "responsible_persons_admin_update" on public.responsible_persons for update
  using (public.is_admin());

drop policy if exists "responsible_persons_admin_delete" on public.responsible_persons;
create policy "responsible_persons_admin_delete" on public.responsible_persons for delete
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

-- BACKUP_SETTINGS: orice user autentificat vede setarea curenta (afisata
-- informativ); doar adminul o poate schimba
drop policy if exists "backup_settings_select" on public.backup_settings;
create policy "backup_settings_select" on public.backup_settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "backup_settings_admin_update" on public.backup_settings;
create policy "backup_settings_admin_update" on public.backup_settings for update
  using (public.is_admin());

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
