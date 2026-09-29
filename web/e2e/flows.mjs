// End-to-end click-throughs against the local app and a freshly seeded local
// Supabase (`supabase db reset`). Needs `psql` on PATH and the dev server on :5173.
//   npm run e2e            all scenarios
//   npm run e2e -- tutor   one scenario
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fc-e2e-'));

const base = 'http://127.0.0.1:5173';
const only = process.argv[2];
const sql = (q) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const results = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function scenario(name, fn, viewport = { width: 1360, height: 900 }) {
  if (only && only !== name) return;
  const ctx = await browser.newContext({ viewport, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/CERT|403|favicon/.test(m.text())) errors.push(m.text()); });
  try {
    await fn(page);
    results.push([name, 'PASS', errors.join(' | ')]);
  } catch (e) {
    await page.screenshot({ path: join(tmp, `fail_${name}.png`), fullPage: true }).catch(() => {});
    results.push([name, 'FAIL', String(e.message).split('\n')[0], errors.join(' | ')]);
  }
  await ctx.close();
}

async function as(page, label) {
  await page.goto(base + '/dev');
  await page.getByRole('button', { name: new RegExp('^' + label.replace('.', '\\.')) }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/dev'), { timeout: 20000 });
}
const toast = async (page, re) => page.locator('.toast').filter({ hasText: re }).waitFor({ timeout: 15000 });

await scenario('tutor', async (page) => {
  await as(page, 'Ms Adaeze');
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await page.waitForURL(/review/);
  await page.getByRole('radio', { name: '5' }).first().click();
  await page.getByRole('button', { name: 'Grammar', pressed: false }).click();
  await page.getByLabel(/Written feedback/).fill('Great describing words! Say “I ate”, not “I eated”.');
  await page.getByRole('button', { name: 'Release now' }).click();
  await page.getByRole('button', { name: /Save and next/ }).click();
  await toast(page, /Feedback for .* saved · released now/);
  // Register
  await page.goto(base + '/tutor');
  await page.getByRole('link', { name: 'Attendance' }).click();
  await page.waitForURL(/register\//);
  await page.getByRole('radiogroup', { name: /Tolu attendance/ }).getByRole('button', { name: 'Late' }).click();
  await page.getByRole('button', { name: 'Attach to session' }).click();
  await toast(page, /Recording attached/);
  await page.getByRole('button', { name: /Update register|Save register/ }).click();
  await toast(page, /Register saved/);
  // New task
  await page.goto(base + '/tutor');
  await page.getByRole('link', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: /Picture talk/ }).click();
  await page.getByRole('button', { name: '24 hours' }).click();
  await page.getByRole('button', { name: 'Schedule task' }).click();
  await toast(page, /scheduled for/);
  // Nudge
  await page.getByRole('button', { name: /^Missing/ }).click();
  await page.getByRole('button', { name: 'Nudge parent' }).first().click();
  await toast(page, /WhatsApp reminder sent/);
  // Class note
  await page.getByRole('button', { name: 'Class correction note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('A tip for everyone: use “ate”, not “eated”.');
  await page.getByRole('button', { name: 'Send note' }).click();
  await toast(page, /Note sent to/);
});

await scenario('admin', async (page) => {
  await as(page, 'Hassan');
  await page.getByRole('link', { name: /Placement queue/ }).click();
  await page.getByRole('button', { name: 'Place here' }).first().click();
  await toast(page, /placed in/);
  await page.getByRole('link', { name: /Payment approvals/ }).click();
  await page.getByRole('button', { name: 'Approve payment' }).click();
  await toast(page, /Approved/);
  await page.getByRole('button', { name: /Reject/ }).click();
  await toast(page, /Rejected/);
  await page.getByRole('link', { name: /^Renewals/ }).click();
  await page.getByRole('button', { name: 'Grace' }).first().click();
  await toast(page, /grace period/);
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.getByRole('button', { name: /^Expired/ }).click();
  await page.getByRole('button', { name: 'Renewed' }).first().click();
  await toast(page, /marked renewed/);
  // Learner profile + move
  await page.getByRole('link', { name: 'Learners', exact: true }).click();
  await page.getByLabel('Search learners').fill('Tolu');
  await page.getByRole('link', { name: 'Tolu Adeyemi' }).click();
  await page.getByRole('button', { name: 'Move class' }).click();
  await page.getByRole('button', { name: 'Move learner' }).click();
  await toast(page, /moved to/);
  // Classes: reassign
  await page.getByRole('link', { name: 'Classes', exact: true }).click();
  await page.getByRole('button', { name: 'Mrs Ronke' }).click();
  await toast(page, /now teaches/);
  // Reports
  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('button', { name: 'Term' }).click();
  await page.waitForTimeout(800);
  // Announce
  await page.getByRole('link', { name: 'Announcements' }).click();
  await page.getByLabel('Message').fill('No live class on Sunday (Independence Day weekend). Saturday runs as normal.');
  await page.getByRole('button', { name: 'Send now' }).click();
  await toast(page, /Announcement sent/);
  // Staff
  await page.getByRole('link', { name: 'Staff & roles' }).click();
  await page.waitForTimeout(500);
  // Audit
  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByText('Placed learner').first().waitFor();
});

await scenario('import', async (page) => {
  await as(page, 'Hassan');
  await page.goto(base + '/admin/import');
  const csv = 'Child Name,Age,Parent Name,WhatsApp,WhatsApp Group,Paid Date,Amount,Notes\n' +
    'Bola Ade,8,Mrs K. Ade,08031234567,FC Starlight 2,04/10/2025,120000,shy\n' +
    'Kunle Ade,11,Mrs K. Ade,08031234567,FC Bold Speakers,04/10/2025,120000,debates\n' +
    'Ese Obi,,Mr T. Obi,+2348059876543,Little Voices A,12/01/2026,120000,\n' +
    'Bola Ade,8,Mrs K. Ade,08031234567,FC Starlight 2,04/10/2025,120000,dup\n' +
    'Tolu Adeyemi,8,Funmi Adeyemi,08034127765,FC Starlight 2,04/10/2025,120000,existing\n';
  writeFileSync(join(tmp, 'sheet.csv'), csv);
  await page.locator('input[type=file]').setInputFiles(join(tmp, 'sheet.csv'));
  await page.getByRole('button', { name: 'Check rows' }).click();
  await page.getByText('Possible duplicates').waitFor();
  await page.getByRole('button', { name: /Import \d+ learners/ }).click();
  await page.getByText(/learners imported/).waitFor({ timeout: 30000 });
});

await scenario('learner', async (page) => {
  await as(page, 'Tolu');
  await page.getByRole('button', { name: 'I’ve listened' }).click();
  await page.getByText('Listened — well done!').waitFor();
}, { width: 430, height: 900 });

await scenario('learner-task', async (page) => {
  // Open a new task for Starlight that's live now, so Tolu has something to record.
  sql(`insert into tasks (class_id, title, instructions, steps, response_type, release_at, due_at) select class_id, 'Show and tell: something special', 'Show us something special.', array['Pick something special.','Say what it is.','Say why you like it.'], 'video', now() - interval '1 minute', now() + interval '29 hours' from learners where first_name = 'Tolu' and last_name = 'Adeyemi'`);
  await as(page, 'Tolu');
  const listened = page.getByRole('button', { name: 'I’ve listened' });
  if (await listened.isVisible().catch(() => false)) await listened.click();
  await page.getByRole('button', { name: 'Start task' }).first().click();
  await page.waitForURL(/learn\/task/);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /Send to/ }).waitFor();
  await page.getByRole('button', { name: /Send to/ }).click();
  await page.getByText('Sent!').first().waitFor({ timeout: 30000 });
  const path = sql(`select media_path from submissions s join learners l on l.id = s.learner_id join tasks t on t.id = s.task_id where l.first_name = 'Tolu' and t.title like 'Show and tell%'`);
  if (!path) throw new Error('No submission row');
  const obj = sql(`select count(*) from storage.objects where bucket_id = 'submissions' and name = '${path}'`);
  if (obj !== '1') throw new Error('Upload not in storage: ' + path);
}, { width: 430, height: 900 });

await scenario('pin', async (page) => {
  await as(page, 'Mrs F. Adeyemi');
  await page.getByRole('button', { name: 'Mrs F. Adeyemi' }).click();
  await page.getByRole('button', { name: 'Hand this phone to my child' }).click();
  await page.waitForURL(/\/learn$/);
  await page.getByRole('button', { name: /Dami/ }).click();
  for (const k of ['1', '1', '1', '1']) await page.getByRole('button', { name: k, exact: true }).click();
  await page.getByText('That PIN isn’t right').waitFor();
  for (const k of ['5', '6', '7', '8']) await page.getByRole('button', { name: k, exact: true }).click();
  await page.waitForURL(/learn\/week/);
  await page.getByText('Hi').first().waitFor();
}, { width: 430, height: 900 });

await scenario('signup', async (page) => {
  const phone = '8091230000';
  sql(`delete from auth.users where phone = '234${phone}'`);
  await page.goto(base + '/signup');
  await page.getByLabel('Full name').fill('Kemi Balogun');
  await page.getByLabel('WhatsApp number').fill(phone);
  await page.getByLabel('Email').fill('kemi.b@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('We sent a 6-digit code').waitFor();
  await page.waitForTimeout(500);
  const code = sql(`select data->>'otp' from outbound_messages where to_address = '234${phone}' and template = 'otp' order by created_at desc limit 1`);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByRole('heading', { name: 'Your child' }).waitFor();
  await page.getByLabel('First name').fill('Tayo');
  await page.locator('label.seg-opt', { hasText: 'Starter' }).click();
  await page.getByLabel('4-digit code').fill('2468');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose a plan' }).waitFor();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: 'Bank transfer' }).click();
  await page.getByText(/FC-TAYO-/).waitFor();
  await page.getByRole('button', { name: 'Card · Paystack' }).click();
  await page.getByRole('button', { name: /Pay ₦120,000 with Paystack/ }).click();
  await page.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 20000 });
  const st = sql(`select status from learners where first_name = 'Tayo'`);
  if (st !== 'awaiting_placement') throw new Error('Tayo status ' + st);
  await page.getByRole('button', { name: 'Go to my dashboard' }).click();
  await page.waitForURL(/\/parent/);
  await page.getByText('We’re placing Tayo').waitFor();
}, { width: 430, height: 900 });

