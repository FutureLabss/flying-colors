-- Flying Colours — actions. Every write in the product is one of these
-- functions. Each checks the caller's role, writes an audit entry where the
-- action matters, and queues notifications (in-app + WhatsApp outbox).

-- ─── internal helpers (not callable from the API) ──────────────────────────
create or replace function public._wat(ts timestamptz)
returns timestamp language sql immutable as $$ select ts at time zone 'Africa/Lagos' $$;

create or replace function public._wat_at(d date, t time)
returns timestamptz language sql immutable as $$ select (d + t) at time zone 'Africa/Lagos' $$;

-- Feedback releases at 6 pm WAT on the first correction day (Tue or Fri)
-- on or after the task's deadline.
create or replace function public._correction_release(p_due timestamptz)
returns timestamptz language sql immutable as $$
  select public._wat_at(d + ((case when extract(isodow from d)::int <= 2 then 2 when extract(isodow from d)::int <= 5 then 5 else 9 end)
                             - extract(isodow from d)::int), '18:00')
  from (select (p_due at time zone 'Africa/Lagos')::date as d) x
$$;

create or replace function public._naira(minor bigint, currency text default 'NGN')
returns text language sql immutable as $$
  select case currency
    when 'USD' then '$' || to_char(minor / 100.0, 'FM999G999G990')
    else '₦' || to_char(minor / 100.0, 'FM999G999G990')
  end
$$;

create or replace function public._role_label(r public.app_role)
returns text language sql immutable as $$
  select case r
    when 'owner' then 'Owner' when 'lead_tutor' then 'Lead tutor'
    when 'customer_service' then 'Customer service' when 'tutor' then 'Tutor'
    when 'parent' then 'Parent' when 'learner' then 'Learner' end
$$;

create or replace function public._audit(p_action text, p_target text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text;
begin
  select coalesce(nullif(display_name, ''), full_name), public._role_label(role)
    into v_name, v_role from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_name, actor_role, action, target, data)
  values (auth.uid(), coalesce(v_name, 'System'), coalesce(v_role, 'System'), p_action, p_target, p_data);
end $$;

create or replace function public._audit_system(p_role text, p_action text, p_target text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, actor_name, actor_role, action, target, data)
  values (null, 'System', p_role, p_action, p_target, p_data)
$$;

create or replace function public._notify(
  p_recipient uuid, p_learner uuid, p_kind text, p_title text, p_body text,
  p_data jsonb default '{}', p_at timestamptz default now())
returns void language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, learner_id, kind, title, body, data, created_at)
  values (p_recipient, p_learner, p_kind, p_title, p_body, p_data, p_at)
$$;

-- Queue a WhatsApp message to a profile's phone, if they have one.
create or replace function public._whatsapp(
  p_recipient uuid, p_template text, p_body text,
  p_data jsonb default '{}', p_after timestamptz default now())
returns void language sql security definer set search_path = public as $$
  insert into outbound_messages (channel, to_address, template, body, data, send_after)
  select 'whatsapp', phone, p_template, p_body, p_data, p_after
  from profiles where id = p_recipient and phone is not null
$$;

