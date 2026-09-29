-- Flying Colours — row-level security.
-- Reads go through RLS. Every write goes through a security-definer RPC
-- (20260929000003_rpc.sql) that checks the caller's role, so no table grants
-- insert/update/delete to `authenticated` directly.

-- ─── helpers ────────────────────────────────────────────────────────────────
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = any (roles) from public.profiles where id = auth.uid()), false) $$;

create or replace function public.my_learner_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.learners where user_id = auth.uid() $$;

-- Classes the caller teaches. Owners and lead tutors oversee every class.
create or replace function public.can_teach_class(p_class uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role('owner', 'lead_tutor')
      or exists (select 1 from public.classes c where c.id = p_class and c.tutor_id = auth.uid())
$$;

-- Guardian, the learner themself, their tutor, or office staff.
create or replace function public.can_view_learner(p_learner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.learners l
    where l.id = p_learner
      and (
        l.guardian_id = auth.uid()
        or l.user_id = auth.uid()
        or public.has_role('owner', 'lead_tutor', 'customer_service')
        or (l.class_id is not null and exists (select 1 from public.classes c where c.id = l.class_id and c.tutor_id = auth.uid()))
      )
  )
$$;

-- Teaching data (submissions, attendance, feedback) is not for customer service.
create or replace function public.can_view_learner_work(p_learner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.learners l
    where l.id = p_learner
      and (
        l.guardian_id = auth.uid()
        or l.user_id = auth.uid()
        or public.has_role('owner', 'lead_tutor')
        or (l.class_id is not null and exists (select 1 from public.classes c where c.id = l.class_id and c.tutor_id = auth.uid()))
      )
  )
$$;

-- Learners (and their guardians) see their own class's tasks and sessions.
create or replace function public.in_class(p_class uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.learners l
    where l.class_id = p_class and (l.user_id = auth.uid() or l.guardian_id = auth.uid())
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role('owner', 'lead_tutor', 'customer_service', 'tutor') $$;

-- ─── enable RLS everywhere ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.learners enable row level security;
alter table public.class_moves enable row level security;
alter table public.waitlist enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.renewal_reminders enable row level security;
alter table public.live_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback enable row level security;
alter table public.nudges enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.imports enable row level security;
alter table public.learner_pin_attempts enable row level security;

-- Only reads are granted to signed-in users; writes use RPCs.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon, authenticated;

-- The PIN hash never leaves the database: clients read pin_set instead.
revoke select on public.learners from anon, authenticated;
grant select (id, code, user_id, guardian_id, first_name, last_name, age, level, goals, prior_cohort, status,
  class_id, placed_at, pin_set, consent_data, consent_recordings, consent_showcase, needs_review, created_at)
  on public.learners to authenticated;

-- ─── policies ───────────────────────────────────────────────────────────────
create policy "self or staff directory" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or role in ('owner', 'lead_tutor', 'customer_service', 'tutor')
    or public.has_role('owner', 'lead_tutor', 'customer_service')
    or (public.has_role('tutor') and exists (
      select 1 from public.learners l join public.classes c on c.id = l.class_id
      where l.guardian_id = profiles.id and c.tutor_id = auth.uid()))
  );

create policy "classes readable" on public.classes for select to authenticated using (true);

create policy "plans public" on public.plans for select to anon, authenticated using (true);

create policy "learners visible" on public.learners for select to authenticated
  using (public.can_view_learner(id));

create policy "moves visible" on public.class_moves for select to authenticated
  using (public.can_view_learner(learner_id));

create policy "waitlist office" on public.waitlist for select to authenticated
  using (public.has_role('owner', 'lead_tutor', 'customer_service'));

create policy "subs visible" on public.subscriptions for select to authenticated
  using (
    public.has_role('owner', 'customer_service', 'lead_tutor')
    or exists (select 1 from public.learners l where l.id = learner_id and l.guardian_id = auth.uid())
  );

create policy "payments visible" on public.payments for select to authenticated
  using (guardian_id = auth.uid() or public.has_role('owner', 'customer_service'));

create policy "reminders office" on public.renewal_reminders for select to authenticated
  using (public.has_role('owner', 'customer_service'));

-- History follows the learner: sessions and tasks from a previous class stay
-- visible to anyone who can see that learner's attendance or work.
create policy "sessions visible" on public.live_sessions for select to authenticated
  using (
    public.can_teach_class(class_id) or public.in_class(class_id)
    or exists (select 1 from public.attendance a where a.session_id = live_sessions.id and public.can_view_learner_work(a.learner_id))
  );

create policy "attendance visible" on public.attendance for select to authenticated
  using (public.can_view_learner_work(learner_id));

create policy "templates staff" on public.task_templates for select to authenticated
  using (public.is_staff());

create policy "tasks visible" on public.tasks for select to authenticated
  using (
    public.can_teach_class(class_id) or (public.in_class(class_id) and release_at <= now())
    or exists (select 1 from public.submissions s where s.task_id = tasks.id and public.can_view_learner_work(s.learner_id))
  );

create policy "submissions visible" on public.submissions for select to authenticated
  using (public.can_view_learner_work(learner_id));

create policy "feedback visible" on public.feedback for select to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and public.can_view_learner_work(s.learner_id)
        and (public.is_staff() or feedback.release_at <= now())
    )
  );

