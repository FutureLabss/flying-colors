# Flying Colours

Flying Colours is a communication and English school for children aged 5–13. This app replaces the WhatsApp groups and spreadsheets the school runs on today: parents enrol and pay, children submit video tasks and hear feedback, tutors review work and take registers, and office staff place learners, approve payments and follow up renewals.

It implements the **Flying Colours Prototype v2** design from Claude Design. The original handoff (prototype HTML, design-system files and the design chat) is kept in [`project/`](project/), [`chats/`](chats/) and [`HANDOFF.md`](HANDOFF.md).

| | |
|---|---|
| **Frontend** | [`web/`](web/): React 19, Vite, TypeScript, TanStack Query, React Router |
| **Backend** | [`supabase/`](supabase/): Postgres with row-level security, SQL RPCs, Auth, Storage, Edge Functions (Deno) |
| **Integrations** | WhatsApp, email, Paystack and Zoom sit behind interfaces with development stubs ([`functions/_shared/providers.ts`](supabase/functions/_shared/providers.ts)) |

## Run it locally

You need Node 20+, Docker and `psql` (the last one only for the e2e suite).

```sh
npm install                 # installs the Supabase CLI
npm --prefix web install
npm run db:start            # starts local Supabase, applies migrations and seed.sql
npm run functions           # in a second terminal: serves the edge functions
npm run dev                 # in a third terminal: http://localhost:5173
```

In development, open **http://localhost:5173/dev** for one-click sign-in as each demo account:

| Account | How to sign in |
|---|---|
| Mrs F. Adeyemi (parent of Tolu and Dami) | WhatsApp `+234 803 412 7765`, code `482913` |
| Tolu / Dami (learners) | PIN `1234` / `5678`, on a device a parent has set up |
| Hassan (owner) | `hassan@flyingcolours.test` / `flyingcolours` |
| Mrs Ronke (lead tutor) | `ronke@flyingcolours.test` / `flyingcolours` |
| Blessing A. (customer service) | `blessing@flyingcolours.test` / `flyingcolours` |
| Ms Adaeze (tutor, Starlight Readers) | `adaeze@flyingcolours.test` / `flyingcolours` |

The seed is anchored to the **current week** in West Africa Time. Monday's task is being corrected and Wednesday's is scheduled, so the demo always looks like "this week". Run `npm run db:reset` to start over.

OTP codes for any other phone number go to the `outbound_messages` table (the WhatsApp outbox), which you can read with `psql` or Studio.

## Screens

