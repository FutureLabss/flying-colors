-- Flying Colours — screen summaries, reports and scheduled jobs.
-- Summaries marked "security invoker" run under the caller's RLS, so they
-- can only ever return what the caller could read table by table.

create table public.school_settings (
  id boolean primary key default true check (id),
  term_starts_on date not null,
  feedback_release time not null default '18:00'
);
alter table public.school_settings enable row level security;
create policy "settings readable" on public.school_settings for select to authenticated using (true);

create or replace function public.week_info(p_at timestamptz default now())
returns jsonb language sql stable security invoker set search_path = public as $$
  with d as (select (p_at at time zone 'Africa/Lagos')::date as today),
  w as (select today, today - ((extract(isodow from today)::int) - 1) as monday from d)
  select jsonb_build_object(
    'today', w.today,
    'monday', w.monday,
    'sunday', w.monday + 6,
    'week', greatest(1, ((w.monday - (select term_starts_on from school_settings)) / 7) + 1))
  from w
$$;

-- ─── parent ─────────────────────────────────────────────────────────────────
create or replace function public.parent_home(p_learner uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with l as (select id, first_name, age, status, level, class_id from learners where id = p_learner),
  c as (select c.*, p.display_name as tutor_name from classes c left join profiles p on p.id = c.tutor_id where c.id = (select class_id from l)),
  t as (
    select t.* from tasks t where t.class_id = (select class_id from l) and t.release_at <= now()
    order by t.release_at desc limit 1),
  sub as (select s.* from submissions s where s.task_id = (select id from t) and s.learner_id = p_learner),
  fb as (
    select f.*, tk.title as task_title, pr.display_name as tutor_name, s.submitted_at
    from feedback f join submissions s on s.id = f.submission_id join tasks tk on tk.id = s.task_id
    left join profiles pr on pr.id = f.tutor_id
    where s.learner_id = p_learner and f.release_at <= now()
    order by f.release_at desc limit 1),
  pending_fb as (
    select f.release_at from feedback f join submissions s on s.id = f.submission_id
    where s.learner_id = p_learner and f.release_at > now() order by f.release_at limit 1),
  att as (
    select a.status, ls.starts_at from attendance a join live_sessions ls on ls.id = a.session_id
    where a.learner_id = p_learner order by ls.starts_at desc limit 8),
  nxt as (select * from live_sessions where class_id = (select class_id from l) and starts_at > now() order by starts_at limit 1),
  rec as (select * from live_sessions where class_id = (select class_id from l) and recording_attached_at is not null order by starts_at desc limit 1),
  sb as (
    select s.*, pl.name as plan_name, pl.price_label, pl.total_minor from subscriptions s join plans pl on pl.id = s.plan_id
    where s.learner_id = p_learner and s.status <> 'pending' order by s.ends_on desc nulls last limit 1)
  select jsonb_build_object(
    'learner', (select jsonb_build_object('id', id, 'first_name', first_name, 'age', age, 'status', status, 'level', level) from l),
    'class', (select jsonb_build_object('id', id, 'name', name, 'tutor_name', tutor_name, 'zoom_url', zoom_url) from c),
    'task', (select jsonb_build_object('id', id, 'title', title, 'response_type', response_type, 'release_at', release_at, 'due_at', due_at) from t),
    'submission', (select jsonb_build_object('submitted_at', submitted_at, 'duration_seconds', duration_seconds) from sub),
    'feedback', (select jsonb_build_object('id', id, 'written', written, 'scores', scores, 'tags', tags, 'tutor_name', tutor_name,
                   'task_title', task_title, 'release_at', release_at, 'voice_note_seconds', voice_note_seconds) from fb),
    'pending_feedback_at', (select release_at from pending_fb),
    'attendance', coalesce((select jsonb_agg(status order by starts_at) from att), '[]'),
    'next_live', (select starts_at from nxt),
    'recording', (select jsonb_build_object('starts_at', starts_at, 'url', recording_url) from rec),
    'subscription', (select jsonb_build_object('plan_name', plan_name, 'price_label', price_label, 'total_minor', total_minor,
                       'currency', currency, 'ends_on', ends_on, 'status', status, 'balance_minor', balance_minor) from sb),
    'week', public.week_info())
$$;

create or replace function public.learner_progress(p_learner uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with fbs as (
    select f.*, t.title as task_title, t.due_at, s.submitted_at
    from feedback f join submissions s on s.id = f.submission_id join tasks t on t.id = s.task_id
    where s.learner_id = p_learner and f.release_at <= now()),
  term as (select term_starts_on from school_settings),
  att as (
    select a.status from attendance a join live_sessions ls on ls.id = a.session_id
    where a.learner_id = p_learner and ls.starts_at >= (select term_starts_on from term)),
  -- Tasks the learner owed this term: everything they submitted, plus unsent
  -- tasks from their current class since they joined it (placement or move).
  joined as (
    select greatest(coalesce(l.placed_at, l.created_at),
                    coalesce((select max(m.moved_at) from class_moves m where m.learner_id = l.id), '-infinity')) as at, l.class_id
    from learners l where l.id = p_learner),
  due_tasks as (
    select t.id, t.due_at, s.submitted_at from tasks t join submissions s on s.task_id = t.id and s.learner_id = p_learner
    where t.due_at < now() and t.release_at >= (select term_starts_on from term)
    union all
    select t.id, t.due_at, null from tasks t, joined j
    where t.class_id = j.class_id and t.due_at < now() and t.release_at >= j.at - interval '1 day'
      and t.release_at >= (select term_starts_on from term)
      and not exists (select 1 from submissions s where s.task_id = t.id and s.learner_id = p_learner)),
  last8 as (select * from fbs order by release_at desc limit 8)
  select jsonb_build_object(
    'attendance_pct', (select round(100.0 * count(*) filter (where status <> 'absent') / nullif(count(*), 0)) from att),
    'on_time_pct', (select round(100.0 * count(*) filter (where submitted_at <= due_at) / nullif(count(*), 0)) from due_tasks),
    'feedback_count', (select count(*) from fbs),
    'trend', coalesce((select jsonb_agg(scores order by release_at) from last8), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'task_title', task_title, 'release_at', release_at,
                  'written', written, 'scores', scores, 'tags', tags, 'voice_note_seconds', voice_note_seconds) order by release_at desc)
                from (select * from fbs order by release_at desc limit 20) h), '[]'))
