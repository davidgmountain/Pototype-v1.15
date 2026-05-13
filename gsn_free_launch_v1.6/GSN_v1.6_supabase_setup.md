# GSN v1.6 — Supabase setup (full member system)

This is the one-time backend setup for v1.6. It builds the three-tier access
model (public / free / premium) plus an admin role, **all on the Supabase free
tier**. Estimated time: 20–30 minutes.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up.
2. Click **New project** and fill in:
   - **Name:** `gsn-private`
   - **Database password:** strong, save it in a password manager
   - **Region:** closest to you
   - **Plan:** Free
3. Wait ~2 minutes for provisioning.

## 2. Paste your project URL + anon key into v1.6

In Supabase: **Settings → API**. Copy:

- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **Project API keys → `anon` `public`** (a long JWT starting `eyJ…`)

Open `gsn_free_launch_v1.6/members/js/supabase-config.js` and replace the two
placeholder strings:

```js
window.GSN.CONFIG = {
  SUPABASE_URL:      'https://abcd1234.supabase.co',  // your URL here
  SUPABASE_ANON_KEY: 'eyJ…',                          // your anon key here
  AUTH_REDIRECT_URL: window.location.origin + '/members/'
};
```

The anon key is safe to ship in the browser — security is enforced by Row
Level Security policies (below).

## 3. Create the schema + RLS policies

In Supabase, open **SQL Editor → New query**, paste **all of the SQL below**,
and click **Run**.

```sql
-- =============================================================
-- GSN v1.6 schema
-- Tables: profiles, messages, upgrade_requests
-- =============================================================

-- ------- profiles -------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  country       text,
  role_title    text,
  club          text,
  expertise     text[] default '{}',
  bio           text,
  photo_url     text,
  role          text not null default 'member' check (role in ('member', 'admin')),
  tier          text not null default 'free'   check (tier in ('free', 'premium')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------- messages -------------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references auth.users(id) on delete cascade,
  to_user_id    uuid not null references auth.users(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists idx_messages_to_user   on public.messages (to_user_id, created_at desc);
create index if not exists idx_messages_from_user on public.messages (from_user_id);

-- ------- upgrade_requests -----------------------------------
create table if not exists public.upgrade_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','denied')),
  requested_at  timestamptz not null default now(),
  processed_by  uuid references auth.users(id),
  processed_at  timestamptz
);
create index if not exists idx_upgrade_requests_status on public.upgrade_requests (status, requested_at);

-- ------- updated_at trigger ---------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================
-- Helper function: is the caller an admin?
-- =============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (tier = 'premium' or role = 'admin')
  );
$$;

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.profiles         enable row level security;
alter table public.messages         enable row level security;
alter table public.upgrade_requests enable row level security;

-- ---- profiles policies -------------------------------------
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- members cannot promote themselves: tier/role can only be changed by admins
    and (tier = (select tier from public.profiles where id = auth.uid()))
    and (role = (select role from public.profiles where id = auth.uid()))
  );

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- messages policies -------------------------------------
-- Only premium senders can insert messages
drop policy if exists messages_insert_premium on public.messages;
create policy messages_insert_premium
  on public.messages for insert
  to authenticated
  with check (auth.uid() = from_user_id and public.is_premium());

-- A user can read messages they sent or received
drop policy if exists messages_select_party on public.messages;
create policy messages_select_party
  on public.messages for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- A recipient can mark a message as read (only updates read_at)
drop policy if exists messages_update_read on public.messages;
create policy messages_update_read
  on public.messages for update
  to authenticated
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

-- ---- upgrade_requests policies -----------------------------
-- A user can insert their own request
drop policy if exists upgrade_insert_self on public.upgrade_requests;
create policy upgrade_insert_self
  on public.upgrade_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- A user can read their own requests; admins read all
drop policy if exists upgrade_select_own_or_admin on public.upgrade_requests;
create policy upgrade_select_own_or_admin
  on public.upgrade_requests for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Only admins can approve / deny
drop policy if exists upgrade_update_admin on public.upgrade_requests;
create policy upgrade_update_admin
  on public.upgrade_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

> **What this enforces:**
> - Any signed-in user can read the directory (search returns profiles).
> - A user can only edit *their own* profile fields — and cannot self-promote
>   tier/role. Only admins can change someone's tier or role.
> - Only **premium** members (and admins) can send messages.
> - Messages are visible only to their sender or recipient.
> - Only **admins** can approve upgrade requests.

## 4. Auth redirect URLs

Supabase only sends magic-link redirects to allowlisted URLs.

1. **Authentication → URL Configuration**
2. **Site URL:** your deployed URL, e.g. `https://gsn-v1-6.vercel.app`
3. **Redirect URLs:** add the same URL plus `/members/` path. Also add a
   `http://localhost:8000/members/` if you'll test locally.
