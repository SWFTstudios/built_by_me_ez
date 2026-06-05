/**
 * Built By Me EZ — Package Booking Worker
 *
 * Endpoints:
 *   POST /webhook/stripe  — Stripe checkout.session.completed
 *   POST /webhook/cal     — Cal.com BOOKING_CREATED (decrements credit)
 *   GET  /validate        — ?token=TOKEN  → session info for booking portal
 *   POST /resend-link     — {email} → re-emails the booking link
 *   POST /save-lead       — saves interest lead to Airtable (client FormSubmit handles user email)
 *
 * KV keys:
 *   credits:{email}   → { packageSlug, calSlug, label, total, used, token, paidAt }
 *   token:{token}     → { email }
 *
 * Required environment bindings (set via Cloudflare dashboard or wrangler):
 *   CREDITS_KV            — KV namespace
 *   STRIPE_WEBHOOK_SECRET — whsec_... from Stripe dashboard
 *   SITE_URL              — e.g. https://builtbymeez.com
 *   FORM_SUBMIT_EMAIL     — builtbymeez1@gmail.com (wrangler.toml [vars])
 *   CAL_USERNAME          — e.g. omar-ndiaye-illqmu
 *   AIRTABLE_API_KEY      — personal access token (pat...) from airtable.com/create/tokens
 *   AIRTABLE_BASE_ID      — set in wrangler.toml [vars]
 *   AIRTABLE_TABLE_ID     — set in wrangler.toml [vars]
 */

const ALLOWED_ORIGINS = [
  'https://builtbymeez.com',
  'https://builtbymeez-website.pages.dev',
  'https://customer-onboarding-flow-upd.builtbymeez-website.pages.dev',
];

const PACKAGES = {
  '8-session-1-1':  { sessions: 8,  calSlug: '8-session-training-package',      label: '8-Session 1:1 Training' },
  '12-session-1-1': { sessions: 12, calSlug: '12-session-1-1-training-package', label: '12-Session 1:1 Training' },
  '16-session-1-1': { sessions: 16, calSlug: '16-session-package',              label: '16-Session 1:1 Training' },
  '8-session-semi': { sessions: 8,  calSlug: '8-session-semi-private-package',  label: '8-Session Semi-Private' },
  '12-session-semi':{ sessions: 12, calSlug: '12-session-semi-private-package', label: '12-Session Semi-Private' },
  '16-session-semi':{ sessions: 16, calSlug: '16-session-semi-private-package', label: '16-Session Semi-Private' },
};

// Unambiguous amount (cents) → package slug fallback when client_reference_id is missing.
// $700 maps to two packages so it's excluded here — metadata is required for those.
const AMOUNT_TO_PACKAGE = {
  47500: '8-session-1-1',
  95000: '16-session-1-1',
  40000: '8-session-semi',
  55000: '12-session-semi',
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const siteUrl = env.SITE_URL || 'https://builtbymeez.com';
  let allowOrigin = siteUrl;
  if (ALLOWED_ORIGINS.includes(origin)) {
    allowOrigin = origin;
  } else if (origin.endsWith('.builtbymeez-website.pages.dev')) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
        return handleStripeWebhook(request, env, cors);
      }
      if (url.pathname === '/webhook/cal' && request.method === 'POST') {
        return handleCalWebhook(request, env, cors);
      }
      if (url.pathname === '/validate' && request.method === 'GET') {
        return handleValidate(request, env, cors);
      }
      if (url.pathname === '/resend-link' && request.method === 'POST') {
        return handleResendLink(request, env, cors);
      }
      if (url.pathname === '/save-lead' && request.method === 'POST') {
        return handleSaveLead(request, env, cors);
      }
      return new Response('Not found', { status: 404, headers: cors });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal server error', { status: 500, headers: cors });
    }
  },
};

// ---------------------------------------------------------------------------
// Stripe webhook
// ---------------------------------------------------------------------------