$$;

-- ─── learner ────────────────────────────────────────────────────────────────
create or replace function public.learner_week()
returns jsonb language sql stable security invoker set search_path = public as $$
  with l as (select id, first_name, guardian_id, class_id from learners where user_id = auth.uid()),
  c as (select c.*, p.display_name as tutor_name from classes c left join profiles p on p.id = c.tutor_id where c.id = (select class_id from l)),
  fb as (
    select f.*, t.title as task_title, t.response_type, p.display_name as tutor_name
    from feedback f join submissions s on s.id = f.submission_id join tasks t on t.id = s.task_id
    left join profiles p on p.id = f.tutor_id
    where s.learner_id = (select id from l) and f.release_at <= now()
    order by f.release_at desc limit 1),
  -- The task to work on: the newest released one.
  t as (select * from tasks where class_id = (select class_id from l) and release_at <= now() order by release_at desc limit 1),
  sub as (select * from submissions where task_id = (select id from t) and learner_id = (select id from l)),
  wk as (select public.week_info() as w),
  done_days as (
    select distinct (s.submitted_at at time zone 'Africa/Lagos')::date as d from submissions s
    where s.learner_id = (select id from l) and s.submitted_at >= ((select w ->> 'monday' from wk)::date)::timestamp at time zone 'Africa/Lagos'),
  nxt as (select * from live_sessions where class_id = (select class_id from l) and starts_at > now() order by starts_at limit 1),
  rec as (select * from live_sessions where class_id = (select class_id from l) and recording_attached_at is not null order by starts_at desc limit 1)
  select jsonb_build_object(
    'learner', (select jsonb_build_object('id', id, 'first_name', first_name, 'guardian_id', guardian_id) from l),
    'class', (select jsonb_build_object('id', id, 'name', name, 'tutor_name', tutor_name, 'zoom_url', zoom_url) from c),
    'feedback', (select jsonb_build_object('id', id, 'written', written, 'scores', scores, 'task_title', task_title,
                   'response_type', response_type, 'voice_note_path', voice_note_path, 'voice_note_seconds', voice_note_seconds,
                   'seen_at', seen_at, 'tutor_name', tutor_name) from fb),
    'task', (select jsonb_build_object('id', id, 'title', title, 'instructions', instructions, 'steps', steps,
               'response_type', response_type, 'attachments', attachments, 'release_at', release_at, 'due_at', due_at) from t),
    'submission', (select jsonb_build_object('id', id, 'submitted_at', submitted_at) from sub),
    'done_days', coalesce((select jsonb_agg(d) from done_days), '[]'),
    'next_live', (select starts_at from nxt),
    'recording', (select jsonb_build_object('starts_at', starts_at, 'url', recording_url) from rec),
    'week', (select w from wk))
