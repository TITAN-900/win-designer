-- Run once in the SQL editor of your own Supabase project. No passwords here.
begin;
create table public.portfolio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  singleton boolean not null default true unique check(singleton)
);
alter table public.portfolio_admins enable row level security;
revoke all on public.portfolio_admins from anon, authenticated;
create function public.portfolio_is_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.portfolio_admins where user_id = auth.uid())
 and exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id') $$;
revoke all on function public.portfolio_is_admin() from public;
grant execute on function public.portfolio_is_admin() to anon, authenticated;

create table public.portfolio_projects (
 id uuid primary key,
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
 legacy_slug text check(legacy_slug is null or legacy_slug = 'bungalow-bukit-taman-segar'),
 name text not null check(length(trim(name)) between 1 and 160),
 description text not null default '' check(length(description)<=4000),
 external_link text not null default '' check(external_link = '' or (external_link ~ '^https?://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' and external_link !~ '^https?://[^/]*@')),
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED')),
 photos jsonb not null default '[]' check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=50),
 cover_id uuid,
 created_at timestamptz not null default now()
);
create table public.portfolio_legacy_links (slug text primary key);
alter table public.portfolio_projects enable row level security;
alter table public.portfolio_legacy_links enable row level security;
revoke all on public.portfolio_projects, public.portfolio_legacy_links from anon, authenticated;
grant select on public.portfolio_projects, public.portfolio_legacy_links to anon, authenticated;
grant insert,update,delete on public.portfolio_projects to authenticated;
create policy projects_read on public.portfolio_projects for select using(status='PUBLISHED' or public.portfolio_is_admin());
create policy projects_create on public.portfolio_projects for insert to authenticated with check(public.portfolio_is_admin());
create policy projects_update on public.portfolio_projects for update to authenticated using(public.portfolio_is_admin()) with check(public.portfolio_is_admin());
create policy projects_delete on public.portfolio_projects for delete to authenticated using(public.portfolio_is_admin());
create policy legacy_read on public.portfolio_legacy_links for select using(true);

create function public.portfolio_validate() returns trigger language plpgsql set search_path='' as $$
declare photo jsonb; ids text[] := '{}';
begin
 if new.legacy_slug is not null and new.slug <> new.legacy_slug then raise exception 'Legacy slug mismatch'; end if;
 for photo in select value from jsonb_array_elements(new.photos) loop
   if jsonb_typeof(photo) is distinct from 'object' or coalesce(photo->>'id','') !~ '^[a-f0-9-]{36}$'
     or (photo->>'id') = any(ids) then raise exception 'Invalid or duplicate photo'; end if;
   ids := array_append(ids,photo->>'id');
   if coalesce((photo->>'width')::int,0) not between 1 and 12000 or coalesce((photo->>'height')::int,0) not between 1 and 12000 then raise exception 'Invalid dimensions'; end if;
   if photo ? 'path' then
     if photo ? 'src' or (photo->>'path') is distinct from (new.id::text || '/' || (photo->>'id') || '.jpg') then raise exception 'Invalid storage path'; end if;
   elsif new.legacy_slug is null or coalesce(photo->>'src','') !~ '^/?images/bungalow-bukit-taman-segar/bungalow-[0-9]{2}\.jpeg$' then
     raise exception 'Invalid legacy photo';
   end if;
 end loop;
 if new.status='PUBLISHED' and (cardinality(ids)=0 or new.cover_id is null or not(new.cover_id::text=any(ids))) then raise exception 'Published projects require photos and a cover'; end if;
 return new;
end $$;
create trigger validate_portfolio before insert or update on public.portfolio_projects for each row execute function public.portfolio_validate();
create function public.portfolio_link_legacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.legacy_slug is not null then insert into public.portfolio_legacy_links(slug) values(new.legacy_slug) on conflict do nothing; end if;
 return new;
end $$;
create trigger link_legacy after insert or update on public.portfolio_projects for each row execute function public.portfolio_link_legacy();
revoke all on function public.portfolio_validate(), public.portfolio_link_legacy() from public;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio','portfolio',false,8388608,array['image/jpeg']);
create policy portfolio_media_read on storage.objects for select to anon, authenticated using (
 bucket_id='portfolio' and (public.portfolio_is_admin() or exists (
 select 1 from public.portfolio_projects p where p.status='PUBLISHED'
 and p.photos @> jsonb_build_array(jsonb_build_object('path',storage.objects.name))
 ))
);
create policy portfolio_media_insert on storage.objects for insert to authenticated with check (
 bucket_id='portfolio' and public.portfolio_is_admin() and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'
);
create policy portfolio_media_update on storage.objects for update to authenticated
 using(bucket_id='portfolio' and public.portfolio_is_admin())
 with check(bucket_id='portfolio' and public.portfolio_is_admin() and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$');
create policy portfolio_media_delete on storage.objects for delete to authenticated using(bucket_id='portfolio' and public.portfolio_is_admin());
commit;
