// Formatting in West Africa Time, the school's timezone.
const TZ = 'Africa/Lagos';

const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(d);

const toDate = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

/** "5 pm", "7:42 pm" */
export function time(v: string | Date): string {
  const d = toDate(v);
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return s.replace(':00', '').replace(' AM', ' am').replace(' PM', ' pm');
}

/** "5:00 pm" — always with minutes. */
export function clock(v: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(toDate(v)).replace(' AM', ' am').replace(' PM', ' pm');
}

/** "Tue" */
export const weekday = (v: string | Date) => parts(toDate(v), { weekday: 'short' });
/** "Tuesday" */
export const weekdayLong = (v: string | Date) => parts(toDate(v), { weekday: 'long' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "29 Sep" */
export const dayMonth = (v: string | Date) => {
  const [d, m] = parts(toDate(v), { day: 'numeric', month: 'numeric' }).split('/');
  return `${+d} ${MONTHS[+m - 1]}`;
};
/** "Tue 29 Sep" */
export const dayDate = (v: string | Date) => `${weekday(v)} ${dayMonth(v)}`;
/** "Tue 3 pm" */
export const dayTime = (v: string | Date) => `${weekday(v)} ${time(v)}`;
/** "Tue 29 Sep, 2:14 pm" */
export const dateTime = (v: string | Date) => `${dayDate(v)}, ${time(v)}`;
/** "4 Oct 2025" */
export const longDate = (v: string | Date) => `${dayMonth(v)} ${parts(toDate(v), { year: 'numeric' })}`;

/** Date-only strings ("2026-10-05") are calendar dates, not instants. */
export const dateOnly = (s: string) => new Date(`${s}T12:00:00+01:00`);

export function money(minor: number | null | undefined, currency = 'NGN'): string {
  const v = (minor ?? 0) / 100;
  const n = v.toLocaleString('en-NG', { maximumFractionDigits: 0 });
  return currency === 'USD' ? `$${n}` : `₦${n}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "29 hours left", "2 h", "Ended 3 days ago" */
export function hoursLeft(v: string | Date): number {
  return Math.floor((toDate(v).getTime() - Date.now()) / 36e5);
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 864e5);
}

export function relativeAgo(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const mins = Math.round((Date.now() - toDate(v).getTime()) / 60000);
  if (mins < 2) return 'Now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export const LEVEL: Record<string, string> = {
  starter: 'Starter', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

export const ROLE: Record<string, string> = {
  owner: 'Owner', lead_tutor: 'Lead tutor', customer_service: 'Customer service', tutor: 'Tutor',
  parent: 'Parent', learner: 'Learner',
};

export const SKILLS = [
  ['pronunciation', 'Pronunciation'],
  ['grammar', 'Grammar'],
  ['fluency', 'Fluency'],
  ['confidence', 'Confidence'],
] as const;

export const firstName = (full: string) => full.split(' ')[0];

export const band = (c: { age_min: number; age_max: number; level: string }) =>
  `Ages ${c.age_min}–${c.age_max} · ${LEVEL[c.level]}`;

export const shortBand = (c: { age_min: number; age_max: number; level: string }) =>
  `${c.age_min}–${c.age_max} · ${LEVEL[c.level]}`;

/** "Grammar 3" from the lowest rubric score, the thing to work on. */
export function focusTag(scores: Record<string, number> | null | undefined, tags?: string[]): string | null {
  if (!scores || Object.keys(scores).length === 0) return null;
  if (tags?.length) {
    const key = tags[0].toLowerCase();
    if (scores[key] != null) return `${tags[0]} ${scores[key]}`;
  }
  const [k, v] = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  return `${k[0].toUpperCase()}${k.slice(1)} ${v}`;
}

/** Mirrors public._correction_release: 6 pm WAT on the first Tue/Fri on or after the deadline. */
export function correctionRelease(dueAt: string): Date {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(dueAt));
  const d = new Date(`${iso}T18:00:00+01:00`);
  const dow = ((d.getUTCDay() + 6) % 7) + 1; // 1 = Mon … 7 = Sun
  const target = dow <= 2 ? 2 : dow <= 5 ? 5 : 9;
  return new Date(d.getTime() + (target - dow) * 864e5);
}

/** "today", "tomorrow" or "Friday", relative to now in WAT. */
export function whenDay(v: string | Date): string {
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(x);
  const d = toDate(v);
  if (key(d) === key(new Date())) return 'today';
  if (key(d) === key(new Date(Date.now() + 864e5))) return 'tomorrow';
  return weekdayLong(d);
}

export const initials =(name: string) => name.trim()[0]?.toUpperCase() ?? '?';