$$;

-- ─── tutor ──────────────────────────────────────────────────────────────────
-- The review queue for a class: by default the task currently being corrected
-- (the newest task already released).
create or replace function public.tutor_queue(p_class uuid, p_task uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with c as (select * from classes where id = p_class),
  t as (
    select * from tasks where class_id = p_class
      and (id = p_task or (p_task is null and release_at <= now()))
    order by release_at desc limit 1),
  roster as (
    select l.id, l.first_name, l.last_name, l.age,
           s.id as submission_id, s.submitted_at, s.duration_seconds,
           (s.submitted_at > (select due_at from t)) as late,
           f.id as feedback_id, f.release_at,
           (select max(n.sent_at) from nudges n where n.task_id = (select id from t) and n.learner_id = l.id) as nudged_at
    from learners l
    left join submissions s on s.learner_id = l.id and s.task_id = (select id from t)
    left join feedback f on f.submission_id = s.id
    where l.class_id = p_class and l.status = 'active'),
  wk as (select public.week_info() as w),
  wk_bounds as (select ((w ->> 'monday')::date - 2) as d0, ((w ->> 'sunday')::date - 2) as d1 from wk),
  sess as (
    select ls.id, ls.starts_at, ls.recording_attached_at, ls.register_saved_at,
      (select count(*) from attendance a where a.session_id = ls.id and a.status <> 'absent') as present,
      (select count(*) from attendance a where a.session_id = ls.id and a.status = 'absent') as absent
    from live_sessions ls, wk_bounds b
    where ls.class_id = p_class and (ls.starts_at at time zone 'Africa/Lagos')::date between b.d0 and b.d1 + 2),
  wtasks as (
    select id, title, release_at, due_at from tasks, wk_bounds b
    where class_id = p_class and (release_at at time zone 'Africa/Lagos')::date between b.d0 and b.d1 + 2)
  select jsonb_build_object(
    'class', (select jsonb_build_object('id', id, 'name', name, 'age_min', age_min, 'age_max', age_max, 'level', level,
               'capacity', capacity, 'live_schedule', live_schedule) from c),
    'filled', (select count(*) from roster),
    'task', (select jsonb_build_object('id', id, 'title', title, 'response_type', response_type, 'release_at', release_at, 'due_at', due_at) from t),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.submitted_at nulls last, r.first_name) from roster r), '[]'),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at) from sess s), '[]'),
    'tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.release_at) from wtasks x), '[]'),
    'week', (select w from wk))
$$;

