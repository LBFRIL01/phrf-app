-- South Texas PHRF app: first version of the database.
--
-- Plain-English overview
--   profiles      one row per person who signs in (their role lives here)
--   owners        boat owners and charterers (may or may not have signed in)
--   boats         one record per boat; survives owner changes
--   boat_owners   who owns or charters which boat, with dates
--   applications  rating applications (new, renewal, change, appeal)
--   attachments   files uploaded to an application (photos, sail sheets...)
--   votes         each committee member's proposed rating for an application
--   comments      committee discussion on an application
--   ratings       every rating ever issued; withdrawn ones are kept, not deleted
--   import_batches  each import of past applications, so an import can be undone
--   activity      a log of who did what, for the record
--
-- Nothing important is ever hard-deleted from the app: ratings are
-- withdrawn, comments and files are hidden, and imports can be undone.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('owner', 'committee', 'chair', 'admin');
create type public.application_type as enum ('new', 'renewal', 'change', 'appeal');
create type public.application_status as enum (
  'received',    -- just submitted, chair has not looked yet
  'needs_info',  -- chair asked the owner for something
  'in_review',   -- open for committee votes
  'rated',       -- final rating issued
  'appealed',    -- owner appealed; reopened for review
  'withdrawn'    -- closed without a rating
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text,
  role        public.user_role not null default 'owner',
  created_at  timestamptz not null default now()
);

create table public.settings (
  id            int primary key default 1 check (id = 1),
  org_name      text not null default 'South Texas PHRF',
  quorum        int  not null default 3 check (quorum > 0),
  review_days   int  not null default 7 check (review_days > 0),
  rating_valid_months int not null default 12 check (rating_valid_months > 0),
  updated_at    timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  file_name   text,
  row_count   int not null default 0,
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);

create table public.owners (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references public.profiles (id) on delete set null,
  full_name         text not null,
  email             text,
  phone             text,
  club              text,
  us_sailing_number text,
  notes             text,
  import_batch      uuid references public.import_batches (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index owners_email_key on public.owners (lower(email)) where email is not null and email <> '';
create index owners_profile_idx on public.owners (profile_id);

create table public.boats (
  id              uuid primary key default gen_random_uuid(),
  sail_number     text not null,
  name            text,
  make            text,
  model           text,
  year            int,
  hull_number     text,
  loa_ft          numeric,
  lwl_ft          numeric,
  beam_ft         numeric,
  draft_ft        numeric,
  displacement_lb numeric,
  rig             text,   -- masthead / fractional
  keel            text,
  propeller       text,   -- fixed / folding / feathering / none
  home_port       text,
  notes           text,
  import_batch    uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Sail numbers are compared without spaces or dashes and ignoring case,
-- so "USA 1234", "usa-1234" and "USA1234" are treated as the same boat.
create function public.normalize_sail(s text) returns text
  language sql immutable as $$ select upper(regexp_replace(coalesce(s, ''), '[\s\-]', '', 'g')) $$;
create index boats_sail_idx on public.boats (public.normalize_sail(sail_number));

create table public.boat_owners (
  boat_id    uuid not null references public.boats (id) on delete cascade,
  owner_id   uuid not null references public.owners (id) on delete cascade,
  relation   text not null default 'owner' check (relation in ('owner', 'co-owner', 'charterer')),
  since      date,
  until      date,
  primary key (boat_id, owner_id, relation)
);

create sequence public.application_number_seq;

create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique
                  default ('A-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.application_number_seq')::text, 4, '0')),
  boat_id         uuid not null references public.boats (id),
  owner_id        uuid references public.owners (id),
  submitted_by    uuid references public.profiles (id),
  type            public.application_type not null default 'new',
  status          public.application_status not null default 'received',
  received_at     timestamptz not null default now(),
  details         jsonb not null default '{}'::jsonb,  -- everything the owner filled in
  owner_notes     text,
  folder_url      text,   -- e.g. a Google Drive folder for older applications
  review_deadline date,
  final_rating    int,
  decided_at      timestamptz,
  decision_notes  text,
  source          text not null default 'online' check (source in ('online', 'import')),
  import_batch    uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index applications_status_idx on public.applications (status);
create index applications_boat_idx on public.applications (boat_id);

create table public.attachments (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  storage_path    text not null unique,
  file_name       text not null,
  content_type    text,
  size_bytes      bigint,
  kind            text not null default 'other'
                  check (kind in ('photo', 'sail_measurements', 'certificate', 'payment', 'other')),
  uploaded_by     uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  hidden_at       timestamptz
);
create index attachments_app_idx on public.attachments (application_id);

create table public.votes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  member_id       uuid not null references public.profiles (id) default auth.uid(),
  proposed_rating int,
  adjustments     text,
  comment         text,
  recused         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, member_id),
  check (recused or proposed_rating is not null)
);