await scenario('transfer', async (page) => {
  await as(page, 'Mrs F. Adeyemi');
  await page.goto(base + '/parent/messages');
  await page.getByRole('button', { name: /Pay ₦120,000/ }).click();
  await page.getByRole('heading', { name: 'Pay' }).waitFor();
  await page.getByRole('button', { name: 'Bank transfer' }).click();
  await page.getByText(/FC-TOLU-/).waitFor();
  writeFileSync(join(tmp, 'receipt.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await page.locator('input[type=file]').setInputFiles(join(tmp, 'receipt.png'));
  await page.getByRole('button', { name: 'I’ve sent the transfer' }).click();
  await page.getByRole('heading', { name: 'Transfer received for checking' }).waitFor({ timeout: 20000 });
  const r = sql(`select status || ' ' || coalesce(receipt_path,'') from payments where reference like 'FC-TOLU-%' and method = 'transfer' order by created_at desc limit 1`);
  if (!r.startsWith('pending_review ') || r.length < 20) throw new Error('payment ' + r);
}, { width: 430, height: 900 });

await scenario('roles', async (page) => {
  await as(page, 'Blessing A.');
  await page.getByRole('link', { name: /Payment approvals/ }).waitFor();
  if (await page.getByRole('link', { name: /Placement queue/ }).count()) throw new Error('CS sees placement');
  await page.goto(base + '/admin/placement');
  await page.waitForURL(/\/admin$/);
  await as(page, 'Mrs Ronke');
  if (await page.getByRole('link', { name: /Payment approvals/ }).count()) throw new Error('Lead sees payments');
  await page.getByRole('link', { name: 'Teaching view' }).click();
  await page.waitForURL(/\/tutor\/c\//);
});

for (const r of results) console.log(r.join('  ::  '));
await browser.close();
if (results.some((r) => r[1] === 'FAIL')) { console.log(`Failure screenshots in ${tmp}`); process.exit(1); }