create or replace function public.learner_timeline(p_learner uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(e order by e.at desc), '[]') from (
    select f.release_at as at, 'Feedback' as kind,
      coalesce((select string_agg(initcap(k) || ' ' || v, ' · ') from jsonb_each_text(f.scores) x(k, v)), '')
        || case when f.written <> '' then ' — “' || f.written || '”' else '' end as text,
      p.display_name as actor
    from feedback f join submissions s on s.id = f.submission_id left join profiles p on p.id = f.tutor_id
    where s.learner_id = p_learner and (public.is_staff() or f.release_at <= now())
    union all
    select s.submitted_at, 'Submission',
      t.title || ' · ' || t.response_type::text
        || coalesce(' ' || (s.duration_seconds / 60) || ':' || lpad((s.duration_seconds % 60)::text, 2, '0'), '')
        || case when s.submitted_at > t.due_at then ' · late' else ' · on time' end,
      l.first_name
    from submissions s join tasks t on t.id = s.task_id join learners l on l.id = s.learner_id
    where s.learner_id = p_learner
    union all
    select ls.starts_at, 'Attendance', 'Live class · ' || a.status::text
        || case when a.status = 'absent' and ls.recording_url is not null then ' — recording sent to parent' else '' end,
      coalesce(p.display_name, 'System')
    from attendance a join live_sessions ls on ls.id = a.session_id left join profiles p on p.id = ls.register_saved_by
    where a.learner_id = p_learner
    union all
    select m.moved_at, 'Class move', cf.name || ' → ' || ct.name || ' · reason: ' || lower(m.reason), p.display_name
    from class_moves m left join classes cf on cf.id = m.from_class_id join classes ct on ct.id = m.to_class_id
    left join profiles p on p.id = m.moved_by
    where m.learner_id = p_learner
    union all
    select coalesce(py.decided_at, py.sent_at, py.created_at), 'Payment',
      public._naira(py.amount_minor, py.currency) || ' · ' || initcap(py.provider) || ' · '
        || case py.status when 'auto_verified' then 'auto-verified' else py.status::text end,
      case when py.status = 'auto_verified' then 'System' else coalesce(p.display_name, 'System') end
    from payments py left join profiles p on p.id = py.decided_by
    where py.learner_id = p_learner and py.status in ('approved', 'auto_verified', 'rejected', 'reversed')
    union all
    select l.created_at, 'Registered', 'Guardian ' || g.full_name
        || case when l.consent_data then ' · consent recorded' else '' end, 'Parent'
    from learners l join profiles g on g.id = l.guardian_id
    where l.id = p_learner
  ) e
$$;

-- ─── admin ──────────────────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; wk jsonb := public.week_info(); v_mon date; v_wkend_start timestamptz;
begin
  perform _require('owner', 'lead_tutor', 'customer_service');
  v_mon := (wk ->> 'monday')::date;
  v_wkend_start := _wat_at(v_mon - 2, '00:00');
  with cls as (
    select c.id, c.name, c.age_min, c.age_max, c.level, c.capacity, p.display_name as tutor_name, public._filled(c.id) as filled,
      (select t.id from tasks t where t.class_id = c.id and t.release_at <= now() order by t.release_at desc limit 1) as task_id
    from classes c left join profiles p on p.id = c.tutor_id),
  cls2 as (
    select cls.*,
      (select round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0))
         from attendance a join live_sessions ls on ls.id = a.session_id
         where ls.class_id = cls.id and ls.starts_at between v_wkend_start and _wat_at(v_mon, '00:00')) as attendance_pct,
      (select count(*) from submissions s where s.task_id = cls.task_id) as submitted,
      (select count(*) from feedback f join submissions s on s.id = f.submission_id where s.task_id = cls.task_id) as reviewed
    from cls)
  select jsonb_build_object(
    'week', wk,
    'active_learners', (select count(*) from learners where status = 'active'),
    'new_this_week', (select count(*) from learners where status = 'active' and placed_at >= _wat_at(v_mon, '00:00')),
    'class_count', (select count(*) from cls),
    'full_classes', (select count(*) from cls where filled >= capacity),
    'fill_pct', (select round(100.0 * sum(filled) / nullif(sum(capacity), 0)) from cls),
    'weekend_attendance_pct', (select round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0))
        from attendance a join live_sessions ls on ls.id = a.session_id where ls.starts_at between v_wkend_start and _wat_at(v_mon, '00:00')),
    'weekend_absent', (select count(*) from attendance a join live_sessions ls on ls.id = a.session_id
        where a.status = 'absent' and ls.starts_at between v_wkend_start and _wat_at(v_mon, '00:00')),
    'feedback_on_time_pct', (select round(100.0 * count(*) filter (where f.created_at <= _correction_release(t.due_at)) / nullif(count(*), 0))
        from feedback f join submissions s on s.id = f.submission_id join tasks t on t.id = s.task_id
        where t.due_at > now() - interval '28 days'),
    'submitted_pct', (select round(100.0 * sum(submitted) / nullif(sum(filled), 0)) from cls2 where task_id is not null),
    'pending_payments', (select count(*) from payments where status = 'pending_review'),
    'card_verified_today', (select count(*) from payments where status = 'auto_verified' and _wat(decided_at)::date = (wk ->> 'today')::date),
    'reversals_flagged', (select count(*) from payments where status = 'reversed' and decided_at > now() - interval '7 days'),
    'to_place', (select count(*) from learners where status = 'awaiting_placement'),
    'oldest_wait_days', (select max(current_date - (select min(coalesce(p.decided_at, p.created_at))::date from payments p
        where p.learner_id = l.id and p.status in ('approved', 'auto_verified'))) from learners l where l.status = 'awaiting_placement'),
    'next_cohort', (select min(next_cohort_start) from classes where next_cohort_start >= current_date),
    'renewals', (select count(*) from public._renewal_rows() r where r.outcome is null),
    'classes', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from cls2 x), '[]'))
  into v;
  return v;