create or replace function public._require(variadic roles public.app_role[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(variadic roles) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public._require_class(p_class uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_teach_class(p_class) then
    raise exception 'Not allowed for this class' using errcode = '42501';
  end if;
end $$;

-- Seats taken: active learners in the class.
create or replace function public._filled(p_class uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from learners where class_id = p_class and status = 'active'
$$;

-- ─── read helpers ───────────────────────────────────────────────────────────
create or replace function public.class_fill()
returns table (class_id uuid, filled int, capacity int)
language sql stable security definer set search_path = public as $$
  select c.id, public._filled(c.id), c.capacity from classes c
$$;

-- ─── parent: sign-up and payment ────────────────────────────────────────────
create or replace function public.complete_guardian_profile(
  p_full_name text, p_email text, p_country text,
  p_consent_data boolean, p_consent_recordings boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not p_consent_data then
    raise exception 'We need your consent to process your child''s details' using errcode = '22023';
  end if;
  update profiles set
    full_name = trim(p_full_name),
    display_name = case when display_name = '' then trim(p_full_name) else display_name end,
    email = nullif(trim(p_email), ''),
    country = p_country,
    consent_data = p_consent_data,
    consent_recordings = p_consent_recordings,
    consent_at = now()
  where id = auth.uid() and role = 'parent';
  if not found then raise exception 'Only parent accounts can enrol children' using errcode = '42501'; end if;
end $$;

create or replace function public.enrol_child(
  p_first_name text, p_age int, p_level public.learner_level, p_goals text, p_prior_cohort boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare g profiles; v_id uuid;
begin
  select * into g from profiles where id = auth.uid() and role = 'parent';
  if g.id is null then raise exception 'Only parent accounts can enrol children' using errcode = '42501'; end if;
  if trim(p_first_name) = '' then raise exception 'First name is required' using errcode = '22023'; end if;
  insert into learners (guardian_id, first_name, last_name, age, level, goals, prior_cohort,
                        consent_data, consent_recordings)
  values (g.id, trim(p_first_name), coalesce(nullif(split_part(g.full_name, ' ', 2), ''), ''),
          p_age, p_level, coalesce(p_goals, ''), p_prior_cohort, g.consent_data, g.consent_recordings)
  returning id into v_id;
  return v_id;
end $$;

-- Starts a payment for a new plan or a renewal. Card payments are completed
-- by the payments edge function (Paystack); transfers wait for a receipt.
create or replace function public.create_payment(p_learner uuid, p_plan text, p_method public.pay_method)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l learners; pl plans; v_sub uuid; v_pay payments; v_ref text;
begin
  select * into l from learners where id = p_learner and guardian_id = auth.uid();
  if l.id is null then raise exception 'Learner not found' using errcode = 'P0002'; end if;
  select * into pl from plans where id = p_plan;
  if pl.id is null then raise exception 'Unknown plan' using errcode = '22023'; end if;
  if p_plan = 'usd' and p_method = 'transfer' then
    raise exception 'The diaspora plan is paid by card' using errcode = '22023';
  end if;

  -- Reuse a still-pending subscription (e.g. the parent went back a step).
  select id into v_sub from subscriptions where learner_id = l.id and status = 'pending' order by created_at desc limit 1;
  if v_sub is null then
    insert into subscriptions (learner_id, plan_id, currency, balance_minor)
    values (l.id, pl.id, pl.currency, pl.total_minor) returning id into v_sub;
  else
    update subscriptions set plan_id = pl.id, currency = pl.currency, balance_minor = pl.total_minor where id = v_sub;
  end if;
  delete from payments where subscription_id = v_sub and status = 'initiated';

  v_ref := 'FC-' || upper(regexp_replace(l.first_name, '[^A-Za-z]', '', 'g')) || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into payments (learner_id, guardian_id, subscription_id, description, amount_minor, currency,
                        method, provider, reference, bank)
  values (l.id, l.guardian_id, v_sub,
          case when pl.instalments > 1 then 'Instalment 1 of ' || pl.instalments else pl.name end,
          pl.due_today_minor, pl.currency, p_method,
          case p_method when 'card' then 'paystack' else 'bank' end, v_ref,
          case p_method when 'transfer' then 'GTBank' end)
  returning * into v_pay;

  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.reference,
    'amount_minor', v_pay.amount_minor, 'currency', v_pay.currency);
end $$;

create or replace function public.submit_transfer(p_payment uuid, p_receipt_path text)
returns void language plpgsql security definer set search_path = public as $$
declare p payments; l learners;
begin
  select * into p from payments where id = p_payment and guardian_id = auth.uid() and method = 'transfer';
  if p.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if p.status <> 'initiated' then return; end if;
  select * into l from learners where id = p.learner_id;
  update payments set status = 'pending_review', sent_at = now(), receipt_path = nullif(p_receipt_path, ''),
    bank_alert = 'not_found'
  where id = p.id;
  perform _notify(auth.uid(), l.id, 'payment', 'Transfer received for checking',
    'We''ll match ' || _naira(p.amount_minor, p.currency) || ' (ref ' || p.reference || ') to your bank alert within 24 hours.');
end $$;

-- Called only by the payments edge function once the provider confirms.
create or replace function public.mark_payment_verified(p_reference text, p_provider_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  select * into p from payments where reference = p_reference;
  if p.id is null then raise exception 'Unknown reference' using errcode = 'P0002'; end if;
  if p.status in ('auto_verified', 'approved') then
    return jsonb_build_object('status', 'already_verified');
  end if;
  update payments set status = 'auto_verified', provider_ref = p_provider_ref, sent_at = coalesce(sent_at, now()),
    decided_at = now()
  where id = p.id;
  perform _activate_subscription(p.id);
  perform _audit_system('Paystack', 'Payment auto-verified',
    (select coalesce(nullif(display_name, ''), full_name) from profiles where id = p.guardian_id)
      || ' · ' || _naira(p.amount_minor, p.currency) || ' · ' || p.reference);
  return jsonb_build_object('status', 'verified');
end $$;

-- Activate (or extend, for renewals) the subscription a payment belongs to.
create or replace function public._activate_subscription(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p payments; s subscriptions; pl plans; l learners; v_prev date; v_start date;
begin
  select * into p from payments where id = p_payment;
  select * into s from subscriptions where id = p.subscription_id;
  select * into pl from plans where id = s.plan_id;
  select * into l from learners where id = p.learner_id;

  if s.status = 'pending' then
    -- A renewal starts when the current subscription ends.
    select max(ends_on) into v_prev from subscriptions
      where learner_id = l.id and id <> s.id and status in ('active', 'grace');
    v_start := greatest(coalesce(v_prev, current_date), current_date);
    update subscriptions set status = 'active', starts_on = v_start,
      ends_on = (v_start + interval '12 months')::date,
      balance_minor = greatest(0, pl.total_minor - p.amount_minor),
      instalments_paid = 1,
      next_instalment_due = case when pl.instalments > 1 then (v_start + interval '3 months')::date end
    where id = s.id;
    update subscriptions set status = 'expired' where learner_id = l.id and id <> s.id and status = 'grace';
  else
    update subscriptions set balance_minor = greatest(0, balance_minor - p.amount_minor),
      instalments_paid = instalments_paid + 1,
      next_instalment_due = case when instalments_paid + 1 < pl.instalments
        then (next_instalment_due + interval '3 months')::date end
    where id = s.id;
  end if;

  if l.status = 'awaiting_payment' then
    update learners set status = 'awaiting_placement' where id = l.id;
  end if;

  perform _notify(p.guardian_id, l.id, 'payment', 'Payment confirmed',
    _naira(p.amount_minor, p.currency) || ' received for ' || l.first_name || '. Receipt sent to your email.');
  perform _whatsapp(p.guardian_id, 'payment_confirmed',
    'Payment confirmed: ' || _naira(p.amount_minor, p.currency) || ' for ' || l.first_name || '. Ref ' || p.reference || '.');
end $$;

-- ─── learner ────────────────────────────────────────────────────────────────
create or replace function public.mark_feedback_seen(p_feedback uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update feedback f set seen_at = coalesce(f.seen_at, now())
  from submissions s
  where f.id = p_feedback and s.id = f.submission_id and s.learner_id = public.my_learner_id()
    and f.release_at <= now();
end $$;

create or replace function public.submit_task(p_task uuid, p_media_path text, p_duration int, p_text text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l learners; t tasks; v_id uuid; v_tutor text;
begin
  p_media_path := nullif(p_media_path, '');
  select * into l from learners where id = public.my_learner_id();
  if l.id is null then raise exception 'Only learners submit tasks' using errcode = '42501'; end if;
  select * into t from tasks where id = p_task and class_id = l.class_id and release_at <= now();
  if t.id is null then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if p_media_path is not null and split_part(p_media_path, '/', 1) <> l.id::text then
    raise exception 'Upload path does not belong to this learner' using errcode = '42501';
  end if;

  insert into submissions (task_id, learner_id, media_path, duration_seconds, text_answer)
  values (t.id, l.id, p_media_path, p_duration, p_text)
  on conflict (task_id, learner_id) do update
    set media_path = excluded.media_path, duration_seconds = excluded.duration_seconds,
        text_answer = excluded.text_answer, submitted_at = now()
  returning id into v_id;

  select display_name into v_tutor from profiles p join classes c on c.tutor_id = p.id where c.id = t.class_id;
  perform _notify(l.guardian_id, l.id, 'submitted', 'Submitted',
    l.first_name || ' sent ' || case t.response_type when 'video' then 'a video' when 'audio' then 'a voice recording'
      when 'photo' then 'a photo' else 'an answer' end || ' for “' || t.title || '” at '
      || lower(to_char(_wat(now()), 'FMHH12:MI am')) || '. Only you and ' || coalesce(v_tutor, 'the tutor') || ' can see it.');
  perform _whatsapp(l.guardian_id, 'task_submitted', l.first_name || ' submitted “' || t.title || '”.');
  return v_id;
end $$;

-- ─── tutor ──────────────────────────────────────────────────────────────────
create or replace function public.save_feedback(
  p_submission uuid, p_scores jsonb, p_tags text[], p_written text,
  p_voice_note_path text, p_voice_note_seconds int, p_release_now boolean, p_review_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s submissions; t tasks; l learners; v_release timestamptz; v_id uuid; v_tutor text;
begin
  select * into s from submissions where id = p_submission;
  if s.id is null then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  select * into t from tasks where id = s.task_id;
  perform _require_class(t.class_id);
  select * into l from learners where id = s.learner_id;

  v_release := case when p_release_now then now()
    else greatest(now(), _correction_release(t.due_at)) end;

  insert into feedback (submission_id, tutor_id, scores, tags, written, voice_note_path,
                        voice_note_seconds, release_at, review_seconds)
  values (s.id, auth.uid(), coalesce(p_scores, '{}'), coalesce(p_tags, '{}'), coalesce(p_written, ''),
          p_voice_note_path, p_voice_note_seconds, v_release, p_review_seconds)
  on conflict (submission_id) do update set
    tutor_id = excluded.tutor_id, scores = excluded.scores, tags = excluded.tags, written = excluded.written,
    voice_note_path = coalesce(excluded.voice_note_path, feedback.voice_note_path),
    voice_note_seconds = coalesce(excluded.voice_note_seconds, feedback.voice_note_seconds),
    release_at = excluded.release_at, review_seconds = excluded.review_seconds
  returning id into v_id;

  select display_name into v_tutor from profiles where id = auth.uid();
  delete from notifications where kind = 'feedback' and data ->> 'feedback_id' = v_id::text;
  perform _notify(l.guardian_id, l.id, 'feedback', 'Feedback ready',
    coalesce(v_tutor, 'Your tutor') || ' left feedback on “' || t.title || '”.',
    jsonb_build_object('feedback_id', v_id), v_release);
  perform _whatsapp(l.guardian_id, 'feedback_ready',
    l.first_name || '''s feedback on “' || t.title || '” is ready in Flying Colours.', '{}', v_release);
  return jsonb_build_object('feedback_id', v_id, 'release_at', v_release);
end $$;

create or replace function public.nudge_parent(p_task uuid, p_learner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks; l learners;
begin
  select * into t from tasks where id = p_task;
  perform _require_class(t.class_id);
  select * into l from learners where id = p_learner and class_id = t.class_id;
  if l.id is null then raise exception 'Learner not in this class' using errcode = 'P0002'; end if;
  insert into nudges (task_id, learner_id, sent_by) values (t.id, l.id, auth.uid());
  perform _whatsapp(l.guardian_id, 'task_reminder',
    'Reminder: ' || l.first_name || ' hasn''t sent “' || t.title || '” yet. Due '
      || to_char(_wat(t.due_at), 'Dy FMHH12 am') || '.');
end $$;

create or replace function public.attach_recording(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from live_sessions where id = p_session;
  perform _require_class(v_class);
  update live_sessions set recording_attached_at = now()
  where id = p_session and recording_url is not null;
  if not found then raise exception 'No recording found for this session yet' using errcode = 'P0002'; end if;
end $$;

-- p_entries: [{"learner_id": "...", "status": "present|late|absent"}]
create or replace function public.save_register(p_session uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ses live_sessions; c classes; e jsonb; l learners; v_absent int := 0; v_present int := 0; v_late int := 0;
        v_prev uuid; v_flagged int := 0;
begin
  select * into ses from live_sessions where id = p_session;
  if ses.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  perform _require_class(ses.class_id);
  select * into c from classes where id = ses.class_id;

  select id into v_prev from live_sessions
    where class_id = ses.class_id and starts_at < ses.starts_at order by starts_at desc limit 1;

  for e in select * from jsonb_array_elements(p_entries) loop
    select * into l from learners where id = (e ->> 'learner_id')::uuid and class_id = ses.class_id;
    continue when l.id is null;
    insert into attendance (session_id, learner_id, status)
    values (ses.id, l.id, (e ->> 'status')::public.att_status)
    on conflict (session_id, learner_id) do update set status = excluded.status;

    case e ->> 'status'
      when 'present' then v_present := v_present + 1;
      when 'late' then v_late := v_late + 1;
      else
        v_absent := v_absent + 1;
        perform _notify(l.guardian_id, l.id, 'missed_class', 'Missed class',
          l.first_name || ' missed ' || to_char(_wat(ses.starts_at), 'FMDay') || '’s class.'
            || case when ses.recording_attached_at is not null then ' Watch the recording before the next class.' else '' end,
          jsonb_build_object('session_id', ses.id));
        perform _whatsapp(l.guardian_id, 'missed_class',
          l.first_name || ' missed today''s ' || c.name || ' class.'
            || case when ses.recording_url is not null then ' Recording: ' || ses.recording_url else '' end);
        -- Absent two sessions running: flag to the lead tutor(s).
        if v_prev is not null and exists (select 1 from attendance a where a.session_id = v_prev and a.learner_id = l.id and a.status = 'absent') then
          v_flagged := v_flagged + 1;
          insert into notifications (recipient_id, learner_id, kind, title, body)
          select p.id, l.id, 'absence_flag', 'Absent twice running',
                 l.first_name || ' ' || l.last_name || ' (' || c.name || ') has missed two classes in a row.'
          from profiles p where p.role = 'lead_tutor';
        end if;
    end case;
  end loop;

  update live_sessions set register_saved_at = now(), register_saved_by = auth.uid() where id = ses.id;
  perform _audit('Saved register', c.name || ' · ' || to_char(_wat(ses.starts_at), 'Dy FMDD Mon') || ' · ' || v_absent || ' absent');
  return jsonb_build_object('present', v_present, 'late', v_late, 'absent', v_absent, 'flagged', v_flagged);
end $$;

create or replace function public.schedule_task(
  p_class uuid, p_template uuid, p_title text, p_instructions text, p_steps text[],
  p_response_type public.resp_type, p_attachments jsonb, p_release_at timestamptz, p_due_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require_class(p_class);
  if trim(coalesce(p_title, '')) = '' then raise exception 'Give the task a title' using errcode = '22023'; end if;
  if p_due_at <= p_release_at then raise exception 'The deadline must be after the release time' using errcode = '22023'; end if;
  insert into tasks (class_id, template_id, title, instructions, steps, response_type, attachments, release_at, due_at, created_by)
  values (p_class, p_template, trim(p_title), p_instructions, coalesce(p_steps, '{}'), p_response_type,
          coalesce(p_attachments, '[]'), p_release_at, p_due_at, auth.uid())
  returning id into v_id;

  -- Parents hear about it when it opens, plus a reminder 3 hours before the deadline.
  insert into notifications (recipient_id, learner_id, kind, title, body, created_at)
  select l.guardian_id, l.id, 'new_task', 'New task',
         '“' || trim(p_title) || '” is open. Due ' || to_char(_wat(p_due_at), 'Dy FMHH12 am') || '.', p_release_at
  from learners l where l.class_id = p_class and l.status = 'active';
  insert into outbound_messages (channel, to_address, template, body, send_after)
  select 'whatsapp', g.phone, 'task_reminder',
         'Reminder: “' || trim(p_title) || '” is due at ' || to_char(_wat(p_due_at), 'FMHH12 am') || ' today.',
         p_due_at - interval '3 hours'
  from learners l join profiles g on g.id = l.guardian_id
  where l.class_id = p_class and l.status = 'active' and g.phone is not null;
  return v_id;
end $$;

-- ─── admin: placement ───────────────────────────────────────────────────────
create or replace function public.place_learner(p_learner uuid, p_class uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l learners; c classes; v_tutor text;
begin
  perform _require('owner', 'lead_tutor');
  select * into l from learners where id = p_learner for update;
  if l.id is null then raise exception 'Learner not found' using errcode = 'P0002'; end if;
  if l.status <> 'awaiting_placement' then raise exception 'This learner is not waiting for placement' using errcode = '22023'; end if;
  select * into c from classes where id = p_class for update;
  if public._filled(c.id) >= c.capacity then
    raise exception '% is full. Add the learner to its waitlist instead.', c.name using errcode = '23514';
  end if;
  update learners set class_id = c.id, status = 'active', placed_at = now() where id = l.id;
  delete from waitlist where learner_id = l.id;
  select display_name into v_tutor from profiles where id = c.tutor_id;

  perform _notify(l.guardian_id, l.id, 'placed', 'Welcome to ' || c.name,
    l.first_name || ' is in ' || c.name || ' with ' || coalesce(v_tutor, 'their tutor') || '. First class: '
      || coalesce(to_char(c.next_cohort_start, 'Dy FMDD Mon'), 'this weekend') || ', 5 pm WAT.');
  perform _whatsapp(l.guardian_id, 'welcome_guide',
    'Welcome to Flying Colours! ' || l.first_name || ' is in ' || c.name || '. Zoom: ' || coalesce(c.zoom_url, 'shared soon')
      || '. Timetable: ' || c.live_schedule || '.');
  if c.tutor_id is not null then
    perform _notify(c.tutor_id, l.id, 'new_learner', 'New learner', l.first_name || ' ' || l.last_name || ' joins ' || c.name || '.');
  end if;
  perform _audit('Placed learner', l.first_name || ' ' || l.last_name || ' → ' || c.name,
    jsonb_build_object('learner_id', l.id, 'class_id', c.id));
end $$;

create or replace function public.unplace_learner(p_learner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l learners; c classes;
begin
  perform _require('owner', 'lead_tutor');
  select * into l from learners where id = p_learner;
  if l.status <> 'active' or l.class_id is null then return; end if;
  select * into c from classes where id = l.class_id;
  update learners set class_id = null, status = 'awaiting_placement', placed_at = null where id = l.id;
  perform _audit('Undid placement', l.first_name || ' ' || l.last_name || ' ← ' || c.name);
end $$;

create or replace function public.add_to_waitlist(p_learner uuid, p_class uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l learners; c classes;
begin
  perform _require('owner', 'lead_tutor');
  select * into l from learners where id = p_learner;
  select * into c from classes where id = p_class;
  if l.id is null or c.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  insert into waitlist (learner_id, class_id, added_by) values (l.id, c.id, auth.uid()) on conflict do nothing;
  perform _audit('Added to waitlist', l.first_name || ' ' || l.last_name || ' → ' || c.name);
end $$;

create or replace function public.move_learner(p_learner uuid, p_class uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare l learners; c_from classes; c_to classes; v_tutor text;
begin
  perform _require('owner', 'lead_tutor');
  select * into l from learners where id = p_learner for update;
  if l.id is null or l.class_id is null then raise exception 'Learner is not in a class' using errcode = '22023'; end if;
  if l.class_id = p_class then raise exception 'Already in that class' using errcode = '22023'; end if;
  select * into c_to from classes where id = p_class for update;
  if public._filled(c_to.id) >= c_to.capacity then
    raise exception '% is full. Add the learner to its waitlist instead.', c_to.name using errcode = '23514';
  end if;
  select * into c_from from classes where id = l.class_id;
  update learners set class_id = c_to.id where id = l.id;
  insert into class_moves (learner_id, from_class_id, to_class_id, reason, moved_by)
  values (l.id, c_from.id, c_to.id, p_reason, auth.uid());
  select display_name into v_tutor from profiles where id = c_to.tutor_id;
  perform _notify(l.guardian_id, l.id, 'moved', 'Class change',
    l.first_name || ' now joins ' || c_to.name || ' with ' || coalesce(v_tutor, 'a new tutor') || '. Same Zoom times; new link in the welcome guide.');
  perform _whatsapp(l.guardian_id, 'class_change', l.first_name || ' has moved to ' || c_to.name || '. Zoom: ' || coalesce(c_to.zoom_url, ''));
  if c_to.tutor_id is not null then
    perform _notify(c_to.tutor_id, l.id, 'new_learner', 'Learner joined', l.first_name || ' ' || l.last_name || ' moved in from ' || c_from.name || '. Full history is on their profile.');
  end if;
  perform _audit('Moved learner', l.first_name || ' ' || l.last_name || ' · ' || c_from.name || ' → ' || c_to.name || ' · ' || p_reason);
end $$;

create or replace function public.reassign_tutor(p_class uuid, p_tutor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c classes; v_old text; v_new text;
begin
  perform _require('owner', 'lead_tutor');
  select * into c from classes where id = p_class for update;
  if not exists (select 1 from profiles where id = p_tutor and role in ('tutor', 'lead_tutor')) then
    raise exception 'Pick a tutor' using errcode = '22023';
  end if;
  if c.tutor_id = p_tutor then return; end if;
  select display_name into v_old from profiles where id = c.tutor_id;
  select display_name into v_new from profiles where id = p_tutor;
  update classes set tutor_id = p_tutor where id = c.id;
  perform _notify(p_tutor, null, 'class_assigned', 'New class', 'You now teach ' || c.name || '. Every learner''s history is on their profile.');
  perform _audit('Reassigned tutor', c.name || ' · ' || coalesce(v_old, '—') || ' → ' || v_new);
end $$;

create or replace function public.update_learner(p_learner uuid, p_age int, p_level public.learner_level, p_goals text, p_showcase boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l learners;
begin
  perform _require('owner', 'lead_tutor', 'customer_service');
  update learners set age = p_age, level = p_level, goals = coalesce(p_goals, ''), consent_showcase = p_showcase,
    needs_review = case when p_age is not null and class_id is not null then false else needs_review end
  where id = p_learner returning * into l;
  if l.id is null then raise exception 'Learner not found' using errcode = 'P0002'; end if;
  perform _audit('Edited learner', l.first_name || ' ' || l.last_name);
end $$;

create or replace function public.save_class(
  p_id uuid, p_name text, p_age_min int, p_age_max int, p_level public.learner_level, p_capacity int,
  p_zoom_url text, p_next_cohort date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require('owner', 'lead_tutor');
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name the class' using errcode = '22023'; end if;
  if p_age_min > p_age_max then raise exception 'Check the age range' using errcode = '22023'; end if;
  if p_id is null then
    insert into classes (name, age_min, age_max, level, capacity, zoom_url, next_cohort_start)
    values (trim(p_name), p_age_min, p_age_max, p_level, p_capacity, nullif(trim(p_zoom_url), ''), p_next_cohort)
    returning id into v_id;
    perform _audit('Created class', trim(p_name));
  else
    if p_capacity < public._filled(p_id) then
      raise exception 'Capacity can''t be below the % learners already in the class', public._filled(p_id) using errcode = '23514';
    end if;
    update classes set name = trim(p_name), age_min = p_age_min, age_max = p_age_max, level = p_level, capacity = p_capacity,
      zoom_url = nullif(trim(p_zoom_url), ''), next_cohort_start = p_next_cohort
    where id = p_id returning id into v_id;
    perform _audit('Edited class', trim(p_name));
  end if;
  return v_id;
end $$;

-- ─── admin: payments ────────────────────────────────────────────────────────
create or replace function public.decide_payment(p_payment uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p payments; v_parent text;
begin
  perform _require('owner', 'customer_service');
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if p.status <> 'pending_review' then raise exception 'This payment has already been decided' using errcode = '22023'; end if;
  select coalesce(nullif(display_name, ''), full_name) into v_parent from profiles where id = p.guardian_id;

  update payments set status = case when p_approve then 'approved' else 'rejected' end::public.pay_status,
    decided_by = auth.uid(), decided_at = now()
  where id = p.id;

  if p_approve then
    perform _activate_subscription(p.id);
  else
    perform _notify(p.guardian_id, p.learner_id, 'payment', 'Please resend your receipt',
      'We couldn''t match your transfer (ref ' || p.reference || ') to a bank alert. Upload the receipt again or message us on WhatsApp.');
    perform _whatsapp(p.guardian_id, 'payment_rejected',
      'We couldn''t confirm your transfer of ' || _naira(p.amount_minor, p.currency) || ' (ref ' || p.reference || '). Please resend proof of payment.');
  end if;
  perform _audit(case when p_approve then 'Approved payment' else 'Rejected payment' end,
    v_parent || ' · ' || _naira(p.amount_minor, p.currency) || ' · ' || p.reference);
end $$;

-- ─── admin: renewals ────────────────────────────────────────────────────────
create or replace function public.set_renewal_outcome(p_subscription uuid, p_outcome public.renewal_outcome)
returns void language plpgsql security definer set search_path = public as $$
declare s subscriptions; l learners;
begin
  perform _require('owner', 'customer_service');
  select * into s from subscriptions where id = p_subscription for update;
  if s.id is null then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if s.followup_outcome is not null then raise exception 'Undo the current outcome first' using errcode = '22023'; end if;
  select * into l from learners where id = s.learner_id;

  update subscriptions set followup_prev = jsonb_build_object(
      'status', s.status, 'ends_on', s.ends_on, 'grace_until', s.grace_until,
      'balance_minor', s.balance_minor, 'learner_status', l.status, 'class_id', l.class_id),
    followup_outcome = p_outcome
  where id = s.id;

  case p_outcome
    when 'renewed' then
      update subscriptions set status = 'active', ends_on = (greatest(ends_on, current_date) + interval '12 months')::date,
        grace_until = null where id = s.id;
    when 'grace' then
      update subscriptions set status = 'grace', grace_until = greatest(ends_on, current_date) + 7 where id = s.id;
      perform _whatsapp(l.guardian_id, 'grace_period',
        l.first_name || ' keeps their place for 7 more days while you renew.');
    when 'exit' then
      update subscriptions set status = 'exited' where id = s.id;
      update learners set status = 'exited', class_id = null where id = l.id;
  end case;
  perform _audit('Renewal outcome: ' || p_outcome, l.first_name || ' ' || l.last_name);
end $$;

create or replace function public.clear_renewal_outcome(p_subscription uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s subscriptions; l learners;
begin
  perform _require('owner', 'customer_service');
  select * into s from subscriptions where id = p_subscription for update;
  if s.followup_prev is null then return; end if;
  update subscriptions set
    status = (s.followup_prev ->> 'status')::public.sub_status,
    ends_on = (s.followup_prev ->> 'ends_on')::date,
    grace_until = (s.followup_prev ->> 'grace_until')::date,
    balance_minor = (s.followup_prev ->> 'balance_minor')::bigint,
    followup_outcome = null, followup_prev = null
  where id = s.id;
  update learners set status = (s.followup_prev ->> 'learner_status')::public.learner_status,
    class_id = (s.followup_prev ->> 'class_id')::uuid
  where id = s.learner_id
  returning * into l;
  perform _audit('Undid renewal outcome', l.first_name || ' ' || l.last_name);
end $$;

-- ─── admin: announcements ───────────────────────────────────────────────────
create or replace function public.announcement_reach(p_audience public.ann_audience, p_class uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'learners', count(*),
    'families', count(distinct guardian_id))
  from learners
  where status = 'active' and (p_audience <> 'class' or class_id = p_class)
$$;

create or replace function public.send_announcement(
  p_audience public.ann_audience, p_class uuid, p_message text, p_channels text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_reach int; v_target text;
begin
  -- Office staff message anyone; a tutor can send a correction note to their own class.
  if not (public.has_role('owner', 'lead_tutor', 'customer_service')
          or (p_audience = 'class' and public.has_role('tutor') and public.can_teach_class(p_class))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if trim(coalesce(p_message, '')) = '' then raise exception 'Write a message first' using errcode = '22023'; end if;
  if coalesce(array_length(p_channels, 1), 0) = 0 then raise exception 'Pick at least one channel' using errcode = '22023'; end if;
  if p_audience = 'class' and p_class is null then raise exception 'Pick a class' using errcode = '22023'; end if;

  insert into announcements (audience, class_id, message, channels, sent_by)
  values (p_audience, case when p_audience = 'class' then p_class end, trim(p_message), p_channels, auth.uid())
  returning id into v_id;

  -- Every family gets an in-app copy, so parents who miss the WhatsApp or
  -- email still see it. One entry per guardian.
  with fam as (
    select distinct l.guardian_id from learners l
    where l.status = 'active' and (p_audience <> 'class' or l.class_id = p_class)
  ), ins as (
    insert into notifications (recipient_id, announcement_id, kind, title, body)
    select guardian_id, v_id, 'announcement', 'Announcement', trim(p_message) from fam
    returning recipient_id
  )
  select count(*) into v_reach from ins;

  if 'whatsapp' = any (p_channels) then
    insert into outbound_messages (channel, to_address, template, body, data)
    select distinct 'whatsapp'::public.msg_channel, g.phone, 'announcement', trim(p_message), jsonb_build_object('announcement_id', v_id)
    from learners l join profiles g on g.id = l.guardian_id
    where l.status = 'active' and (p_audience <> 'class' or l.class_id = p_class) and g.phone is not null;
  end if;
  if 'email' = any (p_channels) then
    insert into outbound_messages (channel, to_address, template, body, data)
    select distinct 'email'::public.msg_channel, g.email, 'announcement', trim(p_message), jsonb_build_object('announcement_id', v_id)
    from learners l join profiles g on g.id = l.guardian_id
    where l.status = 'active' and (p_audience <> 'class' or l.class_id = p_class) and g.email is not null;
  end if;

  update announcements set reach = v_reach where id = v_id;
  select case p_audience when 'class' then (select name from classes where id = p_class)
    when 'all_learners' then 'All learners' else 'All parents' end into v_target;
  perform _audit('Sent announcement', v_target || ' · ' || v_reach || ' families');
  return jsonb_build_object('id', v_id, 'reach', v_reach);
end $$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now() where recipient_id = auth.uid() and read_at is null and created_at <= now()
$$;

-- ─── admin: import (rows already validated by the import edge function) ────
-- p_rows: [{guardian_id, first_name, last_name, age, goals, class_id, paid_on, amount_minor}]
create or replace function public.import_learner_rows(p_filename text, p_total int, p_rows jsonb, p_skipped int, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_learner uuid; v_sub uuid; v_imported int := 0; v_review int := 0; v_id uuid; v_actor text;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into learners (guardian_id, first_name, last_name, age, level, goals, status, class_id, placed_at,
                          needs_review, consent_data, consent_recordings)
    values ((r ->> 'guardian_id')::uuid, r ->> 'first_name', coalesce(r ->> 'last_name', ''),
            nullif(r ->> 'age', '')::int, coalesce((r ->> 'level')::public.learner_level, 'beginner'),
            coalesce(r ->> 'goals', ''),
            case when r ->> 'class_id' is not null then 'active' else 'awaiting_placement' end::public.learner_status,
            nullif(r ->> 'class_id', '')::uuid, case when r ->> 'class_id' is not null then now() end,
            (r ->> 'age') is null or (r ->> 'class_id') is null, true, true)
    returning id into v_learner;
    if (r ->> 'age') is null or (r ->> 'class_id') is null then v_review := v_review + 1; end if;
    if r ->> 'paid_on' is not null then
      insert into subscriptions (learner_id, plan_id, starts_on, ends_on, status, balance_minor)
      values (v_learner, 'annual', (r ->> 'paid_on')::date, ((r ->> 'paid_on')::date + interval '12 months')::date,
              case when ((r ->> 'paid_on')::date + interval '12 months') < current_date then 'expired' else 'active' end::public.sub_status, 0)
      returning id into v_sub;
      insert into payments (learner_id, guardian_id, subscription_id, description, amount_minor, method, provider,
                            reference, status, sent_at, decided_at)
      values (v_learner, (r ->> 'guardian_id')::uuid, v_sub, 'Annual (imported)', coalesce((r ->> 'amount_minor')::bigint, 12000000),
              'transfer', 'import', 'IMP-' || substr(v_learner::text, 1, 8), 'approved', (r ->> 'paid_on')::date, now());
    end if;
    v_imported := v_imported + 1;
  end loop;

  select coalesce(nullif(display_name, ''), full_name) into v_actor from profiles where id = p_actor;
  insert into imports (filename, total_rows, imported, guardians, classes, needs_review, skipped_duplicates, created_by)
  values (p_filename, p_total, v_imported,
          (select count(distinct r2 ->> 'guardian_id') from jsonb_array_elements(p_rows) r2),
          (select count(distinct r2 ->> 'class_id') from jsonb_array_elements(p_rows) r2 where r2 ->> 'class_id' is not null),
          v_review, p_skipped, p_actor)
  returning id into v_id;
  insert into audit_log (actor_id, actor_name, actor_role, action, target)
  values (p_actor, coalesce(v_actor, 'System'), 'Owner', 'Imported learners', p_filename || ' · ' || v_imported || ' learners');
  return (select to_jsonb(i) from imports i where i.id = v_id);
end $$;

-- ─── learner PIN (used by the learner-auth edge function) ──────────────────
create or replace function public.set_learner_pin(p_learner uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'The PIN must be 4 digits' using errcode = '22023'; end if;
  update learners set pin_hash = crypt(p_pin, gen_salt('bf'))
  where id = p_learner and guardian_id = auth.uid();
  if not found then raise exception 'Learner not found' using errcode = 'P0002'; end if;
end $$;

-- Service role only. Locks after 5 wrong tries in 15 minutes.
create or replace function public.check_learner_pin(p_learner uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_fails int; v_ok boolean;
begin
  select count(*) into v_fails from learner_pin_attempts
    where learner_id = p_learner and not ok and at > now() - interval '15 minutes';
  if v_fails >= 5 then return 'locked'; end if;
  select pin_hash into v_hash from learners where id = p_learner;
  if v_hash is null then return 'no_pin'; end if;
  v_ok := crypt(p_pin, v_hash) = v_hash;
  insert into learner_pin_attempts (learner_id, ok) values (p_learner, v_ok);
  return case when v_ok then 'ok' else 'wrong' end;
end $$;

-- ─── WhatsApp OTP: Supabase Auth "send SMS" hook ────────────────────────────
-- Auth calls this instead of an SMS provider; the code goes to the outbox and
-- the dispatch-messages function delivers it over WhatsApp.
create or replace function public.hook_send_whatsapp_otp(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into outbound_messages (channel, to_address, template, body, data)
  values ('whatsapp', event -> 'user' ->> 'phone', 'otp',
          'Your Flying Colours code is ' || (event -> 'sms' ->> 'otp') || '. It expires in 10 minutes.',
          jsonb_build_object('otp', event -> 'sms' ->> 'otp'));
  return '{}'::jsonb;
end $$;

grant execute on function public.hook_send_whatsapp_otp(jsonb) to supabase_auth_admin;
grant insert on public.outbound_messages to supabase_auth_admin;

-- ─── lock down execute rights ───────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Internal helpers and service-only functions: no API access at all.
revoke execute on function public._audit(text, text, jsonb) from authenticated;
revoke execute on function public._audit_system(text, text, text, jsonb) from authenticated;
revoke execute on function public._notify(uuid, uuid, text, text, text, jsonb, timestamptz) from authenticated;
revoke execute on function public._whatsapp(uuid, text, text, jsonb, timestamptz) from authenticated;
revoke execute on function public._activate_subscription(uuid) from authenticated;
revoke execute on function public.mark_payment_verified(text, text) from authenticated;
revoke execute on function public.import_learner_rows(text, int, jsonb, int, uuid) from authenticated;
revoke execute on function public.check_learner_pin(uuid, text) from authenticated;
revoke execute on function public.hook_send_whatsapp_otp(jsonb) from authenticated;
grant execute on function public.mark_payment_verified(text, text) to service_role;
grant execute on function public.import_learner_rows(text, int, jsonb, int, uuid) to service_role;
grant execute on function public.check_learner_pin(uuid, text) to service_role;