create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) default auth.uid(),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now(),
  hidden_at       timestamptz
);
create index comments_app_idx on public.comments (application_id);

create table public.ratings (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boats (id) on delete cascade,
  application_id  uuid references public.applications (id) on delete set null,
  rating          int not null,            -- seconds per mile
  configuration   text not null default 'Spinnaker',
  adjustments     text,
  effective_on    date not null default current_date,
  expires_on      date,
  issued_by       uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  withdrawn_reason text,
  superseded_by   uuid references public.ratings (id) on delete set null,
  import_batch    uuid references public.import_batches (id) on delete set null
);
create index ratings_boat_idx on public.ratings (boat_id);

create table public.activity (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor           uuid references public.profiles (id) on delete set null default auth.uid(),
  application_id  uuid references public.applications (id) on delete cascade,
  boat_id         uuid references public.boats (id) on delete cascade,
  action          text not null,
  details         jsonb not null default '{}'::jsonb
);
create index activity_app_idx on public.activity (application_id);

-- ---------------------------------------------------------------------------
-- Role helpers (used by the access rules below)
-- ---------------------------------------------------------------------------
create function public.my_role() returns public.user_role
  language sql stable security definer set search_path = public
  as $$ select role from public.profiles where id = auth.uid() $$;

create function public.is_committee() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(public.my_role() in ('committee', 'chair', 'admin'), false) $$;

create function public.is_chair() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(public.my_role() in ('chair', 'admin'), false) $$;

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- Is the signed-in person the submitter or listed owner of this application?
create function public.owns_application(app uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (
      select 1 from public.applications a
      left join public.owners o on o.id = a.owner_id
      where a.id = app and (a.submitted_by = auth.uid() or o.profile_id = auth.uid())
    )
  $$;

create function public.owns_boat(b uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (
      select 1 from public.boat_owners bo
      join public.owners o on o.id = bo.owner_id
      where bo.boat_id = b and o.profile_id = auth.uid()
    )
  $$;

create function public.log_activity(p_action text, p_app uuid, p_boat uuid, p_details jsonb default '{}'::jsonb)
  returns void language sql security definer set search_path = public
  as $$ insert into public.activity (action, application_id, boat_id, details) values (p_action, p_app, p_boat, coalesce(p_details, '{}'::jsonb)) $$;

-- ---------------------------------------------------------------------------
-- Automatic behaviour
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger owners_touch before update on public.owners for each row execute function public.touch_updated_at();
create trigger boats_touch before update on public.boats for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger votes_touch before update on public.votes for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- When someone signs in for the first time, make their profile.
-- The very first person becomes the admin, so the app can be set up
-- without touching the database. If an owner record with the same email
-- already exists (for example from an import), it is linked to them.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles where role = 'admin') then 'owner'::public.user_role
         else 'admin'::public.user_role end
  );
  update public.owners set profile_id = new.id
   where profile_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Votes and comments are written to the record automatically.