end $$;

-- Subscriptions that need a follow-up: expiring in ≤ 7 days, expired, or
-- behind on instalments. Rows with an outcome stay listed so it can be undone.
create or replace function public._renewal_rows()
returns table (subscription_id uuid, learner_id uuid, learner text, guardian text, plan text, ends_on date,
               grp text, days_left int, balance_minor bigint, currency text, next_instalment_due date,
               grace_until date, status public.sub_status, outcome public.renewal_outcome, reminders text[])
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (s.learner_id) s.* from subscriptions s
    where s.status <> 'pending' order by s.learner_id, s.ends_on desc nulls last)
  select s.id, l.id, l.first_name || ' ' || l.last_name, coalesce(nullif(g.display_name, ''), g.full_name),
    case when pl.instalments > 1 then 'Instalments' else pl.name end, s.ends_on,
    case
      when s.balance_minor > 0 and s.next_instalment_due < current_date then 'arrears'
      when s.ends_on < current_date then 'expired'
      else 'expiring' end,
    s.ends_on - current_date, s.balance_minor, s.currency, s.next_instalment_due, s.grace_until, s.status,
    s.followup_outcome,
    coalesce((select array_agg(r.kind order by r.sent_at) from renewal_reminders r where r.subscription_id = s.id), '{}')
  from latest s join learners l on l.id = s.learner_id join profiles g on g.id = l.guardian_id join plans pl on pl.id = s.plan_id
  where (l.status <> 'exited' or s.followup_outcome = 'exit')
    and (
      s.followup_outcome is not null
      or (s.balance_minor > 0 and s.next_instalment_due < current_date)
      or (s.ends_on <= current_date + 7 and s.ends_on >= current_date - 30 and s.status in ('active', 'grace', 'expired'))
    )
$$;

create or replace function public.renewal_queue()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require('owner', 'customer_service');
  return query select to_jsonb(r) from public._renewal_rows() r order by r.ends_on;
end $$;

