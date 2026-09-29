-- Flying Colours — demo data (local development only).
-- Dates are anchored to the current week (WAT), so the demo always looks like
-- "this week": Monday's task is being corrected, Wednesday's is scheduled.
--
-- Staff sign in with email + password "flyingcolours":
--   hassan@flyingcolours.test   Owner
--   ronke@flyingcolours.test    Lead tutor
--   blessing@flyingcolours.test Customer service
--   adaeze@flyingcolours.test   Tutor (Starlight Readers)
-- Parent: WhatsApp +234 803 412 7765, code 482913 (supabase/config.toml test_otp).
-- Learner PINs: Tolu 1234, Dami 5678.

create or replace function pg_temp.seed_user(
  p_email text, p_phone text, p_role public.app_role, p_full text, p_display text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
    phone_change_token, email_change_token_current, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, case when p_email is not null then extensions.crypt('flyingcolours', extensions.gen_salt('bf')) end,
    case when p_email is not null then now() end,
    p_phone, case when p_phone is not null then now() end,
    jsonb_build_object('provider', case when p_email is not null then 'email' else 'phone' end,
      'providers', jsonb_build_array(case when p_email is not null then 'email' else 'phone' end), 'role', p_role),
    jsonb_build_object('full_name', p_full, 'display_name', p_display),
    now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_strip_nulls(jsonb_build_object('sub', v_id::text, 'email', p_email, 'phone', p_phone)),
    case when p_email is not null then 'email' else 'phone' end, now(), now(), now());
  return v_id;
end $$;

do $seed$
declare
  mon date := (now() at time zone 'Africa/Lagos')::date - (extract(isodow from (now() at time zone 'Africa/Lagos'))::int - 1);
  hassan uuid; ronke uuid; blessing uuid; adaeze uuid; tunde uuid; ruth uuid; segun uuid;
  funmi uuid;
  c_lv uuid; c_sr uuid; c_we uuid; c_bs uuid; c_ya uuid;
  tolu uuid; dami uuid;
  g uuid; l uuid; s uuid; t uuid; t_food uuid; sub uuid; ses uuid;
  i int; k int;
  kid record;
  first_names text[] := array['Adaora','Bolu','Chinedu','Damilola','Efe','Folake','Gbenga','Hauwa','Ikenna','Jumoke',
    'Kelechi','Lola','Mayowa','Nkechi','Obinna','Precious','Rotimi','Sade','Tamuno','Uche','Victor','Wale','Yetunde',
    'Zara','Amaka','Babajide','Chiamaka','Dayo','Ebere','Funke','Ifeoma','Jide','Kunle','Lami','Mide','Nnamdi','Onyinye',
    'Seyi','Temi','Uzo','Yinka','Abiola','Bisi','Chuka','Dupe','Ejiro','Femi','Ijeoma','Kayode','Morenike','Oyin',
    'Somto','Tobiloba','Ada','Ebuka','Fisayo','Gozie','Ireti','Kachi','Nifemi','Olamide','Rahma','Sumbo','Tosin','Ugo'];
  last_names text[] := array['Adekunle','Balogun','Chukwu','Danjuma','Egwu','Fashola','Gambo','Ibekwe','Johnson','Kalu',
    'Lawson','Mohammed','Nwachukwu','Ogunleye','Oyelaran','Peters','Salami','Taiwo','Umeh','Williams','Yusuf','Anozie',
    'Bassey','Coker','Dike','Ekpo','Ogbu','Idowu','Ajayi','Okonkwo'];
  fill_i int := 0;
  scores_p int[] := array[3,3,3,4,3,4,4,4];
  scores_g int[] := array[2,2,3,2,3,3,3,3];
  scores_f int[] := array[3,3,4,4,4,4,5,4];
  scores_c int[] := array[2,3,3,3,4,4,4,5];
  past_titles text[] := array['The Rain Song','Picture talk: the market','My best friend','Read “Hot Akara” aloud',
    'Show and tell','My school bus','Animals at the zoo','Hello, my name is'];
  past_written text[] := array['Lovely clear reading, Tolu! Slow down on the long words.',
    'You spoke up without being asked — well done!', 'Clear voice. Watch past tense: goed → went.',
    'Lovely expression when reading the poem.', 'Great eye contact. Try one more sentence next time.',
    'Good describing words. Say “the bus is yellow”, not “the bus yellow”.', 'Big improvement in confidence!',
    'Nice clear start. Speak a little louder.'];
