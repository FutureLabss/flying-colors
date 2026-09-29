-- Flying Colours — core schema.
-- Money is stored in minor units (kobo / cents). Times are timestamptz; the
-- school runs on West Africa Time (Africa/Lagos) and the UI formats in WAT.

create extension if not exists pgcrypto with schema extensions;

-- ─── enums ──────────────────────────────────────────────────────────────────
create type public.app_role as enum ('owner', 'lead_tutor', 'customer_service', 'tutor', 'parent', 'learner');
create type public.learner_level as enum ('starter', 'beginner', 'intermediate', 'advanced');
create type public.learner_status as enum ('awaiting_payment', 'awaiting_placement', 'active', 'exited');
create type public.sub_status as enum ('pending', 'active', 'grace', 'expired', 'exited');
create type public.renewal_outcome as enum ('renewed', 'grace', 'exit');
create type public.pay_method as enum ('card', 'transfer');
create type public.pay_status as enum ('initiated', 'pending_review', 'approved', 'rejected', 'auto_verified', 'reversed');
create type public.bank_alert as enum ('matched', 'not_found', 'amount_differs');
create type public.att_status as enum ('present', 'late', 'absent');
create type public.resp_type as enum ('video', 'audio', 'photo', 'text');
create type public.ann_audience as enum ('class', 'all_learners', 'all_parents');
create type public.msg_channel as enum ('whatsapp', 'email', 'sms');
create type public.msg_status as enum ('queued', 'sent', 'failed');

-- ─── people ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'parent',
  full_name text not null default '',
  -- How the person is addressed in the product: "Ms Adaeze", "Mrs F. Adeyemi".
  display_name text not null default '',
  phone text,
  email text,
  country text default 'Nigeria',
  consent_data boolean not null default false,
  consent_recordings boolean not null default false,
  consent_at timestamptz,
  two_factor boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.profiles (role);
create index on public.profiles (phone);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  age_min int not null,
  age_max int not null,
  level public.learner_level not null,
  capacity int not null check (capacity > 0),
  tutor_id uuid references public.profiles (id),
  zoom_url text,
  live_schedule text not null default 'Sat & Sun · 5:00–6:00 pm WAT',
  task_schedule text not null default 'Mon & Wed release · Tue & Fri corrections',
  next_cohort_start date,
  -- Label used by the legacy WhatsApp groups, for the one-time import.
  legacy_group_key text,
  created_at timestamptz not null default now()
);

create sequence public.learner_code_seq start 400;

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('FC-' || lpad(nextval('public.learner_code_seq')::text, 4, '0')),
  user_id uuid unique references auth.users (id) on delete set null,
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  age int check (age between 3 and 18),
  level public.learner_level not null default 'beginner',
  goals text not null default '',
  prior_cohort boolean not null default false,
  status public.learner_status not null default 'awaiting_payment',
  class_id uuid references public.classes (id),
  placed_at timestamptz,
  pin_hash text,
  pin_set boolean generated always as (pin_hash is not null) stored,
  consent_data boolean not null default false,
  consent_recordings boolean not null default false,
  consent_showcase boolean not null default false,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.learners (guardian_id);
create index on public.learners (class_id);
create index on public.learners (status);

create table public.class_moves (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  from_class_id uuid references public.classes (id),
  to_class_id uuid not null references public.classes (id),
  reason text not null,
  moved_by uuid references public.profiles (id),
  moved_at timestamptz not null default now()
);
create index on public.class_moves (learner_id);