create or replace function public.pilot_report(p_range text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; wk jsonb := public.week_info(); v jsonb;
begin
  perform _require('owner', 'lead_tutor', 'customer_service');
  v_from := case p_range
    when 'week' then _wat_at((wk ->> 'monday')::date, '00:00')
    when 'month' then _wat_at(date_trunc('month', (wk ->> 'today')::date)::date, '00:00')
    else _wat_at((select term_starts_on from school_settings), '00:00') end;
  with cls as (select c.id, c.name from classes c),
  per_class as (
    select cls.name,
      (select round(100.0 * count(s.id) / nullif(count(*), 0))
         from tasks t join learners l on l.class_id = t.class_id and l.status = 'active'
         left join submissions s on s.task_id = t.id and s.learner_id = l.id
         where t.class_id = cls.id and t.due_at between v_from and now()) as submitted_pct,
      (select round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0))
         from attendance a join live_sessions ls on ls.id = a.session_id
         where ls.class_id = cls.id and ls.starts_at between v_from and now()) as attendance_pct
    from cls)
  select jsonb_build_object(
    'from', v_from,
    'enquiry_to_placement_days', (select round(avg(extract(epoch from (placed_at - created_at)) / 86400)::numeric, 1)
        from learners where placed_at >= v_from),
    'register_pct', (select round(100.0 * count(*) filter (where register_saved_at is not null) / nullif(count(*), 0))
        from live_sessions where ends_at between v_from and now()),
    'whatsapp_submissions', 0,
    'feedback_by_correction_day_pct', (select round(100.0 * count(f.id) filter (where f.created_at <= _correction_release(t.due_at)) / nullif(count(s.id), 0))
        from submissions s join tasks t on t.id = s.task_id left join feedback f on f.submission_id = s.id
        where t.due_at between v_from and now()),
    'review_minutes', (select round(avg(review_seconds) / 60.0, 1) from feedback where created_at >= v_from and review_seconds is not null),
    'by_class', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from per_class p), '[]'),
    'active_learners', (select count(*) from learners where status = 'active'),
    'fill_pct', (select round(100.0 * sum(public._filled(id)) / nullif(sum(capacity), 0)) from classes),
    'renewals_due_30', (select count(*) from subscriptions s join learners l on l.id = s.learner_id
        where l.status = 'active' and s.status = 'active' and s.ends_on between current_date and current_date + 30),
    'expiries_flagged_pct', (select round(100.0 * count(*) filter (where exists (
          select 1 from renewal_reminders r where r.subscription_id = s.id and r.kind = '7d')) / nullif(count(*), 0))
        from subscriptions s where s.ends_on between current_date - 30 and current_date + 6 and s.status <> 'pending'))
  into v;
  return v;
end $$;

create or replace function public.recent_announcements()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require('owner', 'lead_tutor', 'customer_service');
  return query
    select jsonb_build_object('id', a.id, 'sent_at', a.sent_at, 'message', a.message, 'reach', a.reach,
      'to', case a.audience when 'class' then c.name when 'all_learners' then 'All learners' else 'All parents' end,
      'read_pct', (select round(100.0 * count(*) filter (where n.read_at is not null) / nullif(count(*), 0))
                   from notifications n where n.announcement_id = a.id))
    from announcements a left join classes c on c.id = a.class_id
    order by a.sent_at desc limit 20;
end $$;

-- Badge counts for the admin menu.
create or replace function public.admin_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require('owner', 'lead_tutor', 'customer_service');
  return jsonb_build_object(
    'place', (select count(*) from learners where status = 'awaiting_placement'),
    'pay', (select count(*) from payments where status = 'pending_review'),
    'ren', (select count(*) from public._renewal_rows() r where r.outcome is null));
end $$;

-- The classes a tutor can open, with how many submissions wait for review on
-- each class's current task. Lead tutors and owners see every class.
create or replace function public.my_classes()
returns table (id uuid, name text, to_review int, learners int, tutor_name text)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name,
    (select count(*)::int from submissions s
       left join feedback f on f.submission_id = s.id
       where f.id is null and s.task_id = (
         select t.id from tasks t where t.class_id = c.id and t.release_at <= now() order by t.release_at desc limit 1)),
    (select count(*)::int from learners l where l.class_id = c.id and l.status = 'active'),
    p.display_name
  from classes c left join profiles p on p.id = c.tutor_id
  where public.can_teach_class(c.id)
  order by (c.tutor_id = auth.uid()) desc, c.name
$$;