begin
  perform setseed(0.14);
  insert into public.school_settings (term_starts_on) values (mon - 13 * 7);

  -- ─── staff ────────────────────────────────────────────────────────────────
  hassan   := pg_temp.seed_user('hassan@flyingcolours.test', null, 'owner', 'Hassan Bello', 'Hassan');
  ronke    := pg_temp.seed_user('ronke@flyingcolours.test', null, 'lead_tutor', 'Ronke Alade', 'Mrs Ronke');
  blessing := pg_temp.seed_user('blessing@flyingcolours.test', null, 'customer_service', 'Blessing Akpan', 'Blessing A.');
  adaeze   := pg_temp.seed_user('adaeze@flyingcolours.test', null, 'tutor', 'Adaeze Obi', 'Ms Adaeze');
  tunde    := pg_temp.seed_user('tunde@flyingcolours.test', null, 'tutor', 'Tunde Bakare', 'Mr Tunde');
  ruth     := pg_temp.seed_user('ruth@flyingcolours.test', null, 'tutor', 'Ruth Okon', 'Ms Ruth');
  segun    := pg_temp.seed_user('segun@flyingcolours.test', null, 'tutor', 'Segun Ade', 'Mr Segun');
  update public.profiles set two_factor = true, last_active_at = now() where id in (hassan, ronke, blessing, adaeze, tunde, segun);
  update public.profiles set last_active_at = now() - interval '12 minutes' where id = ronke;
  update public.profiles set last_active_at = now() - interval '1 hour' where id = blessing;
  update public.profiles set last_active_at = now() - interval '1 day' where id = tunde;
  update public.profiles set last_active_at = now() - interval '3 days' where id = ruth;

  -- ─── plans ────────────────────────────────────────────────────────────────
  insert into public.plans (id, name, price_label, description, due_today_minor, total_minor, currency, instalments, sort) values
    ('annual', 'Annual', '₦120,000', 'One payment for 12 months.', 12000000, 12000000, 'NGN', 1, 1),
    ('instal', 'Annual in 3 instalments', '3 × ₦42,000', 'Today, then again in 3 and 6 months. We remind you before each one.', 4200000, 12600000, 'NGN', 3, 2),
    ('usd', 'Diaspora annual', '$150', 'Pay by card in USD. Class times shown in your time zone.', 15000, 15000, 'USD', 1, 3);

  -- ─── classes ──────────────────────────────────────────────────────────────
  insert into public.classes (name, age_min, age_max, level, capacity, tutor_id, zoom_url, next_cohort_start, legacy_group_key) values
    ('Little Voices', 5, 6, 'starter', 20, segun, 'zoom.us/j/81234 5521', mon + 12, 'little'),
    ('Starlight Readers', 7, 9, 'beginner', 20, adaeze, 'zoom.us/j/84410 5521', mon + 12, 'starlight'),
    ('Word Explorers', 7, 9, 'beginner', 20, ruth, 'zoom.us/j/86022 5521', mon + 12, 'explorers'),
    ('Bold Speakers', 10, 12, 'intermediate', 20, tunde, 'zoom.us/j/83317 5521', mon + 12, 'bold'),
    ('Young Authors', 10, 13, 'advanced', 16, ruth, 'zoom.us/j/85590 5521', mon + 19, 'authors');
  select id into c_lv from public.classes where name = 'Little Voices';
  select id into c_sr from public.classes where name = 'Starlight Readers';
  select id into c_we from public.classes where name = 'Word Explorers';
  select id into c_bs from public.classes where name = 'Bold Speakers';
  select id into c_ya from public.classes where name = 'Young Authors';

  -- ─── the Adeyemi family ───────────────────────────────────────────────────
  funmi := pg_temp.seed_user(null, '2348034127765', 'parent', 'Funmi Adeyemi', 'Mrs F. Adeyemi');
  update public.profiles set email = 'funmi.adeyemi@gmail.com', consent_data = true, consent_recordings = true, consent_at = now() where id = funmi;
  insert into public.learners (guardian_id, first_name, last_name, age, level, goals, status, class_id, placed_at,
      consent_data, consent_recordings, created_at, user_id, pin_hash)
  values (funmi, 'Tolu', 'Adeyemi', 8, 'beginner', 'Read aloud with confidence; speak up in class.', 'active', c_sr,
      (mon - 364) + time '10:00', true, true, (mon - 361) + time '09:00',
      pg_temp.seed_user('learner.tolu@learners.flyingcolours.test', null, 'learner', 'Tolu Adeyemi', 'Tolu'),
      extensions.crypt('1234', extensions.gen_salt('bf')))
  returning id into tolu;
  insert into public.learners (guardian_id, first_name, last_name, age, level, goals, status, class_id, placed_at,
      consent_data, consent_recordings, created_at, user_id, pin_hash)
  values (funmi, 'Dami', 'Adeyemi', 11, 'intermediate', 'Debate and persuasive speaking.', 'active', c_bs,
      now() - interval '200 days', true, true, now() - interval '202 days',
      pg_temp.seed_user('learner.dami@learners.flyingcolours.test', null, 'learner', 'Dami Adeyemi', 'Dami'),
      extensions.crypt('5678', extensions.gen_salt('bf')))
  returning id into dami;
  insert into public.class_moves (learner_id, from_class_id, to_class_id, reason, moved_by, moved_at)
  values (tolu, c_we, c_sr, 'Level up', ronke, now() - interval '120 days');

  -- ─── Starlight Readers roster (the review queue) ──────────────────────────
  for kid in select * from (values
      ('Amara','Okafor',8,'Mrs C. Okafor','2348031110001'), ('Ife','Olatunji',8,'Mr S. Olatunji','2348031110002'),
      ('Emeka','Ude',9,'Mr P. Ude','2348031110003'), ('Chidi','Eze',9,'Mrs Ngozi Eze','2348031110004'),
      ('Kemi','Adebayo',7,'Mrs T. Adebayo','2348031110005'), ('Halima','Musa',8,'Mr Ibrahim Musa','2348031110006'),
      ('Ngozi','Ibe',9,'Mrs E. Ibe','2348031110007'), ('Zainab','Bello',7,'Mrs H. Bello','2348031110008'),
      ('David','Obi',8,'Mrs R. Obi','2348031110009'), ('Blessing','Nwosu',9,'Mrs J. Nwosu','2348031110010'),
      ('Tobi','Lawal',7,'Mr D. Lawal','2348031110011'), ('Kene','Madu',8,'Mrs O. Madu','2348031110012'),
      ('Simi','Ogun',7,'Mr L. Ogun','2348031110013'), ('Tunde','Ajayi',9,'Mrs P. Ajayi','2348031110014'),
      ('Ada','Eke',8,'Mrs U. Eke','2348031110015'), ('Rukky','Idris',8,'Mr A. Idris','2348031110016')
    ) v(fn, ln, age, parent, phone)
  loop
    g := pg_temp.seed_user(null, kid.phone, 'parent', kid.parent, kid.parent);
    update public.profiles set consent_data = true, consent_recordings = true where id = g;
    insert into public.learners (guardian_id, first_name, last_name, age, level, status, class_id, placed_at, consent_data, consent_recordings, created_at)
    values (g, kid.fn, kid.ln, kid.age, 'beginner', 'active', c_sr, now() - interval '150 days', true, true, now() - interval '152 days');
  end loop;

  -- ─── fill the other classes to their real sizes ───────────────────────────
  for kid in select * from (values (c_lv, 18, 5, 'starter'), (c_we, 20, 8, 'beginner'), (c_bs, 14, 11, 'intermediate'), (c_ya, 12, 11, 'advanced'))
    v(cid, n, base_age, lvl)
  loop
    for i in 1..kid.n loop
      fill_i := fill_i + 1;
      g := pg_temp.seed_user(null, '23480320' || lpad(fill_i::text, 5, '0'), 'parent',
        'Mrs ' || last_names[1 + (fill_i % array_length(last_names, 1))], 'Mrs ' || last_names[1 + (fill_i % array_length(last_names, 1))]);
      insert into public.learners (guardian_id, first_name, last_name, age, level, status, class_id, placed_at, consent_data, consent_recordings, created_at)
      values (g, first_names[1 + (fill_i % array_length(first_names, 1))], last_names[1 + (fill_i % array_length(last_names, 1))],
        kid.base_age + (i % 2), kid.lvl::public.learner_level, 'active', kid.cid, now() - (fill_i || ' days')::interval,
        true, true, now() - ((fill_i + 2) || ' days')::interval);
      insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status)
      select id, 'annual', mon - 100 - fill_i, mon + 265 - fill_i, 'active' from public.learners where guardian_id = g;
    end loop;
  end loop;
  -- One new learner this week.
  update public.learners set placed_at = mon + time '11:40', created_at = mon - 3 where id = (
    select id from public.learners where class_id = c_lv order by created_at desc limit 1);

  -- ─── subscriptions for Starlight + the Adeyemis ───────────────────────────
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status)
  select id, 'annual', mon - 300, mon + 60, 'active' from public.learners
  where class_id = c_sr and first_name not in ('Tolu','Emeka','Blessing','Ife','David','Kemi','Tobi','Halima');
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, balance_minor) values
    (tolu, 'annual', mon + 7 - 365, mon + 7, 'active', 0),
    (dami, 'annual', mon - 200, (extract(year from mon)::int + 1 || '-03-14')::date, 'active', 0);
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status)
  select id, 'annual', mon + 5 - 365, mon + 5, 'active' from public.learners where first_name = 'Emeka' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status)
  select id, 'annual', mon + 8 - 365, mon + 8, 'active' from public.learners where first_name = 'Blessing' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status)
  select id, 'annual', mon - 2 - 365, mon - 2, 'expired' from public.learners where first_name = 'Ife' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, grace_until)
  select id, 'annual', mon - 8 - 365, mon - 8, 'grace', mon + 6 from public.learners where first_name = 'David' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, balance_minor, instalments_paid, next_instalment_due)
  select id, 'instal', mon - 130, mon + 235, 'active', 8400000, 1, mon - 8 from public.learners where first_name = 'Kemi' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, balance_minor, instalments_paid, next_instalment_due)
  select id, 'instal', mon - 190, mon + 175, 'active', 4200000, 2, mon - 1 from public.learners where first_name = 'Tobi' and class_id = c_sr;
  insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, balance_minor, instalments_paid, next_instalment_due)
  select id, 'instal', mon - 95, mon + 270, 'active', 8400000, 1, mon + 1 from public.learners where first_name = 'Halima' and class_id = c_sr;

  insert into public.renewal_reminders (subscription_id, kind, sent_at)
  select s.id, x.kind, x.at from public.subscriptions s join public.learners l on l.id = s.learner_id
  cross join lateral (values
    ('Tolu', '7d', mon + time '09:00'), ('Emeka', '7d', mon - 2 + time '09:00'), ('Emeka', '3d', mon + 2 + time '09:00'),
    ('Ife', '7d', mon - 9 + time '09:00'), ('Ife', '3d', mon - 5 + time '09:00'), ('Ife', 'expiry', mon - 2 + time '09:00'),
    ('David', 'expiry', mon - 8 + time '09:00'), ('David', 'call', mon - 5 + time '12:00'), ('David', 'call', mon - 1 + time '12:00'),
    ('Kemi', 'instalment', mon - 8 + time '09:00'), ('Kemi', 'instalment', mon - 4 + time '09:00'), ('Kemi', 'instalment', mon + time '09:00'),
    ('Tobi', 'instalment', mon + time '09:00')
  ) x(fn, kind, at)
  where l.first_name = x.fn and l.class_id = c_sr and s.status <> 'pending'
    and (x.at < now());

  -- ─── live sessions: the last four weekends and the next one ──────────────
  for k in 0..4 loop
    insert into public.live_sessions (class_id, starts_at, ends_at, register_saved_at, register_saved_by, recording_url, recording_minutes, recording_found_at, recording_attached_at)
    select c.id, public._wat_at(d, '17:00'), public._wat_at(d, '18:00'),
      case when k > 0 then public._wat_at(d, '18:15') end, case when k > 0 then c.tutor_id end,
      case when k > 0 then 'https://zoom.us/rec/share/' || substr(md5(c.id::text || d::text), 1, 12) end,
      case when k > 0 then 58 end, case when k > 0 then public._wat_at(d, '18:02') end,
      -- Last Sunday's Starlight recording is found but not yet attached (the register screen's demo).
      case when k > 0 and not (k = 1 and extract(isodow from d) = 7 and c.id = c_sr) then public._wat_at(d, '18:30') end
    from public.classes c
    cross join lateral (values (mon - 2 - (k - 1) * 7), (mon - 1 - (k - 1) * 7)) days(d);
  end loop;

  -- Attendance for past sessions: mostly present.
  insert into public.attendance (session_id, learner_id, status)
  select ls.id, l.id, case when random() < 0.07 then 'absent' when random() < 0.06 then 'late' else 'present' end::public.att_status
  from public.live_sessions ls join public.learners l on l.class_id = ls.class_id and l.status = 'active'
  where ls.starts_at < now() and l.id <> tolu and l.id <> dami;
  -- Tolu: P P P L P P A P, oldest to newest.
  insert into public.attendance (session_id, learner_id, status)
  select id, tolu, (array['present','present','present','late','present','present','absent','present'])[rn]::public.att_status
  from (select id, row_number() over (order by starts_at) rn from public.live_sessions where class_id = c_sr and starts_at < now()) x;
  insert into public.attendance (session_id, learner_id, status)
  select id, dami, 'present' from public.live_sessions where class_id = c_bs and starts_at < now();
  -- Last Sunday in Starlight: exactly David and Tobi absent; Saturday: only Tolu absent.
  update public.attendance a set status = case when l.first_name in ('David','Tobi') then 'absent' else 'present' end::public.att_status
  from public.learners l, public.live_sessions ls
  where a.learner_id = l.id and a.session_id = ls.id and ls.class_id = c_sr and ls.starts_at = public._wat_at(mon - 1, '17:00');
  update public.attendance a set status = case when a.learner_id = tolu then 'absent' else 'present' end::public.att_status
  from public.live_sessions ls
  where a.session_id = ls.id and ls.class_id = c_sr and ls.starts_at = public._wat_at(mon - 2, '17:00');

  -- ─── curriculum bank ──────────────────────────────────────────────────────
  insert into public.task_templates (level, name, response_type, title, instructions, steps, attachments, sort)
  select lvl, x.name, x.rt::public.resp_type, x.title, x.ins, x.steps, x.att::jsonb, x.sort
  from unnest(enum_range(null::public.learner_level)) lvl
  cross join (values
    ('Picture talk', 'video', 'Describe the market picture', 'Look at the market picture. Say five things you can see, using colour words.',
      array['Look carefully at the market picture.','Say five things you can see.','Use a colour word for each one.'], '[{"name":"Market picture.pdf"}]', 1),
    ('Retell a story', 'video', 'Kola and the Kite: tell it your way', 'Read the story sheet with a grown-up. Tell the story in your own words, then say what you would do if you were Kola.',
      array['Read the story sheet with a grown-up.','Tell the story in your own words.','Say what you would do if you were Kola.'], '[{"name":"Story sheet.pdf"},{"name":"Example video · 0:40"}]', 2),
    ('Read aloud', 'audio', 'Read “The Rain Song” aloud', 'Read the poem slowly and clearly. Take a breath at each full stop.',
      array['Read the poem once to yourself.','Read it aloud slowly and clearly.','Take a breath at each full stop.'], '[{"name":"The Rain Song.pdf"}]', 3),
    ('Write five sentences', 'photo', 'My weekend in five sentences', 'Write five sentences about your weekend. Use “first”, “then” and “finally”. Take a photo of your page.',
      array['Write five sentences about your weekend.','Use “first”, “then” and “finally”.','Take a clear photo of your page.'], '[]', 4),
    ('Show and tell', 'video', 'Show and tell: something special', 'Show us something special from home. Say what it is, who gave it to you and why you like it.',
      array['Pick something special from home.','Say what it is and who gave it to you.','Say why you like it.'], '[]', 5)
  ) x(name, rt, title, ins, steps, att, sort);

  -- ─── tasks ────────────────────────────────────────────────────────────────
  -- This week: Monday task in every class; Starlight also has Wednesday's scheduled.
  insert into public.tasks (class_id, title, instructions, steps, response_type, release_at, due_at, created_by)
  select c.id, case when c.id = c_bs then 'Debate: school uniforms' else 'My favourite food' end,
    case when c.id = c_bs then 'Give two reasons for or against school uniforms. Use “however” and “therefore”.'
         else 'Show us your favourite food and describe how it looks, smells and tastes.' end,
    array['Pick your favourite food.','Say what it looks, smells and tastes like.','Say when you like to eat it.'],
    'video', public._wat_at(mon, '09:00'), public._wat_at(mon + 1, '15:00'), c.tutor_id
  from public.classes c;
  select id into t_food from public.tasks where class_id = c_sr and release_at = public._wat_at(mon, '09:00');
  insert into public.tasks (class_id, title, instructions, steps, response_type, attachments, release_at, due_at, created_by)
  values (c_sr, 'Kola and the Kite: tell the story your way',
    'Read the story sheet with a grown-up. Tell the story in your own words, then say what you would do if you were Kola.',
    array['Read the story sheet with a grown-up.','Tell the story in your own words.','Say what you would do if you were Kola.'],
    'video', '[{"name":"Story sheet.pdf"},{"name":"Example video · 0:40"}]', public._wat_at(mon + 2, '09:00'), public._wat_at(mon + 3, '15:00'), adaeze);

  -- Monday's submissions in Starlight Readers.
  insert into public.submissions (task_id, learner_id, media_path, duration_seconds, submitted_at)
  select t_food, l.id, null, x.dur, public._wat_at(mon + x.day, x.at::time)
  from public.learners l join (values
    ('Amara',0,'18:15',72), ('Tolu',0,'19:42',58), ('Ife',0,'20:20',90), ('Emeka',0,'21:10',65), ('Chidi',1,'09:02',108),
    ('Kemi',1,'11:45',41), ('Halima',1,'13:30',80), ('Ngozi',1,'14:55',117), ('Zainab',1,'16:10',62),
    ('Kene',0,'17:30',70), ('Simi',0,'18:05',55), ('Tunde',0,'19:15',84), ('Ada',0,'20:01',77), ('Rukky',0,'20:40',66)
  ) x(fn, day, at, dur) on x.fn = l.first_name
  where l.class_id = c_sr;
  -- Already reviewed today.
  insert into public.feedback (submission_id, tutor_id, scores, tags, written, release_at, review_seconds, created_at)
  select s.id, adaeze, '{"pronunciation":4,"grammar":3,"fluency":4,"confidence":4}', array['Grammar'],
    'Great describing words! Watch your past tense.', public._correction_release(public._wat_at(mon + 1, '15:00')),
    200 + (random() * 150)::int, now() - interval '2 hours'
  from public.submissions s join public.learners l on l.id = s.learner_id
  where s.task_id = t_food and l.first_name in ('Ife','Emeka','Kene','Simi','Tunde');

  -- Other classes: most learners submitted Monday's task; some reviewed.
  insert into public.submissions (task_id, learner_id, duration_seconds, submitted_at)
  select t.id, l.id, 40 + (random() * 80)::int, public._wat_at(mon, '17:00') + (random() * interval '20 hours')
  from public.tasks t join public.learners l on l.class_id = t.class_id and l.status = 'active'
  where t.release_at = public._wat_at(mon, '09:00') and t.class_id <> c_sr and random() < 0.8;
  insert into public.feedback (submission_id, tutor_id, scores, tags, written, release_at, review_seconds, created_at)
  select s.id, c.tutor_id, '{"pronunciation":4,"grammar":3,"fluency":4,"confidence":4}', '{}', 'Well done.',
    public._correction_release(t.due_at), 180 + (random() * 200)::int, now() - interval '1 hour'
  from public.submissions s join public.tasks t on t.id = s.task_id join public.classes c on c.id = t.class_id
  where t.release_at = public._wat_at(mon, '09:00') and t.class_id <> c_sr and random() < 0.7;

  -- Eight past weeks in Starlight: Wednesday tasks with Tolu's work and feedback.
  for i in 1..8 loop
    insert into public.tasks (class_id, title, instructions, steps, response_type, release_at, due_at, created_by)
    values (c_sr, past_titles[i], 'See the story sheet.', '{}', case when i in (1, 4) then 'audio' else 'video' end::public.resp_type,
      public._wat_at(mon - 7 * i + 2, '09:00'), public._wat_at(mon - 7 * i + 3, '15:00'), adaeze)
    returning id into t;
    insert into public.submissions (task_id, learner_id, duration_seconds, submitted_at)
    select t, l.id, 50 + (random() * 60)::int, public._wat_at(mon - 7 * i + 2, '18:00') + (random() * interval '18 hours')
    from public.learners l where l.class_id = c_sr and (l.id = tolu or random() < 0.8);
    insert into public.feedback (submission_id, tutor_id, scores, tags, written, voice_note_seconds, release_at, review_seconds, created_at, seen_at)
    select s.id, adaeze,
      case when s.learner_id = tolu then jsonb_build_object('pronunciation', scores_p[9 - i], 'grammar', scores_g[9 - i],
        'fluency', scores_f[9 - i], 'confidence', scores_c[9 - i]) else '{"pronunciation":4,"grammar":3,"fluency":4,"confidence":3}' end,
      case when s.learner_id = tolu then array[(array['Fluency','Confidence','Grammar','Fluency','Confidence','Grammar','Confidence','Pronunciation'])[i]] else '{}' end,
      case when s.learner_id = tolu then past_written[i] else 'Good work this week.' end,
      case when s.learner_id = tolu and i = 1 then 48 end,
      public._wat_at(mon - 7 * i + 4, '18:00'), 220 + (random() * 200)::int, public._wat_at(mon - 7 * i + 4, '16:00'),
      case when not (s.learner_id = tolu and i = 1) then public._wat_at(mon - 7 * i + 5, '10:00') end
    from public.submissions s where s.task_id = t;
  end loop;
  -- Dami: last week's feedback from Mr Tunde.
  insert into public.tasks (class_id, title, instructions, response_type, release_at, due_at, created_by)
  values (c_bs, 'Persuade me: the best Nigerian dish', 'Make your case in one minute.', 'video',
    public._wat_at(mon - 5, '09:00'), public._wat_at(mon - 4, '15:00'), tunde)
  returning id into t;
  insert into public.submissions (task_id, learner_id, duration_seconds, submitted_at)
  values (t, dami, 115, public._wat_at(mon - 5, '19:00')) returning id into s;
  insert into public.feedback (submission_id, tutor_id, scores, tags, written, release_at, created_at)
  values (s, tunde, '{"pronunciation":4,"grammar":3,"fluency":4,"confidence":5}', array['Grammar'],
    'Strong opening argument. Use linking words: however, therefore.', public._wat_at(mon - 3, '18:00'), public._wat_at(mon - 3, '15:00'));

  -- ─── placement queue: paid, waiting for a class ───────────────────────────
  for kid in select * from (values
      ('Oluwaseun','Bakare',6,'starter','Mr K. Bakare','2348035550001','Build confidence speaking to adults.', 1, 'card'),
      ('Musa','Abdullahi',7,'beginner','Mrs A. Abdullahi','2348035550002','Reading fluency; mixes up b and d.', 1, 'transfer'),
      ('Adaeze','Nnamdi',10,'intermediate','Dr O. Nnamdi','2348035550003','Public speaking for school debates.', 2, 'card'),
      ('Chioma','Okeke',12,'advanced','Mr C. Okeke (UK)','447700900123','Creative writing and essay structure.', 3, 'usd'),
      ('Fiyin','Ojo',9,'beginner','Mrs B. Ojo','2348035550005','Pronunciation and clear reading.', 0, 'card'),
      ('Ayo','Martins',5,'starter','Mrs T. Martins','2348035550006','Phonics and first words.', 0, 'card')
    ) v(fn, ln, age, lvl, parent, phone, goals, days, how)
  loop
    g := pg_temp.seed_user(null, kid.phone, 'parent', kid.parent, kid.parent);
    update public.profiles set consent_data = true, consent_recordings = true where id = g;
    insert into public.learners (guardian_id, first_name, last_name, age, level, goals, status, consent_data, consent_recordings, created_at)
    values (g, kid.fn, kid.ln, kid.age, kid.lvl::public.learner_level, kid.goals, 'awaiting_placement', true, true,
      now() - ((kid.days + 1) || ' days')::interval - interval '6 hours')
    returning id into l;
    insert into public.subscriptions (learner_id, plan_id, starts_on, ends_on, status, currency)
    values (l, case when kid.how = 'usd' then 'usd' else 'annual' end, current_date, (current_date + interval '12 months')::date, 'active',
      case when kid.how = 'usd' then 'USD' else 'NGN' end)
    returning id into sub;
    insert into public.payments (learner_id, guardian_id, subscription_id, description, amount_minor, currency, method, provider,
      reference, bank, status, sent_at, decided_at, decided_by, bank_alert)
    values (l, g, sub, case when kid.how = 'usd' then 'Diaspora annual' else 'Annual' end,
      case when kid.how = 'usd' then 15000 else 12000000 end, case when kid.how = 'usd' then 'USD' else 'NGN' end,
      case when kid.how = 'transfer' then 'transfer' else 'card' end::public.pay_method,
      case when kid.how = 'transfer' then 'bank' else 'paystack' end,
      'FC-' || upper(kid.fn) || '-' || (1000 + kid.days * 97), case when kid.how = 'transfer' then 'Access' end,
      case when kid.how = 'transfer' then 'approved' else 'auto_verified' end::public.pay_status,
      now() - (kid.days || ' days')::interval - interval '5 hours', now() - (kid.days || ' days')::interval - interval '4 hours',
      case when kid.how = 'transfer' then blessing end, case when kid.how = 'transfer' then 'matched' end::public.bank_alert);
  end loop;
  -- Card payments verified earlier today, for the overview.
  update public.payments set decided_at = now() - interval '2 hours' where reference like 'FC-FIYIN-%' or reference like 'FC-AYO-%';

  -- ─── bank transfers waiting for approval ──────────────────────────────────
  -- Chidi (renewal) and Halima (instalment 2) are in Starlight; Deji and Aisha are new.
  insert into public.subscriptions (learner_id, plan_id, status, balance_minor)
  select id, 'annual', 'pending', 12000000 from public.learners where first_name = 'Chidi' and class_id = c_sr returning id into sub;
  insert into public.payments (learner_id, guardian_id, subscription_id, description, amount_minor, method, provider, reference, bank,
    receipt_path, status, sent_at, bank_alert)
  select l.id, l.guardian_id, sub, 'Annual', 12000000, 'transfer', 'bank', 'FC-CHIDI-2210', 'GTBank', null, 'pending_review',
    public._wat_at(mon, '14:14'), 'matched'
  from public.learners l where l.first_name = 'Chidi' and l.class_id = c_sr;
  insert into public.payments (learner_id, guardian_id, subscription_id, description, amount_minor, method, provider, reference, bank,
    status, sent_at, bank_alert)
  select l.id, l.guardian_id, s2.id, 'Instalment 2 of 3', 4200000, 'transfer', 'bank', 'FC-HALIMA-1187', 'Access', 'pending_review',
    public._wat_at(mon, '18:40'), 'not_found'
  from public.learners l join public.subscriptions s2 on s2.learner_id = l.id where l.first_name = 'Halima' and l.class_id = c_sr;

  g := pg_temp.seed_user(null, '2348035550007', 'parent', 'Bisi Ojo', 'Mrs Bisi Ojo');
  insert into public.learners (guardian_id, first_name, last_name, age, level, goals, consent_data, consent_recordings)
  values (g, 'Deji', 'Ojo', 8, 'beginner', 'Confidence reading aloud.', true, true) returning id into l;
  insert into public.subscriptions (learner_id, plan_id, status, balance_minor) values (l, 'annual', 'pending', 12000000) returning id into sub;
  insert into public.payments (learner_id, guardian_id, subscription_id, description, amount_minor, method, provider, reference, bank, status, sent_at, bank_alert)
  values (l, g, sub, 'Annual', 12000000, 'transfer', 'bank', 'FC-DEJI-3302', 'Zenith', 'pending_review', public._wat_at(mon + 1, '08:05'), 'matched');

  select guardian_id into g from public.learners where first_name = 'Musa' and last_name = 'Abdullahi';
  insert into public.learners (guardian_id, first_name, last_name, age, level, goals, consent_data, consent_recordings)
  values (g, 'Aisha', 'Abdullahi', 10, 'intermediate', 'Speaking in front of the class.', true, true) returning id into l;
  insert into public.subscriptions (learner_id, plan_id, status, balance_minor) values (l, 'annual', 'pending', 12000000) returning id into sub;
  insert into public.payments (learner_id, guardian_id, subscription_id, description, amount_minor, method, provider, reference, bank,
    status, sent_at, bank_alert, bank_alert_amount_minor)
  values (l, g, sub, 'Annual', 12000000, 'transfer', 'bank', 'FC-AISHA-0915', 'UBA', 'pending_review', public._wat_at(mon + 1, '11:20'),
    'amount_differs', 10000000);
  -- A Paystack reversal flagged this morning.
  insert into public.payments (learner_id, guardian_id, description, amount_minor, method, provider, provider_ref, reference, status, sent_at, decided_at)
  select id, guardian_id, 'Annual', 12000000, 'card', 'paystack', 'PSK-88213', 'FC-REV-88213', 'reversed', now() - interval '20 days', now() - interval '5 hours'
  from public.learners where class_id = c_bs order by created_at limit 1;
  -- Tolu's original payment, for the timeline.
  insert into public.payments (learner_id, guardian_id, description, amount_minor, method, provider, reference, status, sent_at, decided_at, created_at)
  select tolu, funmi, 'Annual', 12000000, 'card', 'paystack', 'FC-TOLU-0412', 'auto_verified', s2.starts_on, s2.starts_on, s2.starts_on
  from public.subscriptions s2 where s2.learner_id = tolu;

  -- ─── announcements ────────────────────────────────────────────────────────
  insert into public.announcements (audience, class_id, message, channels, reach, sent_by, sent_at) values
    ('all_parents', null, 'Term 1 report cards arrive ' || to_char(mon + 1, 'FMDD Mon') || '.', array['whatsapp','app'], 540, hassan, public._wat_at(mon - 5, '10:00')),
    ('class', c_bs, 'Debate showcase this Saturday.', array['whatsapp','app'], 15, tunde, public._wat_at(mon - 8, '12:00')),
    ('all_learners', null, 'New: record video straight from the app.', array['app','email'], 612, hassan, public._wat_at(mon - 11, '09:00'));

  -- ─── Mrs Adeyemi's inbox ──────────────────────────────────────────────────
  insert into public.notifications (recipient_id, learner_id, kind, title, body, data, created_at, read_at) values
    (funmi, tolu, 'weekly_summary', 'Tolu’s week 13', '', jsonb_build_object('week', 13, 'live_attended', 1, 'live_total', 2,
      'tasks_submitted', 2, 'tasks_on_time', 2, 'tasks_total', 2, 'scores', '{"fluency":4,"grammar":3}'::jsonb, 'ends_on', mon + 7,
      'missed', 'Sat', 'coming_up', 'Task Mon 9 am · class Sat 5 pm'), public._wat_at(mon - 1, '18:00'), now()),
    (funmi, tolu, 'renewal', 'Renewal · 7 days', 'Tolu’s annual plan ends ' || to_char(mon + 7, 'Dy FMDD Mon') || '. Renew to keep her place in Starlight Readers.',
      jsonb_build_object('amount_minor', 12000000, 'currency', 'NGN', 'learner_id', tolu), public._wat_at(mon, '09:00'), null),
    (funmi, tolu, 'submitted', 'Submitted', 'Tolu sent her video at 7:42 pm. Only you and Ms Adaeze can see it.', '{}', public._wat_at(mon, '19:42'), now()),
    (funmi, tolu, 'new_task', 'New task', '“My favourite food” is open. Due Tue 3 pm.', '{}', public._wat_at(mon, '09:00'), now()),
    (funmi, tolu, 'missed_class', 'Missed class', 'Tolu missed Saturday’s class. Watch the recording before Sunday.', '{}', public._wat_at(mon - 2, '18:20'), now()),
    (funmi, tolu, 'feedback', 'Feedback ready', 'Ms Adaeze left feedback on “The Rain Song”.', '{}', public._wat_at(mon - 3, '18:00'), now());
  insert into public.notifications (recipient_id, announcement_id, kind, title, body, created_at, read_at)
  select funmi, id, 'announcement', 'Announcement', message, sent_at, now() from public.announcements where audience = 'all_parents';
  -- Read receipts for announcements.
  insert into public.notifications (recipient_id, announcement_id, kind, title, body, created_at, read_at)
  select l.guardian_id, a.id, 'announcement', 'Announcement', a.message, a.sent_at, case when random() < 0.8 then a.sent_at + interval '3 hours' end
  from public.announcements a join public.learners l on l.status = 'active' and (a.audience <> 'class' or l.class_id = a.class_id)
  where l.guardian_id <> funmi;

  -- ─── audit trail ──────────────────────────────────────────────────────────
  insert into public.audit_log (at, actor_id, actor_name, actor_role, action, target) values
    (public._wat_at(mon + 1, '13:12'), blessing, 'Blessing A.', 'Customer service', 'Approved payment', 'Mrs K. Bakare · ₦120,000 · Paystack webhook matched'),
    (public._wat_at(mon + 1, '11:40'), ronke, 'Mrs Ronke', 'Lead tutor', 'Placed learner', 'Tomi Ade → Little Voices'),
    (public._wat_at(mon + 1, '09:03'), null, 'System', 'Paystack', 'Reversal flagged', 'Mr O. Uche · ₦120,000 · ref PSK-88213'),
    (public._wat_at(mon, '18:20'), hassan, 'Hassan', 'Owner', 'Changed role', 'Blessing A. · Tutor → Customer service'),
    (public._wat_at(mon, '16:02'), ronke, 'Mrs Ronke', 'Lead tutor', 'Reassigned tutor', 'Word Explorers · Ms Kemi → Ms Ruth'),
    (public._wat_at(mon - 1, '18:15'), adaeze, 'Ms Adaeze', 'Tutor', 'Saved register', 'Starlight Readers · Sun · 2 absent');
  delete from public.audit_log where at > now();
end $seed$;

-- A few WhatsApp messages already delivered, so the outbox isn't empty.
insert into public.outbound_messages (channel, to_address, template, body, status, sent_at, provider_ref)
values ('whatsapp', '2348034127765', 'weekly_summary', 'Tolu’s week 13 summary is in the app.', 'sent', now() - interval '2 days', 'stub-1');
