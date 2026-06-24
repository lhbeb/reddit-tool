-- Reddit Assignment Desk Supabase setup
-- Paste this whole file into the Supabase SQL editor and run it once.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_status'
  ) then
    create type public.task_status as enum ('queued', 'working', 'done');
  end if;
end $$;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_admin boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reddit_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  post_body text not null,
  subreddit_url text,
  published_url text,
  assignee_id uuid references public.team_members(id) on delete set null,
  status public.task_status not null default 'queued',
  created_by_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reddit_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.reddit_posts(id) on delete cascade,
  parent_id uuid references public.reddit_comments(id) on delete cascade,
  body text not null,
  assignee_id uuid references public.team_members(id) on delete set null,
  status public.task_status not null default 'queued',
  created_by_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_members_slug_idx on public.team_members(slug);
create index if not exists reddit_posts_assignee_id_idx on public.reddit_posts(assignee_id);
create index if not exists reddit_posts_status_idx on public.reddit_posts(status);
create index if not exists reddit_posts_created_at_idx on public.reddit_posts(created_at desc);
create index if not exists reddit_comments_post_id_idx on public.reddit_comments(post_id);
create index if not exists reddit_comments_parent_id_idx on public.reddit_comments(parent_id);
create index if not exists reddit_comments_assignee_id_idx on public.reddit_comments(assignee_id);
create index if not exists reddit_comments_status_idx on public.reddit_comments(status);

alter table public.reddit_posts
add column if not exists published_url text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

drop trigger if exists set_reddit_posts_updated_at on public.reddit_posts;
create trigger set_reddit_posts_updated_at
before update on public.reddit_posts
for each row execute function public.set_updated_at();

drop trigger if exists set_reddit_comments_updated_at on public.reddit_comments;
create trigger set_reddit_comments_updated_at
before update on public.reddit_comments
for each row execute function public.set_updated_at();

insert into public.team_members (slug, display_name, is_admin, sort_order)
values
  ('mehdi', 'Mehdi Admin', true, 1),
  ('jebbar', 'Jebbar', false, 2),
  ('walid', 'Walid', false, 3),
  ('janah', 'Janah', false, 4),
  ('yassine', 'Yassine', false, 5),
  ('amine', 'Amine', false, 6),
  ('abdo', 'Abdo', false, 7),
  ('othman', 'Othman', false, 8)
on conflict (slug) do update
set
  display_name = excluded.display_name,
  is_admin = excluded.is_admin,
  sort_order = excluded.sort_order;

alter table public.team_members enable row level security;
alter table public.reddit_posts enable row level security;
alter table public.reddit_comments enable row level security;

-- MVP policies for the current hardcoded-login app.
-- These are intentionally permissive so the app can work before Supabase Auth.
-- Tighten these once real Supabase Auth is added.
drop policy if exists "mvp read team members" on public.team_members;
create policy "mvp read team members"
on public.team_members for select
using (true);

drop policy if exists "mvp update team members" on public.team_members;
create policy "mvp update team members"
on public.team_members for update
using (true)
with check (true);

drop policy if exists "mvp read reddit posts" on public.reddit_posts;
create policy "mvp read reddit posts"
on public.reddit_posts for select
using (true);

drop policy if exists "mvp insert reddit posts" on public.reddit_posts;
create policy "mvp insert reddit posts"
on public.reddit_posts for insert
with check (true);

drop policy if exists "mvp update reddit posts" on public.reddit_posts;
create policy "mvp update reddit posts"
on public.reddit_posts for update
using (true)
with check (true);

drop policy if exists "mvp delete reddit posts" on public.reddit_posts;
create policy "mvp delete reddit posts"
on public.reddit_posts for delete
using (true);

drop policy if exists "mvp read reddit comments" on public.reddit_comments;
create policy "mvp read reddit comments"
on public.reddit_comments for select
using (true);

drop policy if exists "mvp insert reddit comments" on public.reddit_comments;
create policy "mvp insert reddit comments"
on public.reddit_comments for insert
with check (true);

drop policy if exists "mvp update reddit comments" on public.reddit_comments;
create policy "mvp update reddit comments"
on public.reddit_comments for update
using (true)
with check (true);

drop policy if exists "mvp delete reddit comments" on public.reddit_comments;
create policy "mvp delete reddit comments"
on public.reddit_comments for delete
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'reddit-assets',
    'reddit-assets',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'assignment-exports',
    'assignment-exports',
    false,
    10485760,
    array['application/json', 'text/csv', 'text/plain']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mvp public read reddit assets" on storage.objects;
create policy "mvp public read reddit assets"
on storage.objects for select
using (bucket_id = 'reddit-assets');

drop policy if exists "mvp upload reddit assets" on storage.objects;
create policy "mvp upload reddit assets"
on storage.objects for insert
with check (bucket_id = 'reddit-assets');

drop policy if exists "mvp read assignment exports" on storage.objects;
create policy "mvp read assignment exports"
on storage.objects for select
using (bucket_id = 'assignment-exports');

drop policy if exists "mvp upload assignment exports" on storage.objects;
create policy "mvp upload assignment exports"
on storage.objects for insert
with check (bucket_id = 'assignment-exports');

create or replace function public.reddit_assignment_health()
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  select jsonb_build_object(
    'tables', jsonb_build_object(
      'team_members', to_regclass('public.team_members') is not null,
      'reddit_posts', to_regclass('public.reddit_posts') is not null,
      'reddit_comments', to_regclass('public.reddit_comments') is not null
    ),
    'team_members_count', (select count(*) from public.team_members),
    'buckets', jsonb_build_object(
      'reddit_assets', exists(select 1 from storage.buckets where id = 'reddit-assets'),
      'assignment_exports', exists(select 1 from storage.buckets where id = 'assignment-exports')
    ),
    'checked_at', now()
  );
$$;

grant execute on function public.reddit_assignment_health() to anon, authenticated, service_role;