-- ─── scheduled jobs ─────────────────────────────────────────────────────────
-- Renewal reminders at 7 days, 3 days and on the day a plan ends.
create or replace function public.send_renewal_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_kind text;
begin
  for r in
    select s.id, s.ends_on, l.id as learner_id, l.first_name, l.guardian_id, c.name as class_name, pl.total_minor, pl.currency
    from subscriptions s join learners l on l.id = s.learner_id join plans pl on pl.id = s.plan_id
    left join classes c on c.id = l.class_id
    where s.status = 'active' and l.status = 'active' and s.ends_on - current_date in (7, 3, 0)
      and not exists (select 1 from subscriptions n where n.learner_id = s.learner_id and n.starts_on >= s.ends_on and n.status = 'active')
  loop
    v_kind := case r.ends_on - current_date when 7 then '7d' when 3 then '3d' else 'expiry' end;
    continue when exists (select 1 from renewal_reminders where subscription_id = r.id and kind = v_kind);
    insert into renewal_reminders (subscription_id, kind) values (r.id, v_kind);
    perform _notify(r.guardian_id, r.learner_id, 'renewal',
      'Renewal · ' || case v_kind when '7d' then '7 days' when '3d' then '3 days' else 'today' end,
      r.first_name || '’s annual plan ends ' || to_char(r.ends_on, 'Dy FMDD Mon') || '. Renew to keep their place'
        || coalesce(' in ' || r.class_name, '') || '.',
      jsonb_build_object('amount_minor', r.total_minor, 'currency', r.currency, 'learner_id', r.learner_id));
    perform _whatsapp(r.guardian_id, 'renewal_reminder',
      r.first_name || '’s Flying Colours plan ends ' || to_char(r.ends_on, 'Dy FMDD Mon') || '. Renew in the app to keep their place.');
    v_n := v_n + 1;
  end loop;
  -- Plans that ended without a renewal.
  update subscriptions set status = 'expired'
  where status = 'active' and ends_on < current_date;
  update subscriptions set status = 'expired'
  where status = 'grace' and grace_until < current_date;
  return v_n;
end $$;

-- Sunday weekly summary for each family, per child.
create or replace function public.send_weekly_summaries()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; wk jsonb := public.week_info(); v_mon date; v_from timestamptz; v_data jsonb;
begin
  v_mon := (wk ->> 'monday')::date;
  v_from := _wat_at(v_mon, '00:00');
  for r in select l.*, c.name as class_name from learners l join classes c on c.id = l.class_id where l.status = 'active' loop
    v_data := jsonb_build_object(
      'week', wk ->> 'week',
      'live_attended', (select count(*) from attendance a join live_sessions ls on ls.id = a.session_id
          where a.learner_id = r.id and a.status <> 'absent' and ls.starts_at >= v_from - interval '2 days'),
      'live_total', (select count(*) from live_sessions ls where ls.class_id = r.class_id
          and ls.starts_at between v_from - interval '2 days' and now()),
      'tasks_submitted', (select count(*) from submissions s join tasks t on t.id = s.task_id
          where s.learner_id = r.id and t.release_at >= v_from),
      'tasks_on_time', (select count(*) from submissions s join tasks t on t.id = s.task_id
          where s.learner_id = r.id and t.release_at >= v_from and s.submitted_at <= t.due_at),
      'tasks_total', (select count(*) from tasks t where t.class_id = r.class_id and t.release_at between v_from and now()),
      'scores', (select f.scores from feedback f join submissions s on s.id = f.submission_id
          where s.learner_id = r.id and f.release_at <= now() order by f.release_at desc limit 1),
      'ends_on', (select max(ends_on) from subscriptions where learner_id = r.id and status in ('active', 'grace')));
    perform _notify(r.guardian_id, r.id, 'weekly_summary', r.first_name || '’s week ' || (wk ->> 'week'), '', v_data);
    perform _whatsapp(r.guardian_id, 'weekly_summary', r.first_name || '’s week ' || (wk ->> 'week') || ' summary is in the app.', v_data);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public._renewal_rows() from authenticated;
revoke execute on function public.send_renewal_reminders() from authenticated;
revoke execute on function public.send_weekly_summaries() from authenticated;

-- pg_cron is available on Supabase; schedule if the extension exists.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('renewal-reminders', '0 8 * * *', 'select public.send_renewal_reminders()');  -- 9 am WAT
    perform cron.schedule('weekly-summaries', '0 17 * * 0', 'select public.send_weekly_summaries()');   -- Sun 6 pm WAT
  end if;
end $$;