create table public.waitlist (
  learner_id uuid not null references public.learners (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  added_by uuid references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (learner_id, class_id)
);

-- ─── money ──────────────────────────────────────────────────────────────────
create table public.plans (
  id text primary key,
  name text not null,
  price_label text not null,
  description text not null,
  due_today_minor bigint not null,
  total_minor bigint not null,
  currency text not null default 'NGN',
  instalments int not null default 1,
  sort int not null default 0
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  plan_id text not null references public.plans (id),
  starts_on date,
  ends_on date,
  status public.sub_status not null default 'pending',
  balance_minor bigint not null default 0,
  currency text not null default 'NGN',
  instalments_paid int not null default 0,
  next_instalment_due date,
  grace_until date,
  followup_outcome public.renewal_outcome,
  -- Snapshot taken before a follow-up outcome, so "Undo" can restore it.
  followup_prev jsonb,
  created_at timestamptz not null default now()
);
create index on public.subscriptions (learner_id);
create index on public.subscriptions (ends_on);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  guardian_id uuid not null references public.profiles (id),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  description text not null,
  amount_minor bigint not null,
  currency text not null default 'NGN',
  method public.pay_method not null,
  provider text not null,
  provider_ref text,
  reference text not null unique,
  bank text,
  receipt_path text,
  bank_alert public.bank_alert,
  bank_alert_amount_minor bigint,
  status public.pay_status not null default 'initiated',
  sent_at timestamptz,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments (status);
create index on public.payments (guardian_id);

create table public.renewal_reminders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  kind text not null check (kind in ('7d', '3d', 'expiry', 'instalment', 'call')),
  sent_at timestamptz not null default now()
);
create index on public.renewal_reminders (subscription_id);

-- ─── teaching ───────────────────────────────────────────────────────────────
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recording_url text,
  recording_minutes int,
  recording_found_at timestamptz,
  recording_attached_at timestamptz,
  register_saved_at timestamptz,
  register_saved_by uuid references public.profiles (id)
);
create index on public.live_sessions (class_id, starts_at);

create table public.attendance (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  status public.att_status not null,
  primary key (session_id, learner_id)
);
create index on public.attendance (learner_id);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  level public.learner_level not null,
  name text not null,
  response_type public.resp_type not null,
  title text not null,
  instructions text not null,
  steps text[] not null default '{}',
  attachments jsonb not null default '[]',
  sort int not null default 0
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  template_id uuid references public.task_templates (id),
  title text not null,
  instructions text not null,
  steps text[] not null default '{}',
  response_type public.resp_type not null,
  attachments jsonb not null default '[]',
  release_at timestamptz not null,
  due_at timestamptz not null check (due_at > release_at),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.tasks (class_id, release_at);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  media_path text,
  text_answer text,
  duration_seconds int,
  submitted_at timestamptz not null default now(),
  unique (task_id, learner_id)
);
create index on public.submissions (learner_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  tutor_id uuid references public.profiles (id),
  -- {"pronunciation":4,"grammar":3,"fluency":4,"confidence":4}
  scores jsonb not null default '{}',
  tags text[] not null default '{}',
  written text not null default '',
  voice_note_path text,
  voice_note_seconds int,
  release_at timestamptz not null default now(),
  review_seconds int,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  sent_by uuid references public.profiles (id),
  sent_at timestamptz not null default now()
);

-- ─── comms ──────────────────────────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  audience public.ann_audience not null,
  class_id uuid references public.classes (id),
  message text not null,
  channels text[] not null,
  reach int not null default 0,
  sent_by uuid references public.profiles (id),
  sent_at timestamptz not null default now()
);

-- In-app inbox. A row is only visible once created_at has passed, so
-- messages can be scheduled (e.g. feedback that releases at 6 pm).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  learner_id uuid references public.learners (id) on delete cascade,
  announcement_id uuid references public.announcements (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.notifications (recipient_id, created_at desc);

-- Outbox for WhatsApp / email / SMS. The dispatch-messages edge function
-- hands rows to the configured provider (a logging stub in development).
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel public.msg_channel not null,
  to_address text not null,
  template text not null,
  body text not null,
  data jsonb not null default '{}',
  send_after timestamptz not null default now(),
  status public.msg_status not null default 'queued',
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.outbound_messages (status, send_after);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target text not null,
  data jsonb not null default '{}'
);
create index on public.audit_log (at desc);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  total_rows int not null,
  imported int not null default 0,
  guardians int not null default 0,
  classes int not null default 0,
  needs_review int not null default 0,
  skipped_duplicates int not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.learner_pin_attempts (
  id bigint generated always as identity primary key,
  learner_id uuid not null references public.learners (id) on delete cascade,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on public.learner_pin_attempts (learner_id, at desc);

-- ─── new auth users get a profile ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, display_name, phone, email)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'parent'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.phone, ''),
    nullif(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