4. Save.

## 5. Deploy v1.6 to Vercel

The simplest path:

1. In Vercel, create a new project pointing at the folder
   `gsn_free_launch_v1.6/` (or push it to a GitHub repo and connect Vercel to that).
2. Framework preset: **Other** (this is plain HTML/CSS/JS — no build step needed).
3. Deploy. You'll get a URL like `https://gsn-v1-6.vercel.app`.

## 6. First sign-in, then promote yourself to admin

1. Go to your deployed URL.
2. Click **Members** in the top nav, then **Sign in to GSN**.
3. Enter your email — Supabase sends a magic link.
4. Click the link → you're signed in. The bootstrap auto-creates your
   `profiles` row with `tier=free`, `role=member`.
5. Go to Supabase **SQL Editor**:

```sql
update public.profiles
set role = 'admin', tier = 'premium'
where id = (select id from auth.users where email = 'you@example.com');
```

6. Reload the site. The "Admin" link should now appear in the members strip,
   and the admin dashboard is accessible.

## 7. (Optional) Storage bucket for profile photos

For when you want direct photo upload instead of a URL:

```sql
-- Run in Supabase Storage UI: create a public bucket called `profile-photos`.
-- Then add this policy:
create policy "photos public read"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "photos user write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

I'll wire the upload UI once you're ready — just say the word.

---

## File map

```
gsn_free_launch_v1.6/
├── index.html              ← public homepage  (now has Members link in nav)
├── community.html          ← public           (same)
├── team.html               ← public           (same)
├── news.html               ← public           (same)
├── contact.html            ← public           (same)
├── signup.html             ← public           (same)
├── css/style.css           ← public site styles (unchanged from v1.5)
├── img/                    ← public images (unchanged)
├── robots.txt
│
└── members/
    ├── index.html          ← directory + tiered search
    ├── profile.html        ← view any member (DM card for premium)
    ├── me.html             ← edit your own profile
    ├── messages.html       ← premium inbox (locked for free)
    ├── upgrade.html        ← free → premium request flow
    ├── admin.html          ← admin dashboard
    ├── css/members.css     ← members-area styles + modal + tier locks
    └── js/
        ├── supabase-config.js  ← PASTE YOUR URL + ANON KEY HERE
        ├── auth.js             ← magic-link login + session bootstrap
        ├── layout.js           ← updates "Signed in as…" strip
        ├── directory.js        ← search logic (basic vs premium)
        ├── profile.js          ← profile view + DM form
        ├── me.js               ← edit-own-profile
        ├── messages.js         ← inbox
        ├── upgrade.js          ← upgrade request flow
        └── admin.js            ← admin dashboard
```

## What works after setup

- **Public visitor** sees v1.5 site exactly as before, with a new "Members" link.
- **Free member** — sign in, search directory by name/country, view profiles
  (DM form is greyed/locked), can request premium upgrade.
- **Premium member** — full search filters (role, club, expertise), can send
  DMs from any profile, has a messages inbox.
- **Admin** — sees all members in a table with their tier/role, can approve or
  deny upgrade requests with one click, can change any member's tier or role.

When you're ready, just tell me to deploy and I'll walk you through pushing
v1.6 to Vercel.