| Role | Route | Screen |
|---|---|---|
| Parent (mobile) | `/signin` | WhatsApp number and 6-digit code |
| | `/signup` | Enrol: guardian → child → plan → pay (Paystack card or bank transfer with receipt) → confirmation. `?add=1` adds a child; `?renew=<learner>` renews |
| | `/parent` | Home: tabs per child, the week, task status, latest feedback, next class, attendance, renewal card |
| | `/parent/progress` | Rubric trends over 8 weeks and feedback history |
| | `/parent/messages` | Weekly summary, renewal reminders and alerts |
| Learner (mobile) | `/learn` | "Who's learning?" and PIN pad |
| | `/learn/week` | This week: feedback voice note (the task stays locked until it's heard), task, live class |
| | `/learn/task/:id` | Record (camera or mic), review, then a resumable upload with progress; photo and text answers too |
| Tutor (desktop) | `/tutor/c/:class` | Week strip and review queue with filters, nudge parent, class correction note |
| | `…/review/:submission` | Video, learner history for handover, rubric, focus tags, voice note, release time, save and next |
| | `…/register/:session` | Attendance register, attach the Zoom recording |
| | `…/tasks/new` | Task from the curriculum bank: answer type, release slot, deadline, learner preview |
| | `…/learners[/:id]` | Class roster and read-only learner profile |
| Office (desktop) | `/admin` | Overview: KPIs, what needs action, classes this week |
| | `/admin/placement` | Paid learners → suggested classes with seat limits, waitlist, undo |
| | `/admin/payments` | Bank-transfer approvals with receipt and bank-alert match |
| | `/admin/renewals` | Expiring / expired / arrears, with outcome renewed, grace or exit, and undo |
| | `/admin/learners[/:id]` | Search, and the profile with full timeline, move class and edit |
| | `/admin/classes` | Classes, tutor reassignment, create and edit |
| | `/admin/reports` | Pilot success metrics, submission and attendance by class, CSV export |
| | `/admin/announcements` | Broadcast to a class, all learners or all parents over WhatsApp, in-app and email |
| | `/admin/import` | One-time CSV import of the legacy sheet: map, check duplicates, import |
| | `/admin/staff` | Staff, roles, invites, capability matrix |
| | `/admin/audit` | Audit log of placements, payments, renewals, moves and role changes |

What each role sees follows the prototype's capability table. Owner sees everything. The lead tutor handles placement, classes and all teaching. Customer service handles payments and renewals. Tutors see only their own classes. Navigation hides what a role can't use, and the database enforces the same rules again.

## How the backend fits together

- **Reads** go through row-level security ([`20260929000002_security.sql`](supabase/migrations/20260929000002_security.sql)). A parent sees only their children, a tutor only their classes. History follows a learner when they move class. Summary RPCs for whole screens (`parent_home`, `learner_week`, `tutor_queue`, `learner_timeline`) run as the caller, so they can't reveal more than the tables do.
- **Writes** are all security-definer RPCs ([`20260929000003_rpc.sql`](supabase/migrations/20260929000003_rpc.sql)). No table grants insert, update or delete to signed-in users. Each RPC checks the caller's role, writes the audit log where it matters, and queues notifications: an in-app inbox row plus a WhatsApp outbox row.
- **Scheduled messages**: feedback releases at 6 pm WAT on the next correction day (Tue or Fri). The inbox hides rows until their `created_at`, and the outbox holds WhatsApp messages until `send_after`. `pg_cron` runs the renewal reminders (7 days, 3 days, on expiry) and the Sunday weekly summary.
- **Auth**
  - Parents use phone OTP. A Supabase Auth *send SMS* hook writes the code to the WhatsApp outbox.
  - Staff use email and password.
  - Children don't have credentials of their own. A parent registers the device (`learner-auth` issues a signed device token). On that device a child picks their name and types a PIN, which is bcrypt-hashed and locks after 5 wrong tries. The edge function then mints a session for the child's password-less account.
- **Storage**: private buckets for submissions, voice notes, receipts and task attachments, served through 15-minute signed URLs. Video uploads use TUS, so a dropped connection resumes where it stopped.

## Integrations

Every provider defaults to a stub that logs and succeeds. Set the secrets (`supabase/functions/.env` locally, `supabase secrets set` in production) to switch one to the real service:

| Service | Secrets | Stub behaviour |
|---|---|---|
| WhatsApp (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | `dispatch-messages` logs each message and marks it sent |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | Same as WhatsApp |
| Paystack | `PAYSTACK_SECRET_KEY` | Checkout completes at once. The real adapter redirects to Paystack, verifies on return, and `paystack-webhook` checks the HMAC signature |
| Zoom recordings | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Makes up a recording link for sessions that have ended |

See [`supabase/functions/.env.example`](supabase/functions/.env.example). Before going live:

- register WhatsApp message templates whose names match `outbound_messages.template`;
- schedule `dispatch-messages` to run every minute (pg_cron + pg_net, or an external cron);
- set `LEARNER_DEVICE_SECRET`.

## Checks

```sh
npm --prefix web run typecheck
npm --prefix web run lint
npm run db:reset && npm run e2e      # needs the dev server and functions running
```

The e2e suite ([`web/e2e/flows.mjs`](web/e2e/flows.mjs)) drives nine real flows against the seeded database:

- a tutor reviews, saves a register, schedules a task, nudges a parent and sends a class note;
- the owner places a learner, approves and rejects payments, sets and undoes renewal outcomes, moves a learner, reassigns a tutor and sends an announcement;
- the CSV import;
- a learner hears feedback, records a video with the browser's fake camera and uploads it;
- PIN sign-in;
- a full parent sign-up with OTP and card payment;
- a bank transfer with a receipt;
- role restrictions.

## Differences from the prototype

- The prototype's dark role and screen switcher bar is a design-tool device and isn't in the app. `/dev` replaces it for demos.
- Sign-up checks the WhatsApp number with a code in step 1, and step 2 can set the child's PIN. The prototype skipped both.
- The prototype's placeholder buttons now work: edit profile, new and edit class, invite staff, add attachment, class correction note, learners list, export CSV.
- The import accepts CSV (Google Sheets: *File → Download → CSV*). XLSX isn't supported yet.
- Staff two-factor sign-in is shown on the Staff screen, but enforcing it (Supabase MFA) isn't built yet.