create function public.log_vote() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(
    case when tg_op = 'INSERT' then 'vote_cast' when tg_op = 'UPDATE' then 'vote_changed' else 'vote_removed' end,
    coalesce(new.application_id, old.application_id), null,
    jsonb_build_object('recused', coalesce(new.recused, old.recused)));
  return coalesce(new, old);
end $$;
create trigger votes_log after insert or update or delete on public.votes for each row execute function public.log_vote();

-- Votes can only be cast, changed or removed while an application is open for review.
create function public.check_vote_open() returns trigger
  language plpgsql security definer set search_path = public as $$
declare s public.application_status;
begin
  select status into s from public.applications where id = coalesce(new.application_id, old.application_id);
  if s not in ('in_review', 'appealed') then
    raise exception 'Voting is closed for this application (status: %)', s;
  end if;
  return coalesce(new, old);
end $$;
create trigger votes_open before insert or update or delete on public.votes for each row execute function public.check_vote_open();

-- ---------------------------------------------------------------------------
-- Actions (the app calls these; each checks who is allowed)
-- ---------------------------------------------------------------------------

-- An owner submits an application. Finds or creates their owner record and
-- the boat (by sail number), then creates the application.
create function public.submit_application(p jsonb)
  returns table (id uuid, number text)
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_profile public.profiles;
  v_owner uuid;
  v_boat uuid;
  v_app public.applications;
  b jsonb := coalesce(p -> 'boat', '{}'::jsonb);
  o jsonb := coalesce(p -> 'owner', '{}'::jsonb);
  v_sail text := trim(coalesce(b ->> 'sail_number', ''));
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if v_sail = '' then raise exception 'Sail number is required'; end if;
  if coalesce(trim(o ->> 'full_name'), '') = '' then raise exception 'Owner name is required'; end if;

  select * into v_profile from public.profiles where profiles.id = uid;

  -- owner record
  select owners.id into v_owner from public.owners where profile_id = uid limit 1;
  if v_owner is null then
    select owners.id into v_owner from public.owners
     where email is not null and lower(email) = lower(v_profile.email) limit 1;
  end if;
  if v_owner is null then
    insert into public.owners (profile_id, full_name, email, phone, club, us_sailing_number)
    values (uid, trim(o ->> 'full_name'), v_profile.email, o ->> 'phone', o ->> 'club', o ->> 'us_sailing_number')
    returning owners.id into v_owner;
  else
    update public.owners set
      profile_id = coalesce(profile_id, uid),
      full_name = coalesce(nullif(trim(o ->> 'full_name'), ''), full_name),
      phone = coalesce(nullif(o ->> 'phone', ''), phone),
      club = coalesce(nullif(o ->> 'club', ''), club),
      us_sailing_number = coalesce(nullif(o ->> 'us_sailing_number', ''), us_sailing_number)
    where owners.id = v_owner;
  end if;
  update public.profiles set full_name = trim(o ->> 'full_name'), phone = coalesce(nullif(o ->> 'phone', ''), phone)
   where profiles.id = uid and coalesce(full_name, '') = '';

  -- boat record: reuse an existing boat with the same sail number. The
  -- submitted boat details are kept on the application so the committee can
  -- compare them with the record before changing it.
  select boats.id into v_boat from public.boats
   where public.normalize_sail(sail_number) = public.normalize_sail(v_sail)
   order by created_at limit 1;
  if v_boat is null then
    insert into public.boats (sail_number, name, make, model, year, hull_number, loa_ft, lwl_ft, beam_ft,
                              draft_ft, displacement_lb, rig, keel, propeller, home_port)
    values (v_sail, b ->> 'name', b ->> 'make', b ->> 'model', nullif(b ->> 'year', '')::int, b ->> 'hull_number',
            nullif(b ->> 'loa_ft', '')::numeric, nullif(b ->> 'lwl_ft', '')::numeric, nullif(b ->> 'beam_ft', '')::numeric,
            nullif(b ->> 'draft_ft', '')::numeric, nullif(b ->> 'displacement_lb', '')::numeric,
            b ->> 'rig', b ->> 'keel', b ->> 'propeller', b ->> 'home_port')
    returning boats.id into v_boat;
  end if;
  insert into public.boat_owners (boat_id, owner_id, relation)
  values (v_boat, v_owner, coalesce(nullif(o ->> 'relation', ''), 'owner'))
  on conflict do nothing;

  insert into public.applications (boat_id, owner_id, submitted_by, type, details, owner_notes)
  values (v_boat, v_owner, uid, coalesce(nullif(p ->> 'type', ''), 'new')::public.application_type,
          p - 'type' - 'owner_notes', p ->> 'owner_notes')
  returning * into v_app;

  perform public.log_activity('submitted', v_app.id, v_boat, jsonb_build_object('type', v_app.type));
  return query select v_app.id, v_app.number;
