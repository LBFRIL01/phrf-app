-- Boats may be recorded before their sail number is known (for example
-- applications found in the email archive). Such boats show "sail # needed"
-- until an owner or the committee fills it in.

alter table public.boats alter column sail_number drop not null;

-- When an owner applies with a sail number, a boat of theirs with the same
-- name and no sail number yet is reused and gets the number.
create or replace function public.submit_application(p jsonb)
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
  -- A boat of theirs with the same name but no sail number yet (for example
  -- from an import) is the same boat: fill in its sail number.
  if v_boat is null and coalesce(trim(b ->> 'name'), '') <> '' then
    select bt.id into v_boat from public.boats bt
     join public.boat_owners bo on bo.boat_id = bt.id
     where coalesce(bt.sail_number, '') = '' and bo.owner_id = v_owner
       and lower(trim(bt.name)) = lower(trim(b ->> 'name'))
     order by bt.created_at limit 1;
    if v_boat is not null then
      update public.boats set sail_number = v_sail where boats.id = v_boat;
      perform public.log_activity('boat_edited', null, v_boat,
        jsonb_build_object('sail_number', jsonb_build_object('from', null, 'to', v_sail)));
    end if;
  end if;
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

-- Imports accept rows with no sail number as long as they have a boat name.
create or replace function public.import_applications(p_rows jsonb, p_file_name text default null)
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
    if coalesce(trim(row ->> 'sail_number'), '') = '' and coalesce(trim(row ->> 'boat_name'), '') = '' then
      raise exception 'Row %: needs a sail number or a boat name', n;
    end if;

    -- owner (matched by email when there is one)
    v_owner := null;
    if coalesce(row ->> 'owner_email', '') <> '' then
      select id into v_owner from public.owners where lower(email) = lower(row ->> 'owner_email') limit 1;
    end if;
    -- without an email, an owner with the same name and no email is the same person
    if v_owner is null and coalesce(row ->> 'owner_email', '') = '' and coalesce(row ->> 'owner_name', '') <> '' then
      select id into v_owner from public.owners
       where coalesce(email, '') = '' and lower(trim(full_name)) = lower(trim(row ->> 'owner_name'))
       order by created_at limit 1;
    end if;
    if v_owner is null and coalesce(row ->> 'owner_name', '') <> '' then
      insert into public.owners (full_name, email, phone, club, import_batch)
      values (row ->> 'owner_name', nullif(row ->> 'owner_email', ''), nullif(row ->> 'owner_phone', ''),
              nullif(row ->> 'club', ''), v_batch)
      returning id into v_owner;
      update public.owners o set profile_id = p.id from public.profiles p
       where o.id = v_owner and o.email is not null and lower(p.email) = lower(o.email);
    end if;

    -- boat: matched by sail number, or, when there is none, by boat name
    -- among this owner's boats that also have no sail number yet
    v_boat := null;
    if coalesce(trim(row ->> 'sail_number'), '') <> '' then
      select id into v_boat from public.boats
       where public.normalize_sail(sail_number) = public.normalize_sail(row ->> 'sail_number')
       order by created_at limit 1;
    else
      select bt.id into v_boat from public.boats bt
       where coalesce(bt.sail_number, '') = ''
         and lower(trim(bt.name)) = lower(trim(row ->> 'boat_name'))
         and (v_owner is null or exists (select 1 from public.boat_owners bo where bo.boat_id = bt.id and bo.owner_id = v_owner))
       order by bt.created_at limit 1;
    end if;
    if v_boat is null then
      insert into public.boats (sail_number, name, make, model, year, loa_ft, home_port, import_batch)
      values (nullif(trim(row ->> 'sail_number'), ''), nullif(row ->> 'boat_name', ''), nullif(row ->> 'make', ''),
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

-- Keep the same permissions as before for the replaced functions.
revoke execute on function public.submit_application(jsonb) from public, anon;
revoke execute on function public.import_applications(jsonb, text) from public, anon;
grant execute on function public.submit_application(jsonb) to authenticated;
grant execute on function public.import_applications(jsonb, text) to authenticated;