async function handleStripeWebhook(request, env, cors) {
  const rawBody = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature') || '';

  try {
    await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe signature error:', err.message);
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const event = JSON.parse(rawBody);
  if (event.type !== 'checkout.session.completed') {
    return new Response('OK', { status: 200, headers: cors });
  }

  const session = event.data.object;
  const email = session.customer_details?.email?.toLowerCase().trim();
  if (!email) {
    console.error('No email in checkout session', session.id);
    return new Response('OK', { status: 200, headers: cors });
  }

  // Resolve package: prefer client_reference_id (set via URL param on the payment link),
  // then metadata.package_slug, then amount fallback.
  const ref = session.client_reference_id || session.metadata?.package_slug;
  const packageSlug = ref && PACKAGES[ref]
    ? ref
    : AMOUNT_TO_PACKAGE[session.amount_total];

  if (!packageSlug) {
    console.error(`Cannot resolve package for amount ${session.amount_total} / ref "${ref}"`);
    return new Response('OK', { status: 200, headers: cors });
  }

  const pkg = PACKAGES[packageSlug];
  const token = generateToken();
  const paidAt = new Date().toISOString();

  const creditsKey = `credits:${email}`;
  const tokenKey = `token:${token}`;

  const record = {
    packageSlug,
    calSlug: pkg.calSlug,
    label: pkg.label,
    total: pkg.sessions,
    used: 0,
    token,
    paidAt,
    stripeSessionId: session.id,
  };

  await Promise.all([
    env.CREDITS_KV.put(creditsKey, JSON.stringify(record)),
    env.CREDITS_KV.put(tokenKey, JSON.stringify({ email }), { expirationTtl: 60 * 60 * 24 * 365 }),
  ]);

  const bookingUrl = `${getSiteUrl(env)}/book-sessions.html?token=${token}`;
  await sendPackageBookingEmail(env, email, pkg, bookingUrl);

  return new Response('OK', { status: 200, headers: cors });
}

// ---------------------------------------------------------------------------
// Cal.com webhook (decrement credit when a session is booked)
// ---------------------------------------------------------------------------

async function handleCalWebhook(request, env, cors) {
  const body = await request.json();

  // Cal.com sends triggerEvent = "BOOKING_CREATED"
  if (body.triggerEvent !== 'BOOKING_CREATED') {
    return new Response('OK', { status: 200, headers: cors });
  }

  const attendeeEmail = body.payload?.attendees?.[0]?.email?.toLowerCase().trim();
  if (!attendeeEmail) {
    return new Response('OK', { status: 200, headers: cors });
  }

  const creditsKey = `credits:${attendeeEmail}`;
  const raw = await env.CREDITS_KV.get(creditsKey);
  if (!raw) {
    return new Response('OK', { status: 200, headers: cors });
  }

  const record = JSON.parse(raw);
  if (record.used < record.total) {
    record.used += 1;
    await env.CREDITS_KV.put(creditsKey, JSON.stringify(record));
  }

  return new Response('OK', { status: 200, headers: cors });
}

// ---------------------------------------------------------------------------
// Validate token (called by book-sessions.html)
// ---------------------------------------------------------------------------

async function handleValidate(request, env, cors) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ valid: false, error: 'Missing token' }, 400, cors);
  }

  const tokenRaw = await env.CREDITS_KV.get(`token:${token}`);
  if (!tokenRaw) {
    return jsonResponse({ valid: false, error: 'Invalid or expired token' }, 404, cors);
  }

  const { email } = JSON.parse(tokenRaw);
  const creditsRaw = await env.CREDITS_KV.get(`credits:${email}`);
  if (!creditsRaw) {
    return jsonResponse({ valid: false, error: 'No credits found for this token' }, 404, cors);
  }

  const record = JSON.parse(creditsRaw);
  const calUsername = env.CAL_USERNAME || 'omar-ndiaye-illqmu';

  return jsonResponse({
    valid: true,
    email,
    label: record.label,
    calLink: `${calUsername}/${record.calSlug}`,
    total: record.total,
    used: record.used,
    remaining: record.total - record.used,
    paidAt: record.paidAt,
  }, 200, cors);
}

// ---------------------------------------------------------------------------
// Resend booking link (if client lost their email)
// ---------------------------------------------------------------------------

async function handleResendLink(request, env, cors) {
  const { email: rawEmail } = await request.json();
  const email = rawEmail?.toLowerCase().trim();
  if (!email) {
    return jsonResponse({ ok: false, error: 'Email required' }, 400, cors);
  }

  const creditsRaw = await env.CREDITS_KV.get(`credits:${email}`);
  if (!creditsRaw) {
    // Don't reveal whether the email exists
    return jsonResponse({ ok: true }, 200, cors);
  }

  const record = JSON.parse(creditsRaw);
  const pkg = PACKAGES[record.packageSlug];
  const bookingUrl = `${getSiteUrl(env)}/book-sessions.html?token=${record.token}`;
  await sendPackageBookingEmail(env, email, pkg, bookingUrl, 'Booking link resend');

  return jsonResponse({ ok: true }, 200, cors);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) throw new Error('Malformed Stripe-Signature header');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== sig) throw new Error('Signature mismatch');

  // Reject if older than 5 minutes to prevent replay attacks
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) throw new Error('Timestamp too old');
}

function getSiteUrl(env) {
  return (env.SITE_URL || 'https://builtbymeez.com').replace(/\/$/, '');
}

async function sendFormSubmit(env, { subject, fields, cc }) {
  const formEmail = env.FORM_SUBMIT_EMAIL || 'builtbymeez1@gmail.com';
  const body = {
    _subject: subject,
    _template: 'table',
    _captcha: 'false',
    ...fields,
  };
  if (cc) body._cc = cc;

  try {
    const res = await fetch(`https://formsubmit.co/ajax/${formEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('FormSubmit error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('FormSubmit error:', err);
  }
}

async function sendPackageBookingEmail(env, clientEmail, pkg, bookingUrl, typeLabel) {
  await sendFormSubmit(env, {
    subject: typeLabel || `New package sale: ${pkg.label}`,
    cc: clientEmail,
    fields: {
      email: clientEmail,
      package: pkg.label,
      sessions: String(pkg.sessions),
      booking_url: bookingUrl,
      type: typeLabel || 'Package purchase',
      message: `Booking link for customer: ${bookingUrl}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Save lead (date-interest form → Airtable + user confirmation email)
// ---------------------------------------------------------------------------

async function handleSaveLead(request, env, cors) {
  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  if (!email) {
    return jsonResponse({ ok: false, error: 'Email required' }, 400, cors);
  }

  await saveLeadToAirtable(env, body);

  return jsonResponse({ ok: true }, 200, cors);
}

async function saveLeadToAirtable(env, { name, email, package_label, ideal_dates }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_ID) {
    console.log('[AIRTABLE SKIP] Missing credentials — lead not saved:', email);
    return;
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            Name:          name || 'Not provided',
            Email:         email,
            Package:       package_label || '',
            Stage:         'Potential',
            'Ideal Dates': Array.isArray(ideal_dates) ? ideal_dates.join('\n') : (ideal_dates || ''),
            Source:        'Website — Date Interest Form',
            'Submitted At': new Date().toISOString(),
          },
        }],
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Airtable save-lead error:', err);
  }
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