create policy "nudges staff" on public.nudges for select to authenticated
  using (public.is_staff());

create policy "announcements office" on public.announcements for select to authenticated
  using (public.has_role('owner', 'lead_tutor', 'customer_service'));

create policy "own inbox" on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and created_at <= now());

create policy "outbox owner" on public.outbound_messages for select to authenticated
  using (public.has_role('owner'));

create policy "audit owner" on public.audit_log for select to authenticated
  using (public.has_role('owner'));

create policy "imports owner" on public.imports for select to authenticated
  using (public.has_role('owner'));

-- learner_pin_attempts: no policy — only the service role reads it.

-- ─── storage ────────────────────────────────────────────────────────────────
-- submissions/{learner_id}/{task_id}/{file}       learner uploads, private
-- voice-notes/{learner_id}/{submission_id}/{file}  tutor uploads
-- receipts/{guardian_id}/{file}                    parent uploads
-- task-attachments/{class_id}/{file}               tutor uploads
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('submissions', 'submissions', false, 200 * 1024 * 1024),
  ('voice-notes', 'voice-notes', false, 20 * 1024 * 1024),
  ('receipts', 'receipts', false, 10 * 1024 * 1024),
  ('task-attachments', 'task-attachments', false, 50 * 1024 * 1024)
on conflict (id) do nothing;

create or replace function public.path_uuid(p_name text, p_index int)
returns uuid
language plpgsql immutable
as $$
begin
  return (storage.foldername(p_name))[p_index]::uuid;
exception when others then
  return null;
end;
$$;

create policy "learner uploads own submission" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.path_uuid(name, 1) = public.my_learner_id());

create policy "view submission media" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.can_view_learner_work(public.path_uuid(name, 1)));

create policy "tutor uploads voice note" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and exists (
      select 1 from public.learners l
      where l.id = public.path_uuid(name, 1) and public.can_teach_class(l.class_id)
    )
  );

create policy "view voice note" on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (
      exists (
        select 1 from public.learners l
        where l.id = public.path_uuid(name, 1) and public.can_teach_class(l.class_id)
      )
      or exists (
        select 1 from public.feedback f join public.submissions s on s.id = f.submission_id
        where f.voice_note_path = storage.objects.name
          and f.release_at <= now()
          and public.can_view_learner_work(s.learner_id)
      )
    )
  );

create policy "parent uploads receipt" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.path_uuid(name, 1) = auth.uid());

create policy "view receipt" on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (public.path_uuid(name, 1) = auth.uid() or public.has_role('owner', 'customer_service'))
  );

create policy "tutor uploads attachment" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and public.can_teach_class(public.path_uuid(name, 1)));

create policy "view attachment" on storage.objects for select to authenticated
  using (
    bucket_id = 'task-attachments'
    and (public.can_teach_class(public.path_uuid(name, 1)) or public.in_class(public.path_uuid(name, 1)))
  );