end $$;

-- The chair moves an application along (or back). Every change is logged,
-- so a mistaken change can simply be changed back.
create function public.set_application_status(
  p_app uuid, p_status public.application_status, p_deadline date default null, p_note text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare v_old public.applications;
begin
  if not public.is_chair() then raise exception 'Only the rating chair can do this'; end if;
  if p_status = 'rated' then raise exception 'Use "Issue rating" to rate an application'; end if;
  select * into v_old from public.applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if v_old.status = 'rated' then raise exception 'Undo the issued rating first'; end if;
  update public.applications
     set status = p_status,
         review_deadline = case when p_status in ('in_review', 'appealed')
                                then coalesce(p_deadline, review_deadline,
                                       current_date + (select review_days from public.settings where id = 1))
                                else review_deadline end
   where id = p_app;
  perform public.log_activity('status_changed', p_app, v_old.boat_id,
    jsonb_build_object('from', v_old.status, 'to', p_status, 'note', p_note));
end $$;

-- The chair issues the final rating. Any current rating for the same boat and
-- configuration is withdrawn (kept in history) and replaced.
create function public.finalize_application(
  p_app uuid, p_rating int, p_configuration text default 'Spinnaker', p_adjustments text default null,
  p_notes text default null, p_effective date default null, p_expires date default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.applications;
  v_new uuid;
  v_eff date := coalesce(p_effective, current_date);
  v_conf text := coalesce(nullif(trim(p_configuration), ''), 'Spinnaker');
begin
  if not public.is_chair() then raise exception 'Only the rating chair can do this'; end if;
  if p_rating is null then raise exception 'A rating is required'; end if;
  select * into v_app from public.applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if v_app.status = 'rated' then raise exception 'This application already has a rating'; end if;

  insert into public.ratings (boat_id, application_id, rating, configuration, adjustments, effective_on, expires_on)
  values (v_app.boat_id, p_app, p_rating, v_conf, p_adjustments, v_eff,
          coalesce(p_expires, (v_eff + make_interval(months => (select rating_valid_months from public.settings where id = 1)))::date))
  returning id into v_new;

  update public.ratings
     set withdrawn_at = now(), withdrawn_reason = 'Replaced by ' || v_app.number, superseded_by = v_new
   where boat_id = v_app.boat_id and configuration = v_conf and withdrawn_at is null and id <> v_new;

  update public.applications
     set status = 'rated', final_rating = p_rating, decided_at = now(), decision_notes = p_notes
   where id = p_app;

  perform public.log_activity('rated', p_app, v_app.boat_id,
    jsonb_build_object('rating', p_rating, 'configuration', v_conf));
  return v_new;
end $$;

-- Undo an issued rating: the rating is withdrawn, whatever it replaced comes
-- back, and the application goes back to review.
create function public.reopen_application(p_app uuid, p_reason text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare v_app public.applications; r record;
begin
  if not public.is_chair() then raise exception 'Only the rating chair can do this'; end if;
  select * into v_app from public.applications where id = p_app for update;
  if not found then raise exception 'Application not found'; end if;
  if v_app.status <> 'rated' then raise exception 'This application has no rating to undo'; end if;

  for r in select id from public.ratings where application_id = p_app and withdrawn_at is null loop
    update public.ratings set withdrawn_at = null, withdrawn_reason = null, superseded_by = null
     where superseded_by = r.id;
    update public.ratings set withdrawn_at = now(), withdrawn_reason = coalesce(p_reason, 'Rating undone')
     where id = r.id;
  end loop;

  update public.applications
     set status = 'in_review', final_rating = null, decided_at = null,
         review_deadline = greatest(coalesce(review_deadline, current_date), current_date)
   where id = p_app;
  perform public.log_activity('rating_undone', p_app, v_app.boat_id, jsonb_build_object('reason', p_reason));
end $$;

-- An admin changes someone's role. The last admin cannot be removed.
create function public.set_member_role(p_profile uuid, p_role public.user_role)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change roles'; end if;
  if p_role <> 'admin' and (select role from public.profiles where id = p_profile) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'You are the only admin. Make someone else an admin first.';
  end if;
  update public.profiles set role = p_role where id = p_profile;
  perform public.log_activity('role_changed', null, null, jsonb_build_object('profile', p_profile, 'role', p_role));
end $$;

-- A committee member edited a boat record: keep the before/after values.
create function public.log_boat_edit(p_boat uuid, p_changes jsonb)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_committee() then raise exception 'Only the committee can edit boats'; end if;
  perform public.log_activity('boat_edited', null, p_boat, p_changes);
end $$;

-- The public rating list: only what a race committee needs to see.
create function public.public_ratings()
  returns table (boat_id uuid, sail_number text, boat_name text, make text, model text, year int,
                 rating int, configuration text, effective_on date, expires_on date)
  language sql stable security definer set search_path = public as $$
    select b.id, b.sail_number, b.name, b.make, b.model, b.year,
           r.rating, r.configuration, r.effective_on, r.expires_on
      from public.ratings r join public.boats b on b.id = r.boat_id
     where r.withdrawn_at is null
     order by b.sail_number, r.configuration
  $$;

-- Import past applications (for example the 2025+ inventory pulled from
-- email). Each row: owner, boat, application and optionally a rating.
-- Everything created is tagged with the batch so it can be undone.
create function public.import_applications(p_rows jsonb, p_file_name text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  row jsonb;
  v_owner uuid;
  v_boat uuid;
  v_app uuid;
  v_status public.application_status;
  v_rating int;
  v_received timestamptz;
  n int := 0;
begin
  if not public.is_admin() then raise exception 'Only an admin can import'; end if;
  insert into public.import_batches (file_name) values (p_file_name) returning id into v_batch;

  for row in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if coalesce(trim(row ->> 'sail_number'), '') = '' then
      raise exception 'Row %: sail number is required', n;
    end if;

    -- owner (matched by email when there is one)
    v_owner := null;
    if coalesce(row ->> 'owner_email', '') <> '' then
      select id into v_owner from public.owners where lower(email) = lower(row ->> 'owner_email') limit 1;
    end if;
    if v_owner is null and coalesce(row ->> 'owner_name', '') <> '' then
      insert into public.owners (full_name, email, phone, club, import_batch)
      values (row ->> 'owner_name', nullif(row ->> 'owner_email', ''), nullif(row ->> 'owner_phone', ''),
              nullif(row ->> 'club', ''), v_batch)
      returning id into v_owner;
      update public.owners o set profile_id = p.id from public.profiles p
       where o.id = v_owner and o.email is not null and lower(p.email) = lower(o.email);
    end if;

    -- boat (matched by sail number)
    select id into v_boat from public.boats
     where public.normalize_sail(sail_number) = public.normalize_sail(row ->> 'sail_number')
     order by created_at limit 1;
    if v_boat is null then
      insert into public.boats (sail_number, name, make, model, year, loa_ft, home_port, import_batch)
      values (trim(row ->> 'sail_number'), nullif(row ->> 'boat_name', ''), nullif(row ->> 'make', ''),
              nullif(row ->> 'model', ''), nullif(row ->> 'year', '')::int, nullif(row ->> 'loa_ft', '')::numeric,
              nullif(row ->> 'home_port', ''), v_batch)
      returning id into v_boat;
    end if;
    if v_owner is not null then
      insert into public.boat_owners (boat_id, owner_id) values (v_boat, v_owner) on conflict do nothing;
    end if;

    v_status := coalesce(nullif(row ->> 'status', ''), 'received')::public.application_status;
    v_rating := nullif(row ->> 'rating', '')::int;
    v_received := coalesce(nullif(row ->> 'received_on', '')::date::timestamptz, now());

    insert into public.applications (boat_id, owner_id, type, status, received_at, details, owner_notes,
                                     folder_url, final_rating, decided_at, source, import_batch)
    values (v_boat, v_owner, coalesce(nullif(row ->> 'type', ''), 'new')::public.application_type,
            v_status, v_received, coalesce(row -> 'extra', '{}'::jsonb), nullif(row ->> 'notes', ''),
            nullif(row ->> 'folder_url', ''), case when v_status = 'rated' then v_rating end,
            case when v_status = 'rated' then coalesce(nullif(row ->> 'rated_on', '')::date::timestamptz, v_received) end,
            'import', v_batch)
    returning id into v_app;

    if v_status = 'rated' and v_rating is not null then
      update public.ratings set withdrawn_at = now(), withdrawn_reason = 'Replaced by import'
       where boat_id = v_boat and configuration = coalesce(nullif(row ->> 'configuration', ''), 'Spinnaker')
         and withdrawn_at is null;
      insert into public.ratings (boat_id, application_id, rating, configuration, effective_on, expires_on, import_batch)
      values (v_boat, v_app, v_rating, coalesce(nullif(row ->> 'configuration', ''), 'Spinnaker'),
              coalesce(nullif(row ->> 'rated_on', '')::date, v_received::date),
              nullif(row ->> 'expires_on', '')::date, v_batch);
    end if;
  end loop;

  update public.import_batches set row_count = n where id = v_batch;
  perform public.log_activity('imported', null, null, jsonb_build_object('batch', v_batch, 'rows', n, 'file', p_file_name));
  return v_batch;
end $$;

-- Undo an import: removes exactly what that import created.
create function public.undo_import(p_batch uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can undo an import'; end if;
  if exists (select 1 from public.import_batches where id = p_batch and undone_at is not null) then
    raise exception 'This import was already undone';
  end if;
  delete from public.ratings where import_batch = p_batch;
  -- ratings an import replaced come back
  update public.ratings set withdrawn_at = null, withdrawn_reason = null
   where withdrawn_reason = 'Replaced by import'
     and not exists (select 1 from public.ratings r2
                     where r2.boat_id = ratings.boat_id and r2.configuration = ratings.configuration
                       and r2.withdrawn_at is null);
  delete from public.applications where import_batch = p_batch;
  delete from public.boats b where b.import_batch = p_batch
     and not exists (select 1 from public.applications a where a.boat_id = b.id)
     and not exists (select 1 from public.ratings r where r.boat_id = b.id);
  delete from public.owners o where o.import_batch = p_batch
     and not exists (select 1 from public.applications a where a.owner_id = o.id);
  update public.import_batches set undone_at = now() where id = p_batch;
  perform public.log_activity('import_undone', null, null, jsonb_build_object('batch', p_batch));
end $$;

-- ---------------------------------------------------------------------------
-- Access rules (row level security)
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.settings       enable row level security;
alter table public.import_batches enable row level security;
alter table public.owners         enable row level security;
alter table public.boats          enable row level security;
alter table public.boat_owners    enable row level security;
alter table public.applications   enable row level security;
alter table public.attachments    enable row level security;
alter table public.votes          enable row level security;
alter table public.comments       enable row level security;
alter table public.ratings        enable row level security;
alter table public.activity       enable row level security;

-- profiles: you see yourself; the committee sees everyone.
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_committee());
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- People may edit their own name and phone, never their role.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone) on public.profiles to authenticated;

create policy "settings read" on public.settings for select using (true);
create policy "settings admin" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "imports admin" on public.import_batches for select to authenticated using (public.is_admin());

create policy "owners read" on public.owners for select to authenticated
  using (public.is_committee() or profile_id = auth.uid());
create policy "owners write" on public.owners for insert to authenticated with check (public.is_committee());
create policy "owners update" on public.owners for update to authenticated
  using (public.is_committee()) with check (public.is_committee());

create policy "boats read" on public.boats for select to authenticated
  using (public.is_committee() or public.owns_boat(id));
create policy "boats insert" on public.boats for insert to authenticated with check (public.is_committee());
create policy "boats update" on public.boats for update to authenticated
  using (public.is_committee()) with check (public.is_committee());

create policy "boat_owners read" on public.boat_owners for select to authenticated
  using (public.is_committee() or public.owns_boat(boat_id));
create policy "boat_owners write" on public.boat_owners for all to authenticated
  using (public.is_committee()) with check (public.is_committee());

create policy "applications read" on public.applications for select to authenticated
  using (public.is_committee() or public.owns_application(id));
-- Applications are created through submit_application and changed through
-- the chair's actions; the chair may also edit notes and the folder link.
create policy "applications chair update" on public.applications for update to authenticated
  using (public.is_chair()) with check (public.is_chair());
revoke update on public.applications from authenticated, anon;
grant update (decision_notes, folder_url, review_deadline) on public.applications to authenticated;

create policy "attachments read" on public.attachments for select to authenticated
  using ((hidden_at is null and public.owns_application(application_id)) or public.is_committee());
create policy "attachments add" on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and (public.is_committee() or public.owns_application(application_id)));
create policy "attachments hide" on public.attachments for update to authenticated
  using (public.is_committee() or uploaded_by = auth.uid())
  with check (public.is_committee() or uploaded_by = auth.uid());
revoke update on public.attachments from authenticated, anon;
grant update (hidden_at, kind) on public.attachments to authenticated;

-- Draft votes are visible to the committee only.
create policy "votes read" on public.votes for select to authenticated using (public.is_committee());
create policy "votes add" on public.votes for insert to authenticated
  with check (member_id = auth.uid() and public.is_committee());
create policy "votes change" on public.votes for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid() and public.is_committee());
create policy "votes remove" on public.votes for delete to authenticated using (member_id = auth.uid());

create policy "comments read" on public.comments for select to authenticated using (public.is_committee());
create policy "comments add" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_committee());
create policy "comments hide" on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_chair()) with check (author_id = auth.uid() or public.is_chair());
revoke update on public.comments from authenticated, anon;
grant update (hidden_at) on public.comments to authenticated;

create policy "ratings read" on public.ratings for select to authenticated
  using (public.is_committee() or public.owns_boat(boat_id));

create policy "activity read" on public.activity for select to authenticated
  using (public.is_committee() or (application_id is not null and public.owns_application(application_id)
         and action in ('submitted', 'status_changed', 'rated', 'rating_undone')));

-- Functions: signed-in users may call the actions (each checks the role
-- itself); anyone may read the public rating list.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.public_ratings() to anon;
grant execute on function public.normalize_sail(text) to anon;
-- The raw activity logger is only used inside other functions.
revoke execute on function public.log_activity(text, uuid, uuid, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- File storage: one private bucket; files live under <application id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)  -- 25 MB per file
on conflict (id) do nothing;

create policy "attachments upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (public.is_committee()
         or public.owns_application(nullif((storage.foldername(name))[1], '')::uuid))
  );
create policy "attachments download" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (public.is_committee()
         or public.owns_application(nullif((storage.foldername(name))[1], '')::uuid))
  );
