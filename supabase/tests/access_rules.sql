-- Exercises the main flows and access rules. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create or replace function pg_temp.expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm not ilike '%' || msg || '%' then raise exception 'Expected error "%" but got "%"', msg, sqlerrm; end if;
    return;
  end;
  raise exception 'Expected error "%" but statement succeeded: %', msg, sql;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- people: the first sign-in becomes admin, the rest are owners
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'brooke@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'member@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@example.com');
do $$ begin
  assert (select role from profiles where email = 'brooke@example.com') = 'admin', 'first user is admin';
  assert (select role from profiles where email = 'owner@example.com') = 'owner', 'later users are owners';
end $$;

set role authenticated;

-- admin makes a committee member; cannot demote themselves while sole admin
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select set_member_role('00000000-0000-0000-0000-00000000000b', 'committee');
select pg_temp.expect_error($$select set_member_role('00000000-0000-0000-0000-00000000000a', 'owner')$$, 'only admin');

-- an owner cannot promote themselves
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select set_member_role('00000000-0000-0000-0000-00000000000c', 'admin')$$, 'Only an admin');
select pg_temp.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'permission denied');

-- owner submits an application
select * from submit_application('{"type":"new","owner":{"full_name":"Olive Owner","phone":"555"},
  "boat":{"sail_number":"USA 1234","name":"Windward","make":"J/Boats","model":"J/105","year":"1995"},
  "sails":{"spinnaker":"asymmetric"}}'::jsonb);
do $$ begin
  assert (select count(*) from applications) = 1, 'owner sees own application';
  assert (select count(*) from boats) = 1, 'owner sees own boat';
  assert (select details->'sails'->>'spinnaker' from applications) = 'asymmetric', 'details kept';
end $$;
-- owner cannot vote, read votes, or change status
select pg_temp.expect_error($$insert into votes (application_id, proposed_rating) select id, 90 from applications$$, 'Voting is closed');
select pg_temp.expect_error($$select set_application_status((select id from applications), 'in_review')$$, 'Only the rating chair');

-- a stranger sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from applications) = 0, 'stranger sees no applications';
  assert (select count(*) from boats) = 0, 'stranger sees no boats';
end $$;

-- same sail number written differently reuses the boat
select * from submit_application('{"type":"renewal","owner":{"full_name":"Stan"},"boat":{"sail_number":"usa-1234"}}'::jsonb);
reset role;
do $$ begin assert (select count(*) from boats) = 1, 'sail number matched'; end $$;
set role authenticated;

-- votes only once the chair opens review
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$insert into votes (application_id, proposed_rating) select id, 90 from applications where number like '%0001'$$, 'Voting is closed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select set_application_status((select id from applications where number like '%0001'), 'in_review');
do $$ begin assert (select review_deadline from applications where number like '%0001') = current_date + 7, 'default window'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into votes (application_id, proposed_rating, adjustments) select id, 90, '-6 asym' from applications where number like '%0001';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$insert into votes (application_id, proposed_rating) select id, 90 from applications where number like '%0001'$$, 'row-level security');
do $$ begin assert (select count(*) from votes) = 0, 'owner cannot read votes'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update votes set proposed_rating = 87;
insert into comments (application_id, body) select id, 'Looks like a standard J/105' from applications where number like '%0001';
-- a committee member is not the chair
select pg_temp.expect_error($$select finalize_application((select id from applications where number like '%0001'), 87)$$, 'Only the rating chair');

-- chair issues a rating; public list shows it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select finalize_application((select id from applications where number like '%0001'), 87, 'Spinnaker', '-6 asym');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$update votes set proposed_rating = 80$$, 'Voting is closed');
reset role; set role anon;
do $$ begin
  assert (select count(*) from public_ratings()) = 1, 'public list';
  assert (select rating from public_ratings()) = 87, 'public rating value';
end $$;
do $$ begin
  assert (select count(*) from ratings) = 0, 'anon cannot read ratings table';
  assert (select count(*) from applications) = 0, 'anon cannot read applications';
  assert (select count(*) from owners) = 0, 'anon cannot read owners';
end $$;
reset role; set role authenticated;

-- second application re-rates; the first is replaced, then undo brings it back
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select set_application_status((select id from applications where number like '%0002'), 'in_review');
select finalize_application((select id from applications where number like '%0002'), 84);
do $$ begin
  assert (select count(*) from public_ratings()) = 1 and (select rating from public_ratings()) = 84, 're-rated';
end $$;
select reopen_application((select id from applications where number like '%0002'), 'Wrong number');
do $$ begin
  assert (select rating from public_ratings()) = 87, 'undo restores previous rating';
  assert (select status from applications where number like '%0002') = 'in_review', 'back to review';
end $$;

-- import, then undo the import
select import_applications('[
  {"sail_number":"USA 1234","owner_name":"Olive Owner","owner_email":"owner@example.com","status":"rated","rating":"81","received_on":"2025-03-01"},
  {"sail_number":"42","boat_name":"Old Salt","make":"Catalina","model":"30","owner_name":"New Person","owner_email":"new@example.com","status":"received","folder_url":"https://drive.google.com/x"}
]'::jsonb, 'inventory.csv');
do $$ begin
  assert (select count(*) from boats) = 2, 'import adds new boat only';
  assert (select rating from public_ratings() where sail_number = 'USA 1234') = 81, 'import rating replaces';
end $$;
select undo_import((select id from import_batches limit 1));
do $$ begin
  assert (select count(*) from boats) = 1, 'undo removes imported boat';
  assert (select rating from public_ratings() where sail_number = 'USA 1234') = 87, 'undo restores rating';
  assert (select count(*) from applications) = 2, 'undo removes imported applications';
end $$;
-- non-admin cannot import
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select import_applications('[]'::jsonb)$$, 'Only an admin');

-- storage: owner may upload to own application folder, not others
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into storage.objects (bucket_id, name) select 'attachments', id || '/photo.jpg' from applications where number like '%0001';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) select 'attachments', '00000000-0000-0000-0000-000000000001/x.jpg'$$, 'row-level security');

-- activity can't be forged; boat edits are committee-only
select pg_temp.expect_error($$select log_activity('rated', null, null)$$, 'permission denied');
select pg_temp.expect_error($$select log_boat_edit((select id from boats limit 1), '{}')$$, 'Only the committee');

reset role;
do $$ begin raise notice 'ALL DATABASE CHECKS PASSED'; end $$;
