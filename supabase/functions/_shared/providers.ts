// External services sit behind small interfaces. Each has a development stub
// (the default) and a real adapter that is used once its secret is set:
//
//   WhatsApp   WHATSAPP_TOKEN + WHATSAPP_PHONE_ID   (Meta WhatsApp Cloud API)
//   Email      RESEND_API_KEY + EMAIL_FROM
//   Payments   PAYSTACK_SECRET_KEY
//   Zoom       ZOOM_ACCOUNT_ID + ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET
//
// Set PROVIDERS=stub to force stubs even when secrets are present.

const env = (k: string) => Deno.env.get(k) ?? '';
const forceStub = () => env('PROVIDERS') === 'stub';

// ─── messaging ──────────────────────────────────────────────────────────────
export interface OutboundMessage {
  channel: 'whatsapp' | 'email' | 'sms';
  to: string;
  template: string;
  body: string;
  data: Record<string, unknown>;
}

export interface MessagingProvider {
  name: string;
  send(msg: OutboundMessage): Promise<{ providerRef: string }>;
}

const stubMessaging: MessagingProvider = {
  name: 'stub',
  async send(msg) {
    console.log(`[stub ${msg.channel}] → ${msg.to} (${msg.template}): ${msg.body}`);
    return { providerRef: `stub-${crypto.randomUUID()}` };
  },
};

const whatsappCloud: MessagingProvider = {
  name: 'whatsapp-cloud',
  async send(msg) {
    // Business-initiated messages need approved templates; the template name
    // matches outbound_messages.template and the body goes in as parameter 1.
    const res = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_ID')}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to,
        type: 'template',
        template: {
          name: msg.template,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: msg.body }] }],
        },
      }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out?.error?.message ?? `WhatsApp error ${res.status}`);
    return { providerRef: out.messages?.[0]?.id ?? '' };
  },
};

const resendEmail: MessagingProvider = {
  name: 'resend',
  async send(msg) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: msg.to, subject: 'Flying Colours', text: msg.body }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out?.message ?? `Email error ${res.status}`);
    return { providerRef: out.id ?? '' };
  },
};

export function messagingFor(channel: OutboundMessage['channel']): MessagingProvider {
  if (forceStub()) return stubMessaging;
  if (channel === 'whatsapp' && env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID')) return whatsappCloud;
  if (channel === 'email' && env('RESEND_API_KEY') && env('EMAIL_FROM')) return resendEmail;
  return stubMessaging;
}

// ─── payments ───────────────────────────────────────────────────────────────
export interface PaymentsProvider {
  name: 'stub' | 'paystack';
  /** Returns a checkout URL, or null when the stub completes in place. */
  initialize(p: { reference: string; amountMinor: number; currency: string; email: string; callbackUrl: string })
    : Promise<{ authorizationUrl: string | null }>;
  verify(reference: string): Promise<{ ok: boolean; providerRef: string; amountMinor: number }>;
  /** Checks a webhook's signature header against the raw body. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<boolean>;
}

const stubPayments: PaymentsProvider = {
  name: 'stub',
  async initialize() {
    return { authorizationUrl: null };
  },
  async verify(reference) {
    return { ok: true, providerRef: `stub-${reference}`, amountMinor: -1 };
  },
  async verifyWebhook() {
    return false;
  },
};

const paystack: PaymentsProvider = {
  name: 'paystack',
  async initialize({ reference, amountMinor, currency, email, callbackUrl }) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, amount: amountMinor, currency, email, callback_url: callbackUrl }),
    });
    const out = await res.json();
    if (!out.status) throw new Error(out.message ?? 'Paystack could not start the payment');
    return { authorizationUrl: out.data.authorization_url };
  },
  async verify(reference) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}` },
    });
    const out = await res.json();
    return { ok: out.data?.status === 'success', providerRef: String(out.data?.id ?? ''), amountMinor: out.data?.amount ?? 0 };
  },
  async verifyWebhook(rawBody, signature) {
    if (!signature) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('PAYSTACK_SECRET_KEY')),
      { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === signature;
  },
};

export function payments(): PaymentsProvider {
  return !forceStub() && env('PAYSTACK_SECRET_KEY') ? paystack : stubPayments;
}

// ─── class recordings ───────────────────────────────────────────────────────
export interface RecordingsProvider {
  name: string;
  /** Finds the cloud recording for a meeting that ran around `startsAt`. */
  find(p: { zoomUrl: string | null; startsAt: string; endsAt: string }): Promise<{ url: string; minutes: number } | null>;
}

const stubRecordings: RecordingsProvider = {
  name: 'stub',
  async find({ startsAt, endsAt }) {
    if (new Date(endsAt) > new Date()) return null;
    const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000) - 2;
    return { url: `https://zoom.us/rec/share/stub-${new Date(startsAt).getTime().toString(36)}`, minutes };
  },
};

const zoom: RecordingsProvider = {
  name: 'zoom',
  async find({ zoomUrl, startsAt }) {
    const meetingId = zoomUrl?.match(/j\/([\d ]+)/)?.[1]?.replace(/\s/g, '');
    if (!meetingId) return null;
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${env('ZOOM_ACCOUNT_ID')}`,
      { method: 'POST', headers: { Authorization: `Basic ${btoa(`${env('ZOOM_CLIENT_ID')}:${env('ZOOM_CLIENT_SECRET')}`)}` } },
    );
    const { access_token } = await tokenRes.json();
    const day = startsAt.slice(0, 10);
    const res = await fetch(`https://api.zoom.us/v2/users/me/recordings?from=${day}&to=${day}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const out = await res.json();
    const m = (out.meetings ?? []).find((x: { id: number }) => String(x.id) === meetingId);
    return m ? { url: m.share_url, minutes: m.duration } : null;
  },
};

export function recordings(): RecordingsProvider {
  return !forceStub() && env('ZOOM_CLIENT_ID') ? zoom : stubRecordings;
}
